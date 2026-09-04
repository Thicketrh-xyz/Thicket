"""
Epoch settlement + scheduler.

close_epoch() rolls each node's accrued contribution minutes into its
cumulative THKT, builds the Merkle root, and publishes it on-chain (or logs it
in DRY mode). A background scheduler runs it every EPOCH_SECONDS so operators
don't have to be poked manually.
"""
from __future__ import annotations

import os
import time
import zlib

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text

from .chain import ChainBridge
from .db import (Counter, Delegation, Node, Quorum, QuorumResult, RelicHolder,
                 engine, session_scope)
from .merkle import MerkleTree

REWARD_PER_MINUTE = float(os.getenv("REWARD_PER_MINUTE", "1.0"))
EPOCH_SECONDS = int(os.getenv("EPOCH_SECONDS", "3600"))
# Share of an operator's earnings that follows delegated stake. An operator
# keeps its own stake's share in full plus a commission on the delegators' part,
# which is what pays for the hardware and the slash risk it alone carries.
OPERATOR_COMMISSION = float(os.getenv("OPERATOR_COMMISSION", "0.20"))
# Block to start scanning Delegated events from (0 = genesis; set this to the
# staking contract's deploy block so a resync doesn't crawl the whole chain).
DELEGATION_FROM_BLOCK = int(os.getenv("DELEGATION_FROM_BLOCK", "0"))

_chain = ChainBridge()
_scheduler: BackgroundScheduler | None = None

# Outcome of the most recent publish attempt. The scheduler swallows whatever
# close_epoch raises, so without this a failed publish is completely silent:
# /health keeps saying ok, the on-chain root stops moving, and the first anyone
# hears of it is claims reverting with InvalidProof. Kept in memory on purpose —
# it describes this process, and a restart genuinely has nothing to report yet.
_last_publish: dict = {
    "at": None,          # unix ts of the last attempt
    "ok": None,          # None until an attempt has been made
    "root": None,
    "tx": None,
    "error": None,
    "consecutive_failures": 0,
}


def last_publish() -> dict:
    """Snapshot of the most recent publish attempt (see _last_publish)."""
    return dict(_last_publish)


def sync_delegations(db) -> int:
    """Refresh the delegation mirror from chain. Returns pairs known after sync.

    Two steps, because neither alone is enough: Delegated logs reveal which
    (delegator, operator) pairs exist, and a view call gives each one's current
    balance. Undelegations never appear as a pair-specific event, so a balance
    is only ever trusted from the chain read, never accumulated from logs.
    """
    if _chain.dry:
        return db.query(Delegation).count()

    cursor = db.get(Counter, "delegation_block")
    if not cursor:
        cursor = Counter(name="delegation_block", value=DELEGATION_FROM_BLOCK)
        db.add(cursor)

    pairs, last_block = _chain.find_delegations(cursor.value)
    for delegator, operator in pairs:
        key = f"{delegator.lower()}:{operator.lower()}"
        if not db.get(Delegation, key):
            db.add(Delegation(id=key, delegator=delegator, operator=operator))
    db.flush()
    cursor.value = last_block

    # Re-read every known pair: a delegator may have unbonded since, and that
    # only shows up here.
    now = time.time()
    rows = db.query(Delegation).all()
    for row in rows:
        row.amount = _chain.delegation_of(row.delegator, row.operator)
        row.updated_at = now
    return len(rows)


RELIC_SUPPLY = int(os.getenv("RELIC_SUPPLY", "50"))


