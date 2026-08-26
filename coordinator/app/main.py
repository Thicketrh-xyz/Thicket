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

from . import signing
from .challenge import make_challenge, verify as verify_challenge
from .db import Counter, Job, Node, SessionLocal, init_db
from .epoch import EPOCH_SECONDS, REWARD_PER_MINUTE, chain_bridge, close_epoch, current_claims, start_scheduler

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
COMPUTE_VISION_THKT = float(os.getenv("COMPUTE_VISION_THKT", "10"))   # image surcharge
COMPUTE_PRICE_THKT = COMPUTE_BASE_THKT                                # legacy floor
JOB_ASSIGN_TIMEOUT_S = int(os.getenv("JOB_ASSIGN_TIMEOUT_S", "180"))  # requeue if unfinished

chain = chain_bridge()


@app.on_event("startup")
def _startup():
    init_db()
    start_scheduler()


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


@app.get("/health")
def health():
    return {"status": "ok", "dry": chain.dry, "epoch_seconds": EPOCH_SECONDS}


@app.get("/stats")
def stats(db: Session = Depends(get_db)):
    """Real network stats for the landing page — computed from the DB, no fakes."""
    nodes = db.query(Node).all()
    now = time.time()
    online = sum(1 for n in nodes if n.last_heartbeat and (now - n.last_heartbeat) <= HEARTBEAT_TIMEOUT_S)
    total_earned = sum(n.cumulative_reward + n.contribution_minutes * REWARD_PER_MINUTE for n in nodes)
    tasks = db.get(Counter, "tasks")
    jobs_running = db.query(Job).filter(Job.status.in_(("pending", "assigned"))).count()
    return {
        "nodes": len(nodes),                                   # operators ever registered
        "active_nodes": online,                                # heartbeating right now
        "tasks_executed": tasks.value if tasks else 0,         # cumulative challenges + jobs
        "jobs_running": jobs_running,                          # compute jobs in flight
        "minutes_contributed": round(total_earned / REWARD_PER_MINUTE, 1),
        "thkt_earned": round(total_earned, 2),
        "pool_thkt": round(chain.pool_balance(), 2),           # rewards pool balance (on-chain)
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
        node.contribution_minutes += (now - node.last_heartbeat) / 60.0
    node.last_heartbeat = now

    challenge = None
    if now - node.last_challenge_at >= CHALLENGE_INTERVAL_S or node.last_challenge_at == 0:
        seed = secrets.randbits(62)
        ch = make_challenge(f"{req.address}:{int(now)}", seed=seed, size=CHALLENGE_SIZE)
        node.pending_challenge_id = ch.challenge_id
        node.pending_seed = seed
        node.last_challenge_at = now
        challenge = ch.to_dict()

    # Requeue work orphaned by a node that took a job and never came back.
    stale_before = now - JOB_ASSIGN_TIMEOUT_S
    stale = (db.query(Job)
               .filter(Job.status == "assigned", Job.created_at < stale_before)
               .all())
    for j in stale:
        j.status = "pending"
        j.assigned_node = None

    # Hand this node a pending job it can actually run (capability-matched).
    job_payload = None
    node_caps = {c for c in (node.capabilities or "").split(",") if c}
    if node_caps:
        pending = (db.query(Job)
                     .filter(Job.status == "pending", Job.kind.in_(node_caps))
                     .order_by(Job.created_at).first())
        if pending:
            pending.status = "assigned"
            pending.assigned_node = req.address
            job_payload = {"id": pending.id, "kind": pending.kind,
                           "prompt": pending.prompt, "image": pending.image}

    db.commit()
    return {
        "ok": True,
        "minutes": round(node.contribution_minutes, 4),
        "challenge": challenge,
        "job": job_payload,
    }


@app.post("/challenge/result")
def challenge_result(req: ChallengeResultReq, db: Session = Depends(get_db)):
    node = db.get(Node, req.address)
    if not node or node.pending_challenge_id != req.challenge_id:
        raise HTTPException(400, "no such challenge")

    ch = make_challenge(req.challenge_id, seed=node.pending_seed, size=CHALLENGE_SIZE)
    if not verify_challenge(ch, req.output_hash):
        node.failed_challenges += 1
        node.contribution_minutes = 0.0  # void this window's earnings
        fails = node.failed_challenges
        if fails >= MAX_FAILS_BEFORE_SLASH:
            chain.slash(node.address, SLASH_AMOUNT_WEI, "repeated failed challenges")
            node.failed_challenges = 0
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
    payment_tx: str = ""       # the fund() tx that paid into the pool
    payment_thkt: float = 0.0


class JobResultReq(BaseModel):
    address: str
    result: str
    ok: bool = True


def quote_job(kind: str, prompt: str, has_image: bool) -> float:
    """What this specific job should cost, in THKT."""
    price = COMPUTE_BASE_THKT
    price += (len(prompt or "") / 1000.0) * COMPUTE_PER_1K_CHARS
    if kind == "vision" or has_image:
        price += COMPUTE_VISION_THKT
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
    }


