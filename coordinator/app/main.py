"""
Thicket Coordinator — the off-chain brain of the hybrid DePIN loop.

  1. Register nodes (verify EIP-191 signature + on-chain bond).
  2. Accrue "contribution minutes" per wallet from signed heartbeats.
  3. Issue random verifiable challenges; void earnings / slash on failure.
  4. Settle epochs on a schedule: build a cumulative Merkle root and publish it.

State is persisted (SQLite locally, Postgres in prod) so restarts don't lose
data and the service can be hosted. Epoch settlement runs on a scheduler.
"""
from __future__ import annotations

import os
import secrets
import time

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import quorum as qm
from . import signing
from .challenge import make_challenge, verify as verify_challenge
from .db import (Batch, Counter, Delegation, Job, Node, Quorum, QuorumResult,
                 SessionLocal, init_db)
from .epoch import (EPOCH_SECONDS, OPERATOR_COMMISSION, REWARD_PER_MINUTE, chain_bridge,
                    close_epoch, current_claims, last_publish, schedule, start_scheduler,
                    sync_delegations)

app = FastAPI(title="Thicket Coordinator", version="0.3.0")

_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- config ---
HEARTBEAT_TIMEOUT_S = int(os.getenv("HEARTBEAT_TIMEOUT_S", "90"))
CHALLENGE_INTERVAL_S = int(os.getenv("CHALLENGE_INTERVAL_S", "600"))
CHALLENGE_SIZE = int(os.getenv("CHALLENGE_SIZE", "128"))
MAX_FAILS_BEFORE_SLASH = int(os.getenv("MAX_FAILS_BEFORE_SLASH", "3"))
SLASH_AMOUNT_WEI = int(float(os.getenv("SLASH_AMOUNT_THKT", "100")) * 10**18)
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
# --- pricing ---------------------------------------------------------------
# Work is priced by how much compute it actually costs a node: a one-line prompt
# and a 50-page document are not the same job. Buyers are quoted before paying.
COMPUTE_BASE_THKT = float(os.getenv("COMPUTE_BASE_THKT", "5"))        # per-job overhead
COMPUTE_PER_1K_CHARS = float(os.getenv("COMPUTE_PER_1K_CHARS", "2"))  # input size
COMPUTE_VISION_THKT = float(os.getenv("COMPUTE_VISION_THKT", "4"))    # image base
# Measured, not assumed: llava resizes every image to a fixed 336x336 grid, so
# 0.02MP and 9.44MP both cost exactly 589 input tokens and the same wall time.
# Charging per megapixel billed a 7.2x price range for identical work, so the
# term defaults to 0. It stays configurable because it *is* the right model for
# a tiling encoder (GPT-4V, Qwen2-VL) — set it if the network runs one.
COMPUTE_PER_MP_THKT = float(os.getenv("COMPUTE_PER_MP_THKT", "0"))    # per megapixel
COMPUTE_PRICE_THKT = COMPUTE_BASE_THKT                                # legacy floor
JOB_ASSIGN_TIMEOUT_S = int(os.getenv("JOB_ASSIGN_TIMEOUT_S", "180"))  # requeue if unfinished
JOBS_PER_HEARTBEAT = int(os.getenv("JOBS_PER_HEARTBEAT", "4"))       # fan-out per node per beat
MAX_BATCH_ITEMS = int(os.getenv("MAX_BATCH_ITEMS", "1000"))
# The largest input a node can actually read. Nodes size their context window to
# the job (node/thicket_node/runtime.py::_fit_context) up to THICKET_MAX_CTX
# tokens; beyond that the tail would be silently dropped. Refusing the job is the
# honest response — taking payment for a document we'd bin 85% of is not. Keep
# this in step with the nodes' THICKET_MAX_CTX (32768 tokens ~ 95k chars).
MAX_PROMPT_CHARS = int(os.getenv("COMPUTE_MAX_CHARS", "95000"))
# --- verification ----------------------------------------------------------
# A sampled share of paid work runs on k nodes at once and is settled by
# majority (see quorum.py). Buyers are charged the normal single price for a
# spot-checked job: operator rewards are uptime-based, so redundancy costs the
# network compute but costs the pool nothing extra.
QUORUM_K = qm.QUORUM_K
# --- operator rewards ------------------------------------------------------
# Two components. Uptime pays for *availability* — a node has to be worth
# running before any work arrives, so this can't be zero. Work pays a share of
# what the buyer actually paid for that job.
#
# Revenue share rather than an independent per-work-unit rate, because the pool
# is finite (350M, transferred not minted) and an independent rate is an
# unbounded claim on it: emission would scale with demand and nothing caps it.
# Tying the payout to money that actually came in makes the pool a subsidy
# buffer instead of the source, and the economy closes.
#
# NOTE: REWARD_PER_MINUTE still defaults to 1.0 — deliberately unchanged, so no
# operator earning today is suddenly worse off. At 1 THKT/min uptime dwarfs work
# (60 THKT/hr against ~3.5 THKT for a typical job), so it needs lowering before
# work rewards mean much. That's an economic decision, not a code one.
OPERATOR_REVENUE_SHARE = float(os.getenv("OPERATOR_REVENUE_SHARE", "0.7"))
# When k nodes agree on one job the buyer still paid once, so the operator share
# is split between them rather than paid in full to each. Nodes are never told
# which jobs are cross-checked, so there's nothing to dodge.
QUORUM_SPLIT_REWARD = os.getenv("QUORUM_SPLIT_REWARD", "1").lower() not in ("0", "false", "no")

chain = chain_bridge()


def sweep_quorums() -> int:
    """Settle quorums whose deadline has passed. Heartbeats do this too, but a
    quorum whose selected nodes all went offline would otherwise sit open
    forever and strand the buyer's job."""
    settled = 0
    db = SessionLocal()
    try:
        for q in qm.due_quorums(db):
            settle_quorum(db, q)
            settled += 1
        db.commit()
    finally:
        db.close()
    return settled


@app.on_event("startup")
def _startup():
    init_db()
    start_scheduler()
    schedule(sweep_quorums, qm.QUORUM_DEADLINE_S, "sweep_quorums")
    schedule(refresh_gas_cache, _GAS_REFRESH_S, "refresh_gas")
    schedule(refresh_pool_cache, _POOL_REFRESH_S, "refresh_pool")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def bump_tasks(db: Session, n: int = 1) -> None:
    """Increment the cumulative 'tasks executed' counter (challenges + jobs)."""
    c = db.get(Counter, "tasks")
    if not c:
        c = Counter(name="tasks", value=0)
        db.add(c)
    c.value += n