def sync_relics(db) -> int:
    """Refresh the relic ownership mirror from chain. Returns holders known.

    Scheduler job, never called from a request or from settlement. Reading all
    50 owners takes 50 eth_calls; doing that per node per epoch is exactly the
    shape of chain access that took the coordinator down, so settlement reads
    this table instead and never touches the chain.
    """
    owners = _chain.relic_owners(RELIC_SUPPLY)
    if owners is None:
        # Unreadable, not empty. Leave the previous mirror alone — wiping it
        # would silently drop every relic holder back to 1x.
        return db.query(RelicHolder).count()

    now = time.time()
    seen = set()
    for tid, owner in owners.items():
        row = db.get(RelicHolder, tid) or RelicHolder(token_id=tid)
        row.owner = owner
        row.multiplier = relic_multiplier(tid)
        row.updated_at = now
        db.merge(row)
        seen.add(tid)
    # A relic that vanished from the read was burned or never minted.
    for row in db.query(RelicHolder).all():
        if row.token_id not in seen:
            db.delete(row)
    db.flush()
    return len(seen)


def relic_multiplier(token_id: int) -> int:
    """Mirror of NodeRelic.multiplierOf — tier is derived from the id.

    Duplicated here rather than read from chain because it is a pure function of
    the id and settlement must not make network calls. If the contract's
    boundaries ever change, this must change with it.
    """
    if token_id <= 5:
        return 11      # Emergent
    if token_id <= 15:
        return 7       # Canopy
    if token_id <= 30:
        return 5       # Understory
    return 2           # Bracken


def relic_multipliers(db) -> dict[str, int]:
    """{operator_address_lower: best multiplier held}. One query, no chain.

    Best rather than sum: hoarding relics in one wallet must not compound into
    an unbounded multiplier. This mirrors NodeRelic.multiplierFor exactly.
    """
    out: dict[str, int] = {}
    for row in db.query(RelicHolder).all():
        if not row.owner:
            continue
        key = row.owner.lower()
        if row.multiplier > out.get(key, 1):
            out[key] = row.multiplier
    return out


def split_earnings(earned: float, self_stake: float, delegations: list) -> tuple[float, dict]:
    """Divide one operator's epoch earnings with the stake backing it.

    Returns (operator_share, {delegator: share}). Stake-weighted: each party is
    paid in proportion to what it staked, and the operator additionally takes
    OPERATOR_COMMISSION of the delegators' portion.

    With no delegators this is the whole amount to the operator, which is what
    keeps the un-delegated case unchanged.
    """
    delegated_total = sum(d.amount for d in delegations if d.amount > 0)
    backing = self_stake + delegated_total
    if delegated_total <= 0 or backing <= 0 or earned <= 0:
        return (earned, {})

    to_delegators = earned * (delegated_total / backing) * (1.0 - OPERATOR_COMMISSION)
    shares = {d.delegator: to_delegators * (d.amount / delegated_total)
              for d in delegations if d.amount > 0}
    return (earned - sum(shares.values()), shares)


