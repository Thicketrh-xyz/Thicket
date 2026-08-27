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

from apscheduler.schedulers.background import BackgroundScheduler

from .chain import ChainBridge
from .db import Counter, Delegation, Node, QuorumResult, session_scope
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

        awaiting = {r.node_address for r in
                    db.query(QuorumResult).filter(QuorumResult.verdict == "pending").all()}
        nodes = db.query(Node).all()
        held = 0
        paid_out = 0.0
        for node in nodes:
            if node.address in awaiting:
                held += 1
                continue
            # Two components: time online, plus a share of what buyers paid for
            # the work this node actually did.
            earned = node.contribution_minutes * REWARD_PER_MINUTE + node.work_thkt
            node.contribution_minutes = 0.0
            node.work_thkt = 0.0

            delegations = by_operator.get(node.address.lower(), [])
            self_stake, _ = _chain.operator_stake(node.address)
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
    _chain.publish_root(tree.root_hex())
    return {"root": tree.root_hex(), "accounts": len(entries), "held": held,
            "to_delegators": round(paid_out, 6), "claims": tree.claims()}


def current_claims() -> dict:
    """Claim table from already-settled cumulative rewards (for the UI)."""
    with session_scope() as db:
        totals: dict[str, float] = {}
        for n in db.query(Node).all():
            if n.cumulative_reward > 0:
                totals[n.address] = totals.get(n.address, 0.0) + n.cumulative_reward
        for d in db.query(Delegation).filter(Delegation.cumulative_reward > 0).all():
            totals[d.delegator] = totals.get(d.delegator, 0.0) + d.cumulative_reward
        entries = [(a, int(v * 1e18)) for a, v in totals.items() if v > 0]
    return MerkleTree(entries).claims()


def start_scheduler() -> None:
    global _scheduler
    if _scheduler or EPOCH_SECONDS <= 0:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(close_epoch, "interval", seconds=EPOCH_SECONDS, id="close_epoch",
                       max_instances=1, coalesce=True)
    _scheduler.start()


def schedule(fn, seconds: int, job_id: str) -> None:
    """Register another periodic task on the shared scheduler (no-op if the
    scheduler is disabled)."""
    if not _scheduler or seconds <= 0:
        return
    _scheduler.add_job(fn, "interval", seconds=seconds, id=job_id,
                       max_instances=1, coalesce=True)


def chain_bridge() -> ChainBridge:
    return _chain