class RegisterReq(BaseModel):
    address: str
    node_id: str
    signature: str
    capabilities: list[str] = []      # e.g. ["text", "vision"]


class HeartbeatReq(BaseModel):
    address: str
    timestamp: int
    signature: str


class ChallengeResultReq(BaseModel):
    address: str
    challenge_id: str
    output_hash: str


# Gas runway is two RPC round-trips. It is refreshed on the scheduler and only
# ever *read* from here — a cache filled inside the request path is a cache that
# several concurrent requests can miss at once, and they then all sit blocking
# on the RPC while holding a worker thread each. /health has to answer even when
# the chain is unreachable, so it must do no I/O of its own.
_GAS_REFRESH_S = 60
_gas_cache: dict = {"at": 0.0, "balance": 0.0, "cost": 0.0}


def refresh_gas_cache() -> None:
    """Scheduler job: read the publisher's balance and the current gas price."""
    try:
        _gas_cache.update(at=time.time(), balance=chain.gas_balance(),
                          cost=chain.publish_cost())
    except Exception:  # noqa: BLE001 — a stale reading beats a dead health check
        pass


# chain.pool_balance() is an eth_call, and /stats is polled every few seconds by
# the portal and the node page. Refreshed on the scheduler like the gas reading,
# with one lazy first fill so a freshly restarted process doesn't report a pool
# of zero until the first tick.
_POOL_REFRESH_S = 30
_pool_cache: dict = {"at": 0.0, "value": 0.0}

# /nodes is a public page that every visitor polls. Building its row set means
# reading every node and aggregating the whole quorum_results table, so without
# this each visitor would pay for a full scan and hold a connection while doing
# it — the shape of load that already saturated this service once today. One
# build is shared by everyone for NODES_TTL_S; the numbers move on a 60s epoch
# anyway, so nothing meaningful is lost.
NODES_TTL_S = float(os.getenv("NODES_TTL_S", "10"))
_nodes_cache: dict = {"at": 0.0, "rows": None, "totals": None}


def refresh_pool_cache() -> None:
    """Scheduler job: re-read the rewards pool balance from chain."""
    try:
        value = chain.pool_balance()
        _pool_cache.update(at=time.time(), value=value)
    except Exception:  # noqa: BLE001 — keep the last good reading
        pass


def _pool_thkt() -> float:
    if not _pool_cache["at"]:
        # Claim the slot before the read, so concurrent first callers don't all
        # go to the RPC together — the stampede that made /health block.
        _pool_cache["at"] = time.time()
        refresh_pool_cache()
    return _pool_cache["value"]


def _gas_runway() -> dict:
    """Publisher balance and how many epochs it still pays for (cached).

    Until the scheduler has run once the answer is honestly unknown, and
    reporting a balance of 0.0 there would read as an empty wallet — the exact
    emergency this endpoint exists to announce.
    """
    if not _gas_cache["at"]:
        return {"publisher": chain.publisher_address(), "balance": None,
                "publishes_left": None, "hours_left": None, "read_at": None}

    balance, cost = _gas_cache["balance"], _gas_cache["cost"]
    publishes = int(balance / cost) if cost > 0 else None
    return {
        "publisher": chain.publisher_address(),
        "balance": round(balance, 6),
        "read_at": _gas_cache["at"],
        "publishes_left": publishes,
        # At EPOCH_SECONDS the scheduler spends one publish per epoch, so this is
        # the number operators actually care about.
        "hours_left": round(publishes * EPOCH_SECONDS / 3600, 1)
        if publishes is not None and EPOCH_SECONDS > 0 else None,
    }


@app.get("/health")
def health():
    """Liveness plus the two things that fail quietly: publishing and gas.

    `status` is degraded — not ok — when the last root failed to publish, when no
    epoch has closed in a while, or when the publisher is nearly out of gas. All
    three end the same way (a frozen root and claims reverting with
    InvalidProof), and all three used to be invisible here.
    """
    pub = last_publish()
    gas = _gas_runway()
    now = time.time()
    ago = None if pub["at"] is None else round(now - pub["at"], 1)

    problems = []
    if pub["ok"] is False:
        problems.append("last publish failed")
    # Three missed epochs is a stalled scheduler, not a slow one. Before the
    # first close there is nothing to judge, so a fresh process stays ok.
    if ago is not None and EPOCH_SECONDS > 0 and ago > EPOCH_SECONDS * 3:
        problems.append("no epoch closed recently")
    # Warn in hours, not publishes: the same 100 publishes is four days of notice
    # at hourly epochs and 100 minutes at EPOCH_SECONDS=60. A day is enough time
    # to notice and top the wallet up at either setting.
    if gas["hours_left"] is not None and gas["hours_left"] < 24:
        problems.append("publisher low on gas")

    return {
        "status": "degraded" if problems else "ok",
        "problems": problems,
        "dry": chain.dry,
        "epoch_seconds": EPOCH_SECONDS,
        "last_publish": {**pub, "ago_s": ago},
        "gas": gas,
    }