class QuoteReq(BaseModel):
    kind: str = "text"
    prompt: str = ""
    has_image: bool = False


@app.post("/compute/quote")
def compute_quote(req: QuoteReq):
    return {"price_thkt": quote_job(req.kind, req.prompt, req.has_image),
            "chars": len(req.prompt or "")}


@app.post("/jobs")
def submit_job(req: JobReq, db: Session = Depends(get_db)):
    """Record a paid job. Payment is the on-chain fund() into the rewards pool;
    for the MVP we trust the client-provided tx (production would verify it on
    chain). The job is then assigned to the next online node via heartbeat."""
    if req.kind not in ("text", "vision"):
        raise HTTPException(400, "kind must be 'text' or 'vision'")
    if req.kind == "text" and not req.prompt.strip():
        raise HTTPException(400, "empty prompt")
    if req.kind == "vision" and not req.image:
        raise HTTPException(400, "vision jobs need an image")

    # No reusing one payment for multiple jobs.
    if req.payment_tx and db.query(Job).filter(Job.payment_tx == req.payment_tx).first():
        raise HTTPException(400, "payment already used")

    # Price this job by its actual size, then require the payment to cover it.
    price = quote_job(req.kind, req.prompt, bool(req.image))
    if not chain.dry:
        if req.payment_thkt + 1e-9 < price:
            raise HTTPException(402, f"payment below price for this job ({price} THKT)")
        if not req.payment_tx or not chain.verify_payment(req.payment_tx, req.payer, price):
            raise HTTPException(402, "payment not verified on-chain")

    jid = secrets.token_hex(8)
    db.add(Job(
        id=jid, kind=req.kind, prompt=req.prompt, image=req.image, payer=req.payer,
        payment_thkt=req.payment_thkt, payment_tx=req.payment_tx,
        status="pending", created_at=time.time(),
    ))
    db.commit()
    return {"id": jid, "status": "pending", "price_thkt": price}


@app.get("/jobs/{jid}")
def get_job(jid: str, db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job:
        raise HTTPException(404, "no such job")
    return {"id": job.id, "kind": job.kind, "status": job.status, "prompt": job.prompt,
            "result": job.result, "node": job.assigned_node}


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
             "price_thkt": j.payment_thkt, "created_at": j.created_at} for j in rows]


@app.post("/jobs/{jid}/result")
def job_result(jid: str, req: JobResultReq, db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job or job.assigned_node != req.address:
        raise HTTPException(400, "not your job")
    job.result = req.result or ""
    job.status = "done" if req.ok else "failed"
    if req.ok:
        bump_tasks(db)          # only successful work counts as a task executed
    db.commit()
    return {"ok": True}


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
    pending = node.contribution_minutes * REWARD_PER_MINUTE

    claim = None
    for k, v in current_claims().items():
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
        "pending_thkt": pending,                 # accrued this epoch, not yet claimable
        "settled_thkt": node.cumulative_reward,  # claimable (in the last root)
        "earned_thkt": node.cumulative_reward + pending,
        "last_heartbeat": node.last_heartbeat,
        "claim": claim,                          # {cumulativeAmount, proof} | None
    }
