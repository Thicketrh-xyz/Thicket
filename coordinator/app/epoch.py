"""
Epoch settlement + scheduler.

close_epoch() rolls each node's accrued contribution minutes into its
cumulative THKT, builds the Merkle root, and publishes it on-chain (or logs it
in DRY mode). A background scheduler runs it every EPOCH_SECONDS so operators
don't have to be poked manually.
"""
from __future__ import annotations

import os

from apscheduler.schedulers.background import BackgroundScheduler

from .chain import ChainBridge
from .db import Node, QuorumResult, session_scope
from .merkle import MerkleTree

REWARD_PER_MINUTE = float(os.getenv("REWARD_PER_MINUTE", "1.0"))
EPOCH_SECONDS = int(os.getenv("EPOCH_SECONDS", "3600"))

_chain = ChainBridge()
_scheduler: BackgroundScheduler | None = None


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
        awaiting = {r.node_address for r in
                    db.query(QuorumResult).filter(QuorumResult.verdict == "pending").all()}
        nodes = db.query(Node).all()
        entries: list[tuple[str, int]] = []
        held = 0
        for node in nodes:
            if node.address in awaiting:
                held += 1
            else:
                node.cumulative_reward += node.contribution_minutes * REWARD_PER_MINUTE
                node.contribution_minutes = 0.0
            wei = int(node.cumulative_reward * 1e18)
            if wei > 0:
                entries.append((node.address, wei))
        tree = MerkleTree(entries)
        # commit happens on context exit; publish after so state is durable first
    _chain.publish_root(tree.root_hex())
    return {"root": tree.root_hex(), "accounts": len(entries), "held": held,
            "claims": tree.claims()}


def current_claims() -> dict:
    """Claim table from already-settled cumulative rewards (for the UI)."""
    with session_scope() as db:
        entries = [
            (n.address, int(n.cumulative_reward * 1e18))
            for n in db.query(Node).all()
            if n.cumulative_reward > 0
        ]
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