@app.get("/stats")
def stats(db: Session = Depends(get_db)):
    """Real network stats for the landing page — computed from the DB, no fakes."""
    nodes = db.query(Node).all()
    now = time.time()
    online = sum(1 for n in nodes if n.last_heartbeat and (now - n.last_heartbeat) <= HEARTBEAT_TIMEOUT_S)
    total_earned = sum(n.cumulative_reward + n.contribution_minutes * REWARD_PER_MINUTE
                       + n.work_thkt for n in nodes)
    # Track minutes directly. This used to be back-computed from total earnings,
    # which was only ever right while earnings were purely time-based.
    total_minutes = sum(n.lifetime_minutes for n in nodes)
    total_jobs_done = sum(n.jobs_done for n in nodes)
    tasks = db.get(Counter, "tasks")
    jobs_running = db.query(Job).filter(Job.status.in_(("pending", "assigned", "verifying"))).count()
    # jobs_running has always meant "anything in flight" and the landing page and
    # portal both read it, so it keeps that meaning. These two split it into the
    # disjoint halves a dashboard actually wants to show side by side.
    jobs_queued = db.query(Job).filter(Job.status == "pending").count()
    jobs_active = db.query(Job).filter(Job.status.in_(("assigned", "verifying"))).count()
    verified = db.query(Quorum).filter(Quorum.status == "settled").count()
    return {
        "nodes": len(nodes),                                   # operators ever registered
        "active_nodes": online,                                # heartbeating right now
        "tasks_executed": tasks.value if tasks else 0,         # cumulative challenges + jobs
        "jobs_running": jobs_running,                          # compute jobs in flight
        "jobs_queued": jobs_queued,                            # paid, waiting for a node
        "jobs_active": jobs_active,                            # handed out, being worked on
        "verified_tasks": verified,                            # settled by k-node majority
        "quorum_k": QUORUM_K,                                  # nodes per quorum
        "spot_check_rate": qm.SPOT_CHECK_RATE,                 # share of paid work cross-checked
        "minutes_contributed": round(total_minutes, 1),
        "jobs_completed": total_jobs_done,
        "revenue_share": OPERATOR_REVENUE_SHARE,
        "thkt_earned": round(total_earned, 2),
        "pool_thkt": round(_pool_thkt(), 2),                   # rewards pool balance (on-chain, cached)
        "capabilities": sorted({c for n in nodes if n.last_heartbeat
                                and (now - n.last_heartbeat) <= HEARTBEAT_TIMEOUT_S
                                for c in (n.capabilities or "").split(",") if c}),
    }


@app.post("/register")
def register(req: RegisterReq, db: Session = Depends(get_db)):
    msg = signing.register_message(req.address, req.node_id)
    if not signing.verify(msg, req.signature, req.address):
        raise HTTPException(401, "bad signature")
    if not chain.is_bonded(req.address):
        raise HTTPException(403, "operator not bonded on-chain")
    node = db.get(Node, req.address) or Node(address=req.address)
    node.node_id = req.node_id
    node.capabilities = ",".join(sorted({c.strip() for c in req.capabilities if c.strip()}))
    db.merge(node)
    db.commit()
    return {"ok": True, "reward_per_minute": float(os.getenv("REWARD_PER_MINUTE", "1.0"))}


@app.post("/heartbeat")
def heartbeat(req: HeartbeatReq, db: Session = Depends(get_db)):
    node = db.get(Node, req.address)
    if not node:
        raise HTTPException(404, "not registered")
    if not signing.fresh(req.timestamp):
        raise HTTPException(400, "stale timestamp")
    if not signing.verify(signing.heartbeat_message(req.address, req.timestamp), req.signature, req.address):
        raise HTTPException(401, "bad signature")

    now = time.time()
    if node.last_heartbeat and (now - node.last_heartbeat) <= HEARTBEAT_TIMEOUT_S:
        elapsed_min = (now - node.last_heartbeat) / 60.0
        node.contribution_minutes += elapsed_min
        node.lifetime_minutes += elapsed_min      # never voided, never reset
    node.last_heartbeat = now
    # Flush before anything queries who's online: the session has autoflush off,
    # so without this the node calling in still looks offline to its own quorum
    # selection and can be left out of the quorum it just triggered.
    db.flush()

    # Settle any quorum whose deadline has passed. Cheap, and it means
    # verification progresses on network activity alone.
    for q in qm.due_quorums(db, now):
        settle_quorum(db, q)

    # A slot reserved for this node in an open quorum outranks a fresh solo
    # challenge: k nodes are waiting on this answer.
    challenge = None
    # Everything this node still owes an answer for, and the subset that should
    # be (re-)sent on this beat. A node holding an unanswered slot is busy: it
    # neither gets that task again straight away nor gets a new one.
    outstanding = qm.slots_for(db, req.address)
    slots = qm.due_for_dispatch(outstanding, JOB_ASSIGN_TIMEOUT_S)

    def _challenge_quorum(rows):
        for slot in rows:
            q = db.get(Quorum, slot.quorum_id)
            if q and q.kind == "challenge" and q.status == "open":
                return q, slot
        return None, None

    open_challenge, open_challenge_slot = _challenge_quorum(slots)
    awaiting_challenge, _ = _challenge_quorum(outstanding)

    if open_challenge:
        challenge = make_challenge(open_challenge.id, seed=open_challenge.seed,
                                   size=open_challenge.size).to_dict()
        qm.mark_dispatched(db, open_challenge_slot)
        node.last_challenge_at = now
    elif awaiting_challenge:
        pass          # still working on one — don't stack another on top of it
    elif now - node.last_challenge_at >= CHALLENGE_INTERVAL_S or node.last_challenge_at == 0:
        seed = secrets.randbits(62)
        # Prefer a k-node quorum. When too few nodes are online to form one,
        # fall back to the coordinator recomputing it — that keeps a one-node
        # network verified instead of halting verification altogether.
        online = qm.eligible_nodes(db, now - HEARTBEAT_TIMEOUT_S)
        q = qm.open_quorum(db, "challenge", seed=seed, size=CHALLENGE_SIZE,
                           candidates=online, must_include=req.address)
        if q:
            challenge = make_challenge(q.id, seed=seed, size=CHALLENGE_SIZE).to_dict()
            qm.mark_dispatched(db, qm.pending_slot(db, q.id, req.address))
        else:
            ch = make_challenge(f"{req.address}:{int(now)}", seed=seed, size=CHALLENGE_SIZE)
            node.pending_challenge_id = ch.challenge_id
            node.pending_seed = seed
            challenge = ch.to_dict()
        node.last_challenge_at = now

    # Requeue work orphaned by a node that took a job and never came back.
    stale_before = now - JOB_ASSIGN_TIMEOUT_S
    stale = (db.query(Job)
               .filter(Job.status == "assigned", Job.created_at < stale_before)
               .all())
    for j in stale:
        j.status = "pending"
        j.assigned_node = None

    # Hand this node work it can actually run (capability-matched). Several at a
    # time, so a large batch drains in parallel instead of one item per beat.
    job_payloads = []
    node_caps = {c for c in (node.capabilities or "").split(",") if c}
    budget = max(1, JOBS_PER_HEARTBEAT)

    # Work reserved for this node in a job quorum goes first — it has a deadline,
    # and k-1 other nodes are already running it. The node is never told the task
    # is being cross-checked, or who else has it.
    for slot in slots:
        if len(job_payloads) >= budget:
            break
        q = db.get(Quorum, slot.quorum_id)
        if not q or q.kind != "job" or q.status != "open":
            continue
        j = db.get(Job, q.ref)
        if j and j.kind in node_caps:
            qm.mark_dispatched(db, slot)
            job_payloads.append({"id": j.id, "kind": j.kind, "prompt": j.prompt,
                                 "image": j.image, "seed": j.seed})

    if node_caps and len(job_payloads) < budget:
        pending = (db.query(Job)
                     .filter(Job.status == "pending", Job.kind.in_(node_caps))
                     .order_by(Job.created_at)
                     .limit(budget - len(job_payloads)).all())
        for p in pending:
            p.status = "assigned"
            p.assigned_node = req.address
            job_payloads.append({"id": p.id, "kind": p.kind, "prompt": p.prompt,
                                 "image": p.image, "seed": p.seed})

    db.commit()
    return {
        "ok": True,
        "minutes": round(node.contribution_minutes, 4),
        "challenge": challenge,
        "job": job_payloads[0] if job_payloads else None,   # older clients
        "jobs": job_payloads,
    }