def close_epoch() -> dict:
    """Settle the current epoch. Returns {root, accounts, claims}.

    Nodes with a quorum still in flight are held back: settling a node's minutes
    into cumulative_reward makes them claimable, and voiding a liar's earnings
    only works while they're still unsettled. A quorum can take minutes to reach
    its deadline, which is several epochs — so anyone awaiting a verdict rolls
    over to the next epoch instead. Honest nodes lose nothing; they're paid one
    epoch later.
    """
    with session_scope() as db:
        sync_delegations(db)
        by_operator: dict[str, list] = {}
        for d in db.query(Delegation).filter(Delegation.amount > 0).all():
            by_operator.setdefault(d.operator.lower(), []).append(d)

        # Only nodes awaiting a verdict on a quorum that is STILL OPEN. This used
        # to select every pending row regardless of its quorum's state, and
        # settle() leaves a node that never answered on 'pending' forever — so a
        # single missed challenge excluded an operator from settlement
        # permanently. Their minutes accrued and never became claimable: 2.4M
        # THKT was stranded this way, across roughly half the network.
        # One lookup for the whole epoch rather than one per node.
        relic_mult = relic_multipliers(db)

        awaiting = {addr for (addr,) in
                    db.query(QuorumResult.node_address)
                      .join(Quorum, Quorum.id == QuorumResult.quorum_id)
                      .filter(QuorumResult.verdict == "pending",
                              Quorum.status == "open")
                      .all()}
        nodes = db.query(Node).all()
        held = 0
        paid_out = 0.0
        for node in nodes:
            if node.address in awaiting:
                held += 1
                continue
            # Two components: time online, plus a share of what buyers paid for
            # the work this node actually did.
            #
            # A relic multiplies the UPTIME half only. Multiplying the work share
            # would pay a holder more than the buyer paid for that job, taking
            # the difference out of the pool — the revenue share exists precisely
            # so paid work cannot become an unbounded claim on it.
            mult = relic_mult.get(node.address.lower(), 1)
            earned = node.contribution_minutes * REWARD_PER_MINUTE * mult + node.work_thkt
            node.contribution_minutes = 0.0
            node.work_thkt = 0.0

            delegations = by_operator.get(node.address.lower(), [])
            # One chain read per node per epoch is one read too many: at 1,400
            # nodes and 60-second epochs that is 1,400 eth_calls a minute, inside
            # the transaction, while holding a pool connection. Self-stake only
            # affects the answer when there is delegated stake to weigh it
            # against — split_earnings returns the whole amount untouched
            # otherwise — so nodes with no delegations skip the call entirely.
            self_stake = _chain.operator_stake(node.address)[0] if delegations else 0.0
            operator_share, delegator_shares = split_earnings(earned, self_stake, delegations)

            node.cumulative_reward += operator_share
            for d in delegations:
                share = delegator_shares.get(d.delegator, 0.0)
                if share > 0:
                    d.cumulative_reward += share
                    paid_out += share

        # One leaf per address. An address can be both an operator and someone
        # else's delegator, and two leaves for one account would break the
        # cumulative-claim model — so totals are summed before the tree is built.
        totals: dict[str, float] = {}
        for node in nodes:
            if node.cumulative_reward > 0:
                totals[node.address] = totals.get(node.address, 0.0) + node.cumulative_reward
        for d in db.query(Delegation).filter(Delegation.cumulative_reward > 0).all():
            totals[d.delegator] = totals.get(d.delegator, 0.0) + d.cumulative_reward

        entries = [(addr, int(amt * 1e18)) for addr, amt in totals.items() if amt > 0]
        tree = MerkleTree(entries)
        # commit happens on context exit; publish after so state is durable first
    invalidate_claims_cache()   # settlement just changed every balance
    root = tree.root_hex()
    tx, error = None, None
    try:
        tx = _chain.publish_root(root)
    except Exception as exc:  # noqa: BLE001 — out of gas, RPC down, nonce clash
        error = f"{type(exc).__name__}: {exc}"

    _last_publish.update(
        at=time.time(), ok=error is None, root=root, tx=tx, error=error,
        consecutive_failures=0 if error is None
        else _last_publish["consecutive_failures"] + 1,
    )
    return {"root": root, "accounts": len(entries), "held": held,
            "to_delegators": round(paid_out, 6), "published": error is None,
            "publish_error": error, "tx": tx, "claims": tree.claims()}


# The claim table only changes when an epoch settles, but it was rebuilt from
# scratch — every node, every delegation, a whole Merkle tree — on every single
# poll of /node/{address}. Cached for CLAIMS_TTL_S and dropped on settlement.
CLAIMS_TTL_S = float(os.getenv("CLAIMS_TTL_S", "15"))
_claims_cache: dict = {"at": 0.0, "claims": None}


def invalidate_claims_cache() -> None:
    _claims_cache["at"] = 0.0
    _claims_cache["claims"] = None