# --- verification settlement ------------------------------------------------

def credit_work(db: Session, address: str, thkt: float) -> None:
    """Credit one node for work actually done.

    Accrues alongside contribution_minutes and settles in the same epoch, so a
    verdict that arrives late can still void it — see close_epoch's holdback.
    """
    node = db.get(Node, address)
    if not node or thkt <= 0:
        return
    node.work_thkt += thkt
    node.jobs_done += 1


def operator_share(job: Job) -> float:
    """The THKT an operator earns for completing this job."""
    return max(0.0, job.price_thkt) * OPERATOR_REVENUE_SHARE


def void_and_strike(db: Session, address: str, reason: str) -> int:
    """One node got it wrong: void this window's earnings and count a strike.
    Three strikes slashes the bond. Shared by the solo-challenge path and quorum
    settlement so a liar is treated identically however it was caught."""
    node = db.get(Node, address)
    if not node:
        return 0
    node.failed_challenges += 1
    # Void the whole unsettled window, not just the time part — leaving work
    # earnings behind would make a strike almost costless for a busy node.
    node.contribution_minutes = 0.0
    node.work_thkt = 0.0
    fails = node.failed_challenges
    if fails >= MAX_FAILS_BEFORE_SLASH:
        chain.slash(node.address, SLASH_AMOUNT_WEI, reason)
        node.failed_challenges = 0
    return fails


def _on_agree(db: Session, address: str, q) -> None:
    """Agreeing nodes keep everything they accrued, and the strike counter
    resets — same as passing a solo challenge."""
    node = db.get(Node, address)
    if node:
        node.failed_challenges = 0


def _on_disagree(db: Session, address: str, q) -> None:
    void_and_strike(db, address, "disagreed with quorum consensus")


def settle_quorum(db: Session, q: Quorum) -> dict:
    """Tally a quorum and apply the outcome. For job quorums the buyer's result
    becomes the consensus answer — which is the real payoff of redundancy: the
    buyer stops getting whatever the single fastest node happened to say."""
    out = qm.settle(db, q, on_agree=_on_agree, on_disagree=_on_disagree)
    if q.kind != "job":
        return out

    job = db.get(Job, q.ref)
    if not job:
        return out

    if q.status == "settled":
        job.result = q.consensus
        job.status = "done"
        job.assigned_node = out["agreed"][0] if out["agreed"] else None
        # The buyer paid once, so one operator share is shared out between the
        # nodes that agreed. Nodes that disagreed get nothing and are struck.
        winners = out["agreed"]
        if winners:
            share = operator_share(job)
            each = share / len(winners) if QUORUM_SPLIT_REWARD else share
            for addr in winners:
                credit_work(db, addr, each)
    else:
        # No majority — punish nobody, but the buyer still needs an answer. Hand
        # over the earliest one submitted and mark it unverified; the caller can
        # see the quorum was inconclusive via /jobs/{id}.
        rows = (db.query(QuorumResult)
                  .filter(QuorumResult.quorum_id == q.id, QuorumResult.output_hash != "")
                  .order_by(QuorumResult.submitted_at).all())
        if rows:
            job.result = rows[0].output
            job.status = "done"
            job.assigned_node = rows[0].node_address
            # Inconclusive punishes nobody, so everyone who answered is paid —
            # they each did the work, and no one was shown to be wrong.
            each = operator_share(job) / len(rows) if QUORUM_SPLIT_REWARD else operator_share(job)
            for r in rows:
                credit_work(db, r.node_address, each)
        else:
            # Nobody answered at all — put it back in the ordinary queue rather
            # than leaving the buyer with nothing.
            job.quorum_id = None
            job.status = "pending"
            job.assigned_node = None
    return out


def verification_of(db: Session, job: Job) -> dict | None:
    """How this job was checked, for the buyer."""
    if not job.quorum_id:
        return None
    q = db.get(Quorum, job.quorum_id)
    if not q:
        return None
    rows = db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id).all()
    return {
        "quorum_id": q.id,
        "status": q.status,                                   # open|settled|inconclusive
        "verified": q.status == "settled",
        "required": q.required,
        "votes": sum(1 for r in rows if r.output_hash),
        "agreed": sum(1 for r in rows if r.verdict == "agreed"),
        "disagreed": sum(1 for r in rows if r.verdict == "disagreed"),
    }


@app.post("/challenge/result")
def challenge_result(req: ChallengeResultReq, db: Session = Depends(get_db)):
    # A quorum challenge is settled by what the other nodes say, not by the
    # coordinator recomputing it.
    q = db.get(Quorum, req.challenge_id)
    if q and q.kind == "challenge":
        if q.status != "open":
            raise HTTPException(400, "quorum already settled")
        if not qm.record_vote(db, q, req.address, req.output_hash):
            raise HTTPException(400, "not your challenge")
        bump_tasks(db)
        result = settle_quorum(db, q) if qm.is_settleable(db, q) else None
        db.commit()
        # The node isn't told how the vote went — it doesn't know others have
        # the same task, and its verdict may not exist yet.
        return {"ok": True, "quorum": q.id, "settled": bool(result)}

    node = db.get(Node, req.address)
    if not node or node.pending_challenge_id != req.challenge_id:
        raise HTTPException(400, "no such challenge")

    ch = make_challenge(req.challenge_id, seed=node.pending_seed, size=CHALLENGE_SIZE)
    if not verify_challenge(ch, req.output_hash):
        fails = void_and_strike(db, node.address, "repeated failed challenges")
        db.commit()
        return {"ok": False, "reason": "wrong output", "fails": fails}

    node.pending_challenge_id = None
    node.failed_challenges = 0
    bump_tasks(db)
    db.commit()
    return {"ok": True}