def current_claims(db=None) -> dict:
    """Claim table from already-settled cumulative rewards (for the UI).

    Pass the caller's session when there is one. Opening its own while the
    request already held one meant every /node/{address} took *two* of the
    pool's connections, which is half the reason the pool ran dry.
    """
    now = time.time()
    if _claims_cache["claims"] is not None and now - _claims_cache["at"] < CLAIMS_TTL_S:
        return _claims_cache["claims"]

    def build(session) -> dict:
        totals: dict[str, float] = {}
        for n in session.query(Node).all():
            if n.cumulative_reward > 0:
                totals[n.address] = totals.get(n.address, 0.0) + n.cumulative_reward
        for d in session.query(Delegation).filter(Delegation.cumulative_reward > 0).all():
            totals[d.delegator] = totals.get(d.delegator, 0.0) + d.cumulative_reward
        entries = [(a, int(v * 1e18)) for a, v in totals.items() if v > 0]
        return MerkleTree(entries).claims()

    if db is not None:
        claims = build(db)
    else:
        with session_scope() as session:
            claims = build(session)

    _claims_cache.update(at=now, claims=claims)
    return claims


def _cluster_singleton(fn, job_id: str, interval_s: float = 0.0):
    """Wrap a scheduled job so exactly one worker in the cluster runs it.

    With more than one uvicorn worker every process has its own scheduler, and
    two of them settling the same epoch would double-credit operators and build
    two transactions with the same nonce on the publisher key. A Postgres
    advisory lock arbitrates: whoever takes it runs, the others return
    immediately.

    Taken per run rather than held for the process lifetime, so there is no
    permanent leader to lose. If the worker that ran the last epoch dies, the
    next tick is simply won by another one.
    """
    # Stable 63-bit key from the job name, so every worker computes the same one.
    key = zlib.crc32(job_id.encode()) & 0x7FFFFFFF

    counter = f"ran_{job_id}"[:40]

    def wrapped():
        if engine.dialect.name != "postgresql":
            return fn()          # sqlite: one process, nothing to arbitrate
        with engine.connect() as conn:
            got = conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key}).scalar()
            if not got:
                return None
            try:
                # Mutual exclusion alone is not enough. Every worker runs its own
                # timer with its own offset, so they do not collide — they simply
                # take turns, and the job runs once PER WORKER per interval. With
                # four workers that quadrupled epoch settlement and the gas that
                # goes with it. So the last run is recorded in the database and a
                # tick that arrives too soon after it does nothing.
                now = time.time()
                last = conn.execute(text("SELECT value FROM counters WHERE name = :n"),
                                    {"n": counter}).scalar()
                if last and interval_s and now - last < interval_s * 0.9:
                    return None
                conn.execute(text(
                    "INSERT INTO counters (name, value) VALUES (:n, :v) "
                    "ON CONFLICT (name) DO UPDATE SET value = :v"), {"n": counter, "v": int(now)})
                conn.commit()
                return fn()
            finally:
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})

    wrapped.__name__ = f"{job_id}_singleton"
    return wrapped


def start_scheduler() -> None:
    global _scheduler
    if _scheduler or EPOCH_SECONDS <= 0:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(_cluster_singleton(close_epoch, "close_epoch", EPOCH_SECONDS),
                       "interval", seconds=EPOCH_SECONDS, id="close_epoch",
                       max_instances=1, coalesce=True)
    _scheduler.start()


def schedule(fn, seconds: int, job_id: str, *, singleton: bool = True) -> None:
    """Register another periodic task on the shared scheduler (no-op if the
    scheduler is disabled).

    `singleton=True` (the default) means one worker in the cluster runs it —
    correct for anything that changes shared database or chain state, where a
    second worker doing the same work would double it.

    `singleton=False` means EVERY worker runs it. That is what a job refreshing
    a per-process in-memory cache needs: locking it to one worker leaves the
    other workers' copies frozen at whatever they lazily loaded first, and the
    value each caller sees then depends on which worker answered. That is
    exactly how a 2.5M THKT deposit failed to appear on the dashboard while
    sitting in the contract.
    """
    if not _scheduler or seconds <= 0:
        return
    job = _cluster_singleton(fn, job_id, seconds) if singleton else fn
    _scheduler.add_job(job, "interval", seconds=seconds, id=job_id,
                       max_instances=1, coalesce=True)


def chain_bridge() -> ChainBridge:
    return _chain