@app.post("/epoch/close")
def epoch_close():
    """Manual settlement (the scheduler also does this on EPOCH_SECONDS)."""
    return close_epoch()


@app.get("/claims")
def claims():
    return current_claims()


# --- pay-for-compute: buyers pay THKT (which refills the pool), nodes execute ---
class JobReq(BaseModel):
    prompt: str
    payer: str
    kind: str = "text"          # text | vision
    image: str | None = None    # base64 (vision jobs)
    image_pixels: int = 0       # width*height, for resolution-based pricing
    payment_tx: str = ""       # the fund() tx that paid into the pool
    payment_thkt: float = 0.0


class JobResultReq(BaseModel):
    address: str
    result: str
    ok: bool = True


def check_size(prompt: str, where: str = "prompt") -> None:
    """Refuse input longer than a node can actually read.

    This runs before the payment check on purpose. The alternative — accept the
    money, hand the node a document it will silently truncate, and return a
    summary of the first fraction of it — is the failure this exists to prevent.
    """
    n = len(prompt or "")
    if n > MAX_PROMPT_CHARS:
        raise HTTPException(413, f"{where} is {n:,} characters; the limit is "
                                 f"{MAX_PROMPT_CHARS:,}. Split it into a bulk batch.")


def quote_job(kind: str, prompt: str, has_image: bool, image_pixels: int = 0) -> float:
    """What this job should cost, in THKT.

    Text is priced per character — that's what the model actually reads, and it
    tracks file size for plain text while correctly ignoring, say, a 5MB PDF that
    is mostly pictures and yields little text.

    Images are priced per megapixel: vision models turn an image into tokens in
    proportion to its resolution, so a full photo genuinely costs a node more
    than a thumbnail.
    """
    price = COMPUTE_BASE_THKT
    price += (len(prompt or "") / 1000.0) * COMPUTE_PER_1K_CHARS
    if kind == "vision" or has_image:
        price += COMPUTE_VISION_THKT
        mp = max(0.0, image_pixels) / 1_000_000.0
        price += mp * COMPUTE_PER_MP_THKT
    return round(price, 2)


@app.get("/compute/price")
def compute_price():
    """Pricing parameters — the client quotes live from these, the server is
    authoritative at submission time."""
    return {
        "price_thkt": COMPUTE_BASE_THKT,          # kept for older clients
        "base_thkt": COMPUTE_BASE_THKT,
        "per_1k_chars_thkt": COMPUTE_PER_1K_CHARS,
        "vision_thkt": COMPUTE_VISION_THKT,
        "per_mp_thkt": COMPUTE_PER_MP_THKT,
        "max_chars": MAX_PROMPT_CHARS,            # longer inputs are refused
    }


class QuoteReq(BaseModel):
    kind: str = "text"
    prompt: str = ""
    has_image: bool = False
    image_pixels: int = 0


@app.post("/compute/quote")
def compute_quote(req: QuoteReq):
    # A quote is advisory, so an oversized prompt is reported rather than
    # refused — the UI can warn while someone is still typing. /jobs is where it
    # actually gets rejected.
    chars = len(req.prompt or "")
    return {"price_thkt": quote_job(req.kind, req.prompt, req.has_image, req.image_pixels),
            "chars": chars,
            "max_chars": MAX_PROMPT_CHARS,
            "too_large": chars > MAX_PROMPT_CHARS,
            "megapixels": round(req.image_pixels / 1_000_000.0, 2)}


def maybe_spot_check(db: Session, job: Job) -> Quorum | None:
    """Roll the dice: a random share of paid work runs on k nodes instead of one.

    Verifying everything at k=3 would triple network compute, so most jobs go
    out unverified and a random sample is policed. A node can't tell which is
    which, so cheating is a bet against a slashable bond.

    Returns None (job runs normally) when the sample misses *or* when fewer than
    k capable nodes are online to form a quorum.
    """
    if not qm.should_spot_check():
        return None
    candidates = qm.eligible_nodes(db, time.time() - HEARTBEAT_TIMEOUT_S, capability=job.kind)
    q = qm.open_quorum(db, "job", ref=job.id, candidates=candidates)
    if q:
        job.quorum_id = q.id
        job.status = "verifying"      # kept out of the ordinary single-node queue
    return q


@app.post("/jobs")
def submit_job(req: JobReq, db: Session = Depends(get_db)):
    """Record a paid job. Payment is the on-chain fund() into the rewards pool:
    the tx receipt is fetched and its PoolFunded event matched against this payer
    and the server-side price, so a client can't claim a payment it didn't make
    or underpay for the job it's asking for. Only DRY mode trusts the client.
    The job is then assigned to the next online node via heartbeat."""
    if req.kind not in ("text", "vision"):
        raise HTTPException(400, "kind must be 'text' or 'vision'")
    if req.kind == "text" and not req.prompt.strip():
        raise HTTPException(400, "empty prompt")
    if req.kind == "vision" and not req.image:
        raise HTTPException(400, "vision jobs need an image")
    check_size(req.prompt)

    # No reusing one payment for multiple jobs.
    if req.payment_tx and db.query(Job).filter(Job.payment_tx == req.payment_tx).first():
        raise HTTPException(400, "payment already used")

    # Price this job by its actual size, then require the payment to cover it.
    price = quote_job(req.kind, req.prompt, bool(req.image), req.image_pixels)
    if not chain.dry:
        if req.payment_thkt + 1e-9 < price:
            raise HTTPException(402, f"payment below price for this job ({price} THKT)")
        if not req.payment_tx or not chain.verify_payment(req.payment_tx, req.payer, price):
            raise HTTPException(402, "payment not verified on-chain")

    jid = secrets.token_hex(8)
    job = Job(
        id=jid, kind=req.kind, prompt=req.prompt, image=req.image, payer=req.payer,
        payment_thkt=req.payment_thkt, payment_tx=req.payment_tx,
        status="pending", created_at=time.time(), price_thkt=price,
        # Shared sampling seed: every node running this job draws the same way,
        # so honest answers land close enough to be compared.
        seed=secrets.randbits(31),
    )
    db.add(job)
    db.flush()
    q = maybe_spot_check(db, job)
    db.commit()
    return {"id": jid, "status": job.status, "price_thkt": price,
            "verified": bool(q)}


@app.get("/jobs/{jid}")
def get_job(jid: str, db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job:
        raise HTTPException(404, "no such job")
    return {"id": job.id, "kind": job.kind, "status": job.status, "prompt": job.prompt,
            "result": job.result, "node": job.assigned_node,
            "verification": verification_of(db, job)}


class BatchItem(BaseModel):
    prompt: str = ""
    image: str | None = None
    image_pixels: int = 0


class BatchReq(BaseModel):
    kind: str = "text"
    instruction: str = ""          # prepended to every item
    items: list[BatchItem] = []
    payer: str
    payment_tx: str = ""
    payment_thkt: float = 0.0


@app.post("/batches")
def submit_batch(req: BatchReq, db: Session = Depends(get_db)):
    """One payment, many work items, fanned out across every capable node."""
    if req.kind not in ("text", "vision"):
        raise HTTPException(400, "kind must be 'text' or 'vision'")
    if not req.items:
        raise HTTPException(400, "no items")
    if len(req.items) > MAX_BATCH_ITEMS:
        raise HTTPException(400, f"too many items (max {MAX_BATCH_ITEMS})")

    if req.payment_tx and db.query(Batch).filter(Batch.payment_tx == req.payment_tx).first():
        raise HTTPException(400, "payment already used")

    # Price every item, then require one payment covering the whole batch.
    prompts = [f"{req.instruction.strip()}\n\n{it.prompt}".strip() if req.instruction else it.prompt
               for it in req.items]
    for i, p in enumerate(prompts):
        check_size(p, where=f"item {i + 1}")
    total = round(sum(quote_job(req.kind, p, bool(it.image), it.image_pixels)
                      for p, it in zip(prompts, req.items)), 2)

    if not chain.dry:
        if req.payment_thkt + 1e-9 < total:
            raise HTTPException(402, f"payment below batch price ({total} THKT)")
        if not req.payment_tx or not chain.verify_payment(req.payment_tx, req.payer, total):
            raise HTTPException(402, "payment not verified on-chain")

    bid = secrets.token_hex(8)
    now = time.time()
    db.add(Batch(id=bid, payer=req.payer, kind=req.kind, instruction=req.instruction,
                 total=len(req.items), payment_thkt=total, payment_tx=req.payment_tx,
                 created_at=now))
    verified = 0
    for i, (p, it) in enumerate(zip(prompts, req.items)):
        job = Job(id=f"{bid}-{i:04d}", kind=req.kind, prompt=p, image=it.image,
                  payer=req.payer, payment_thkt=0.0, payment_tx=req.payment_tx,
                  status="pending", created_at=now + i * 1e-6, batch_id=bid,
                  price_thkt=quote_job(req.kind, p, bool(it.image), it.image_pixels),
                  seed=secrets.randbits(31))
        db.add(job)
        db.flush()
        if maybe_spot_check(db, job):
            verified += 1
    db.commit()
    return {"id": bid, "items": len(req.items), "price_thkt": total,
            "spot_checked": verified}


@app.get("/batches/{bid}")
def get_batch(bid: str, db: Session = Depends(get_db)):
    b = db.get(Batch, bid)
    if not b:
        raise HTTPException(404, "no such batch")
    jobs = db.query(Job).filter(Job.batch_id == bid).order_by(Job.id).all()
    counts = {"done": 0, "failed": 0, "pending": 0, "assigned": 0, "verifying": 0}
    for j in jobs:
        counts[j.status] = counts.get(j.status, 0) + 1
    return {
        "id": b.id, "kind": b.kind, "instruction": b.instruction,
        "total": b.total, "price_thkt": b.payment_thkt, "created_at": b.created_at,
        **counts,
        "finished": counts["done"] + counts["failed"] >= b.total,
        "results": [{"id": j.id, "status": j.status, "prompt": j.prompt,
                     "result": j.result, "node": j.assigned_node,
                     "verification": verification_of(db, j)} for j in jobs],
    }


@app.get("/batches")
def list_batches(payer: str = "", limit: int = 20, db: Session = Depends(get_db)):
    if not payer:
        raise HTTPException(400, "payer required")
    rows = (db.query(Batch).filter(func.lower(Batch.payer) == payer.lower())
              .order_by(Batch.created_at.desc()).limit(min(limit, 100)).all())
    out = []
    for b in rows:
        done = db.query(Job).filter(Job.batch_id == b.id, Job.status == "done").count()
        failed = db.query(Job).filter(Job.batch_id == b.id, Job.status == "failed").count()
        out.append({"id": b.id, "kind": b.kind, "total": b.total, "done": done,
                    "failed": failed, "price_thkt": b.payment_thkt,
                    "created_at": b.created_at, "instruction": b.instruction})
    return out


@app.get("/jobs")
def list_jobs(payer: str = "", limit: int = 25, db: Session = Depends(get_db)):
    """A buyer's own job history, newest first."""
    if not payer:
        raise HTTPException(400, "payer required")
    rows = (db.query(Job)
              .filter(func.lower(Job.payer) == payer.lower())
              .order_by(Job.created_at.desc())
              .limit(min(limit, 100)).all())
    return [{"id": j.id, "kind": j.kind, "status": j.status, "prompt": j.prompt,
             "result": j.result, "node": j.assigned_node,
             "price_thkt": j.payment_thkt, "created_at": j.created_at,
             "verification": verification_of(db, j)} for j in rows]


@app.post("/jobs/{jid}/result")
def job_result(jid: str, req: JobResultReq, db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job:
        raise HTTPException(400, "not your job")

    # Spot-checked job: this is one vote of k, not the answer.
    if job.quorum_id:
        q = db.get(Quorum, job.quorum_id)
        if not q or q.status != "open":
            raise HTTPException(400, "quorum already settled")
        slot = qm.pending_slot(db, q.id, req.address)
        if not slot:
            raise HTTPException(400, "not your job")
        if not req.ok:
            # Inference broke on this node. That's a machine that fell over, not
            # a liar — release the slot without a vote so it isn't struck for it.
            # The quorum may now be decidable on the votes already in.
            slot.verdict = "failed"
            db.flush()
            if qm.is_settleable(db, q):
                settle_quorum(db, q)
            db.commit()
            return {"ok": True, "counted": False}
        qm.record_vote(db, q, req.address, req.result or "")
        bump_tasks(db)
        if qm.is_settleable(db, q):
            settle_quorum(db, q)
        db.commit()
        return {"ok": True, "counted": True}

    if job.assigned_node != req.address:
        raise HTTPException(400, "not your job")
    job.result = req.result or ""
    job.status = "done" if req.ok else "failed"
    if req.ok:
        bump_tasks(db)          # only successful work counts as a task executed
        credit_work(db, req.address, operator_share(job))
    db.commit()
    return {"ok": True}


@app.get("/nodes")
def list_nodes(limit: int = 50, offset: int = 0, sort: str = "earned",
               status: str = "all", dir: str = "desc", db: Session = Depends(get_db)):
    """Every registered operator, for the public node page.

    Deliberately unauthenticated and address-keyed: the point of the page is that
    anyone can take a row's address to the explorer and check the network's
    claims against the chain. Nothing here is private — addresses and claimed
    amounts are already public on chain; this only saves the reader from
    reconstructing the list by hand.

    Two different verification counts, deliberately named apart:
    `network.verified_tasks` counts settled quorums (matching /stats), while a
    node's `verified_answers` counts the slots *it* answered in agreement with
    the majority. With k=3 the second is roughly three times the first, so
    giving them one name made the page contradict itself.

    Either is a better measure of work done than `jobs_done`, which counts paid
    jobs only — almost nothing has been bought, so a page leading with that
    would read as a dead network when it is in fact busy.
    """
    now = time.time()
    cached = _nodes_cache["rows"]
    if cached is not None and now - _nodes_cache["at"] < NODES_TTL_S:
        rows, totals = cached, _nodes_cache["totals"]
        return _page_nodes(rows, totals, limit, offset, sort, status, dir, now)

    nodes = db.query(Node).all()

    # One aggregate for the whole table rather than a count per row — this runs
    # on every page load, and the per-row version is 200+ queries.
    agreed = dict(
        db.query(QuorumResult.node_address, func.count(QuorumResult.id))
        .filter(QuorumResult.verdict == "agreed")
        .group_by(QuorumResult.node_address)
        .all()
    )
    # Addresses are stored as the operator sent them, so the join has to be
    # case-insensitive or half the counts land on the wrong row.
    agreed_lower = {}
    for addr, n in agreed.items():
        agreed_lower[addr.lower()] = agreed_lower.get(addr.lower(), 0) + n

    rows = []
    for n in nodes:
        online = bool(n.last_heartbeat) and (now - n.last_heartbeat) <= HEARTBEAT_TIMEOUT_S
        pending = n.contribution_minutes * REWARD_PER_MINUTE + n.work_thkt
        rows.append({
            "address": n.address,
            # Operator-supplied free text. Truncated because it is displayed and
            # nothing validates it on the way in.
            "node_id": (n.node_id or "")[:48],
            "online": online,
            "last_heartbeat": n.last_heartbeat or None,
            "seen_s_ago": round(now - n.last_heartbeat, 1) if n.last_heartbeat else None,
            "capabilities": [c for c in (n.capabilities or "").split(",") if c],
            "lifetime_minutes": round(n.lifetime_minutes, 2),
            # This node's answers that matched the majority — a different unit
            # from the network's quorum count, so a different name.
            "verified_answers": agreed_lower.get(n.address.lower(), 0),
            "failed_challenges": n.failed_challenges,
            "jobs_done": n.jobs_done,
            "settled_thkt": round(n.cumulative_reward, 6),   # in the last root, claimable
            "pending_thkt": round(pending, 6),               # this epoch, not yet claimable
            "earned_thkt": round(n.cumulative_reward + pending, 6),
        })

    totals = {
        "total": len(nodes),
        "online": sum(1 for r in rows if r["online"]),
        "network": {
            "lifetime_minutes": round(sum(n.lifetime_minutes for n in nodes), 2),
            "tasks_executed": (db.get(Counter, "tasks").value
                               if db.get(Counter, "tasks") else 0),
            "jobs_queued": db.query(Job).filter(Job.status == "pending").count(),
            "jobs_active": db.query(Job).filter(
                Job.status.in_(("assigned", "verifying"))).count(),
            "pool_thkt": round(_pool_thkt(), 2),
            # Count settled quorums, exactly as /stats does. Summing the
            # per-node agreed answers instead reported ~3x higher (k=3 nodes
            # answer each quorum) under the same name as the landing page's
            # figure, and exceeded "tasks executed" on the same screen, which is
            # impossible on its face.
            "verified_tasks": db.query(Quorum).filter(Quorum.status == "settled").count(),
            "verified_answers": sum(agreed_lower.values()),
            "jobs_done": sum(n.jobs_done for n in nodes),
            "earned_thkt": round(sum(r["earned_thkt"] for r in rows), 6),
        },
    }
    _nodes_cache.update(at=now, rows=rows, totals=totals)
    return _page_nodes(rows, totals, limit, offset, sort, status, dir, now)


# Filtering, sorting and paging all happen on the cached row set, so a second
# visitor a moment later costs no database work at all.
def _page_nodes(all_rows, totals, limit, offset, sort, status, dir, now) -> dict:
    rows = all_rows
    if status == "online":
        rows = [r for r in rows if r["online"]]
    elif status == "offline":
        rows = [r for r in rows if not r["online"]]

    keys = {
        "earned": lambda r: r["earned_thkt"],
        "uptime": lambda r: r["lifetime_minutes"],
        "tasks": lambda r: r["verified_answers"],
        "jobs": lambda r: r["jobs_done"],
        "seen": lambda r: -(r["seen_s_ago"] if r["seen_s_ago"] is not None else 1e12),
    }
    key = keys.get(sort, keys["earned"])
    descending = dir != "asc"
    # Online first regardless of direction: a page about who is available now
    # should not open on a screenful of nodes that left last week. Only the
    # metric flips when someone asks for ascending — otherwise "lowest earners"
    # would just be a list of the departed.
    rows.sort(key=lambda r: key(r), reverse=descending)
    rows.sort(key=lambda r: r["online"], reverse=True)

    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    page = rows[offset:offset + limit]

    return {
        "total": totals["total"],
        "online": totals["online"],
        "matched": len(rows),
        "limit": limit,
        "offset": offset,
        "sort": sort if sort in keys else "earned",
        "dir": "desc" if descending else "asc",
        "status": status,
        "heartbeat_timeout_s": HEARTBEAT_TIMEOUT_S,
        "reward_per_minute": REWARD_PER_MINUTE,
        "network": totals["network"],
        # The page reads `claimed(address)` straight from this contract in the
        # browser, so the reader verifies the claimed column against the chain
        # rather than taking the coordinator's word for it.
        "distributor": chain.distributor_addr,
        "generated_at": now,
        "nodes": page,
    }


@app.get("/quorums")
def list_quorums(limit: int = 20, db: Session = Depends(get_db)):
    """Recent quorums and how they landed — the audit trail for verification."""
    rows = db.query(Quorum).order_by(Quorum.created_at.desc()).limit(min(limit, 100)).all()
    out = []
    for q in rows:
        results = db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id).all()
        out.append({
            "id": q.id, "kind": q.kind, "ref": q.ref, "status": q.status,
            "required": q.required, "created_at": q.created_at,
            "settled_at": q.settled_at,
            "nodes": [{"address": r.node_address, "verdict": r.verdict,
                       "hash": r.output_hash or None,
                       "answered": bool(r.output_hash)} for r in results],
        })
    return out


@app.get("/debug/jobs")
def debug_jobs(db: Session = Depends(get_db)):
    """Job metadata only (no prompts) so routing problems are diagnosable."""
    now = time.time()
    rows = db.query(Job).order_by(Job.created_at.desc()).limit(20).all()
    nodes = db.query(Node).all()
    return {
        "jobs": [{"id": j.id, "kind": j.kind, "status": j.status,
                  "node": j.assigned_node, "has_result": bool(j.result),
                  "age_s": round(now - (j.created_at or now))} for j in rows],
        "nodes": [{"address": n.address, "capabilities": n.capabilities,
                   "online": bool(n.last_heartbeat and (now - n.last_heartbeat) <= HEARTBEAT_TIMEOUT_S)}
                  for n in nodes],
    }


@app.post("/admin/reset")
def admin_reset(token: str = "", db: Session = Depends(get_db)):
    """Wipe node + job state (fresh stats). Guarded by ADMIN_TOKEN."""
    if not ADMIN_TOKEN or token != ADMIN_TOKEN:
        raise HTTPException(403, "forbidden")
    n = db.query(Node).delete()
    j = db.query(Job).delete()
    db.commit()
    return {"ok": True, "nodes_cleared": n, "jobs_cleared": j}


@app.get("/delegations/{address}")
def delegations_of(address: str, db: Session = Depends(get_db)):
    """What this wallet has delegated, and what it has earned doing so.

    Delegators are paid out of the same Merkle root as operators, so the claim
    proof here is used exactly like a node's.
    """
    rows = (db.query(Delegation)
              .filter(func.lower(Delegation.delegator) == address.lower())
              .all())
    settled = sum(r.cumulative_reward for r in rows)

    claim = None
    for k, v in current_claims(db).items():
        if k.lower() == address.lower():
            claim = v
            break

    return {
        "address": address,
        "commission": OPERATOR_COMMISSION,
        "delegated_thkt": round(sum(r.amount for r in rows), 6),
        "earned_thkt": round(settled, 6),
        "operators": [{"operator": r.operator, "amount": round(r.amount, 6),
                       "earned_thkt": round(r.cumulative_reward, 6)}
                      for r in rows if r.amount > 0 or r.cumulative_reward > 0],
        # Covers this wallet's operator earnings too, if it also runs a node —
        # one leaf per address, so one proof pays out everything it is owed.
        "claim": claim,
    }


@app.post("/delegations/sync")
def delegations_sync(db: Session = Depends(get_db)):
    """Re-read delegations from chain. Runs each epoch anyway; this is for
    picking up a fresh delegation without waiting."""
    n = sync_delegations(db)
    db.commit()
    return {"ok": True, "pairs": n}


@app.get("/node/{address}")
def node_status(address: str, db: Session = Depends(get_db)):
    """Live status + earnings for one operator, for the dashboard to poll.

    earned = settled (claimable, in the last on-chain root) + pending (accrued
    this epoch, not yet claimable). `claim` carries the Merkle proof for the
    settled amount so the UI can claim in one tx.
    """
    node = db.query(Node).filter(func.lower(Node.address) == address.lower()).first()
    if not node:
        return {"registered": False}
    now = time.time()
    online = bool(node.last_heartbeat) and (now - node.last_heartbeat) <= HEARTBEAT_TIMEOUT_S
    uptime_thkt = node.contribution_minutes * REWARD_PER_MINUTE
    pending = uptime_thkt + node.work_thkt

    claim = None
    for k, v in current_claims(db).items():
        if k.lower() == node.address.lower():
            claim = v
            break

    return {
        "registered": True,
        "online": online,
        "address": node.address,
        "node_id": node.node_id,
        "reward_per_minute": REWARD_PER_MINUTE,
        "contribution_minutes": round(node.contribution_minutes, 4),
        "lifetime_minutes": round(node.lifetime_minutes, 4),   # never reset
        "uptime_thkt": round(uptime_thkt, 6),    # this epoch, from being online
        "work_thkt": round(node.work_thkt, 6),   # this epoch, from jobs completed
        "jobs_done": node.jobs_done,             # lifetime
        "revenue_share": OPERATOR_REVENUE_SHARE,
        "pending_thkt": pending,                 # accrued this epoch, not yet claimable
        "settled_thkt": node.cumulative_reward,  # claimable (in the last root)
        "earned_thkt": node.cumulative_reward + pending,
        "last_heartbeat": node.last_heartbeat,
        "claim": claim,                          # {cumulativeAmount, proof} | None
    }
