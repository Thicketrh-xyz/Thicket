"""
Redundant execution — k nodes, one task, majority wins.

The old check (`challenge.py::verify`) works by having the coordinator recompute
the answer. That only holds while the task is deterministic integer math. It
cannot survive a real model: the coordinator would have to do the same work as
the node, which makes the network pointless, and GPU float ordering means two
honest nodes don't even produce identical bits.

So the checker stops being "one trusted machine that recomputes" and becomes
"several independent machines that agree". The coordinator never computes the
answer here — it only counts votes.

Shape of it:

    task ──┬── node A ──▶ output_1 ─┐
           ├── node B ──▶ output_1 ─┼──▶ tally ──▶ consensus = output_1
           └── node C ──▶ output_9 ─┘         A,B agreed · C disagreed

Selection is *push*, not pull: the coordinator picks k random online nodes when
it opens the quorum and writes a pending row for each. A node is handed the task
on its next heartbeat only if a row is waiting for it. This matters — heartbeat
timing is node-controlled, so a pull model ("first k nodes to ask get it") would
let one operator spam heartbeats and occupy every slot in a quorum, which is
exactly the collusion the bond is supposed to make expensive.

What settlement does:
  - agreed      nodes keep their earnings
  - disagreed   earnings for the window voided, strike counter +1 (3 -> slash)
  - inconclusive nobody is punished
  - absent      a node that missed the deadline is *absent*, not *wrong*

Absence and inconclusiveness are deliberately unpunished. Once model output is
nondeterministic an honest node must never be slashed because two others
produced legitimately different text.

Known ceiling: this assumes an attacker doesn't control a majority of a randomly
selected group. Random selection plus the THKT bond is what makes that
expensive. It is not absolute, and ZK is the eventual answer.
"""
from __future__ import annotations

import difflib
import os
import re
import secrets
import time

from eth_utils import keccak

from .db import Node, Quorum, QuorumResult

# --- knobs ------------------------------------------------------------------
# k=3 tolerates one liar and gives an unambiguous 2-of-3 majority. k=2 can't
# break a tie; k=5 is stronger but costs 5x and needs 5 nodes online to run at
# all — which on a small network means it never runs.
QUORUM_K = int(os.getenv("QUORUM_K", "3"))
# Verifying every paid job triples network compute. Instead, police a random
# sample: cheating becomes a gamble against a slashable bond.
SPOT_CHECK_RATE = float(os.getenv("QUORUM_SPOT_CHECK", "0.10"))
QUORUM_DEADLINE_S = int(os.getenv("QUORUM_DEADLINE_S", "300"))
# A single vote is never a majority of anything, so consensus needs at least two
# nodes saying the same thing regardless of how many showed up.
MIN_VOTES = 2

# How alike two model answers must be to count as agreement. Exact equality is
# right for the deterministic challenge and hopeless for generated text.
JOB_AGREE_THRESHOLD = float(os.getenv("QUORUM_JOB_THRESHOLD", "0.72"))

_rand = secrets.SystemRandom()


# --- agreement --------------------------------------------------------------
# Everything below the tally is kind-agnostic. Swapping how two answers are
# compared is the *only* change needed when the task changes, which is the whole
# reason to build the machinery now while the task is still cheap.

def digest(output: str) -> str:
    """Stable hash of an answer, for storage and cheap equality."""
    return "0x" + keccak(text=output or "").hex()


def _normalise(text: str) -> str:
    """Strip the differences that never mean disagreement: case, punctuation
    spacing, and how much whitespace a model felt like emitting."""
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def agree_challenge(a: str, b: str) -> bool:
    """Deterministic integer math — the hashes match exactly or they don't."""
    return (a or "").lower() == (b or "").lower()


def agree_job(a: str, b: str) -> bool:
    """Model output. Two honest nodes running the same prompt produce text that
    is close, not identical — different hardware, quantisation and kernel order
    all move tokens around. So compare by similarity, not equality.

    This is a heuristic and it is tunable (QUORUM_JOB_THRESHOLD). Set it too low
    and a liar returning vaguely on-topic filler passes; too high and honest
    nodes are marked as disagreeing. Pinning the node's sampling (temperature 0
    plus a shared per-job seed) is what keeps honest answers close enough for
    this to have a workable window at all.
    """
    na, nb = _normalise(a), _normalise(b)
    if na == nb:
        return True
    if not na or not nb:
        return False
    return difflib.SequenceMatcher(None, na, nb).ratio() >= JOB_AGREE_THRESHOLD


def comparator(kind: str):
    return agree_job if kind == "job" else agree_challenge


def tally(answers: list[str], kind: str) -> tuple[str | None, list[list[int]]]:
    """Group answers into clusters of mutually-agreeing votes and pick a winner.

    Returns (consensus, clusters-as-index-lists). Consensus is None when there
    is no clear majority: a tie for the top spot, or too few votes to call one.

    Clustering (rather than counting identical hashes) is what makes the
    comparator swappable — with a tolerance function "identical" isn't an
    equivalence relation, so a dict keyed on the answer would quietly stop
    working.
    """
    same = comparator(kind)
    clusters: list[list[int]] = []
    for i, ans in enumerate(answers):
        for c in clusters:
            if same(ans, answers[c[0]]):
                c.append(i)
                break
        else:
            clusters.append([i])

    clusters.sort(key=len, reverse=True)
    if not clusters or len(clusters[0]) < MIN_VOTES:
        return None, clusters
    if len(clusters) > 1 and len(clusters[1]) == len(clusters[0]):
        return None, clusters          # dead heat — no majority
    return answers[clusters[0][0]], clusters


# --- lifecycle --------------------------------------------------------------

def eligible_nodes(db, online_since: float, capability: str = "") -> list[Node]:
    """Registered (therefore bonded), heartbeating, and able to do the work."""
    nodes = db.query(Node).filter(Node.last_heartbeat >= online_since).all()
    if capability:
        nodes = [n for n in nodes if capability in (n.capabilities or "").split(",")]
    return nodes


def open_quorum(db, kind: str, *, ref: str = "", seed: int = 0, size: int = 0,
                candidates: list[Node], required: int = QUORUM_K,
                must_include: str = "") -> Quorum | None:
    """Pick `required` random nodes and reserve a slot for each.

    Returns None when there aren't enough eligible nodes — the caller falls back
    to the single-node path rather than halting verification, which is what keeps
    a one-node network working.
    """
    if len(candidates) < required:
        return None

    chosen: list[Node] = []
    pool = list(candidates)
    if must_include:
        for n in pool:
            if n.address.lower() == must_include.lower():
                chosen.append(n)
                pool.remove(n)
                break
    chosen += _rand.sample(pool, required - len(chosen))

    now = time.time()
    q = Quorum(id=secrets.token_hex(8), kind=kind, ref=ref, seed=seed, size=size,
               required=required, status="open", created_at=now,
               deadline=now + QUORUM_DEADLINE_S)
    db.add(q)
    for n in chosen:
        db.add(QuorumResult(id=f"{q.id}:{n.address.lower()}", quorum_id=q.id,
                            node_address=n.address, verdict="pending"))
    db.flush()      # the session runs with autoflush off; make the slots queryable
    return q


def pending_slot(db, quorum_id: str, address: str) -> QuorumResult | None:
    """This node's unfilled slot in a quorum, if it has one."""
    row = db.get(QuorumResult, f"{quorum_id}:{address.lower()}")
    return row if row and not row.output_hash else None


def record_vote(db, q: Quorum, address: str, output: str) -> bool:
    """Store one node's answer. False if this node wasn't asked, or already voted."""
    slot = pending_slot(db, q.id, address)
    if not slot:
        return False
    slot.output = output
    slot.output_hash = digest(output)
    slot.submitted_at = time.time()
    db.flush()      # is_full() and settle() read this back by query, not identity
    return True


def settle(db, q: Quorum, *, on_agree=None, on_disagree=None) -> dict:
    """Tally the votes in and hand each node its verdict.

    Called when every slot is filled or the deadline passes. Nodes that never
    answered keep verdict 'pending' — absent, not wrong.
    """
    rows = [r for r in db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id).all()
            if r.output_hash]
    # Always compare what the node actually submitted. For a challenge that is
    # already a hash; output_hash is a derived index, and tallying on it would
    # record a hash of a hash as the consensus.
    answers = [r.output or "" for r in rows]
    consensus, clusters = tally(answers, q.kind)

    if consensus is None:
        q.status = "inconclusive"
        q.settled_at = time.time()
        for r in db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id).all():
            if r.verdict == "pending" and not r.output_hash:
                r.verdict = "absent"
        # Punish nobody. All k differing is exactly what honest nondeterminism
        # looks like, and re-running it on fresh nodes is the safe response.
        return {"id": q.id, "status": q.status, "votes": len(rows),
                "agreed": [], "disagreed": []}

    winners = {rows[i].node_address for i in clusters[0]}
    agreed, disagreed = [], []
    for r in rows:
        if r.node_address in winners:
            r.verdict = "agreed"
            agreed.append(r.node_address)
            if on_agree:
                on_agree(db, r.node_address, q)
        else:
            r.verdict = "disagreed"
            disagreed.append(r.node_address)
            if on_disagree:
                on_disagree(db, r.node_address, q)

    # Everyone who never answered gets a terminal verdict. Leaving them on
    # 'pending' after the quorum has closed is what stranded operators in
    # settlement: the row outlives the quorum and nothing ever clears it.
    # 'absent' is not a strike — it is still "absent, not wrong".
    for r in db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id).all():
        if r.verdict == "pending" and not r.output_hash:
            r.verdict = "absent"

    q.status = "settled"
    q.consensus = consensus
    q.settled_at = time.time()
    return {"id": q.id, "status": q.status, "votes": len(rows),
            "agreed": agreed, "disagreed": disagreed}


def is_settleable(db, q: Quorum) -> bool:
    """True once no further vote can arrive — every slot has either answered or
    dropped out. Waiting for the deadline when a selected node's inference has
    already crashed just makes the buyer wait for nothing."""
    rows = db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id).all()
    if sum(1 for r in rows if r.output_hash) >= q.required:
        return True
    return not any(r.verdict == "pending" and not r.output_hash for r in rows)


def due_quorums(db, now: float | None = None) -> list[Quorum]:
    """Open quorums whose deadline has passed."""
    now = now or time.time()
    return db.query(Quorum).filter(Quorum.status == "open", Quorum.deadline <= now).all()


def slots_for(db, address: str) -> list[QuorumResult]:
    """Every slot this node still owes an answer for, dispatched or not."""
    return (db.query(QuorumResult)
              .filter(QuorumResult.node_address == address, QuorumResult.output_hash == "",
                      QuorumResult.verdict == "pending")
              .all())


def due_for_dispatch(slots: list[QuorumResult], redispatch_after: float) -> list[QuorumResult]:
    """The subset that should be handed over on this beat.

    A slot already given out is withheld until `redispatch_after` seconds have
    passed. Without that, a node heartbeating every 30s would be re-handed the
    same job on every beat while still running it, and would execute it several
    times over. Re-offering after the timeout is what recovers a slot from a node
    that took the work and disappeared.

    Note the distinction from `slots_for`: a node with an outstanding slot is
    *busy*, even when that slot isn't due to be re-sent — so it must not be given
    fresh work either.
    """
    cutoff = time.time() - redispatch_after
    return [r for r in slots if not r.dispatched_at or r.dispatched_at <= cutoff]


def mark_dispatched(db, slot: QuorumResult | None) -> None:
    if slot is not None:
        slot.dispatched_at = time.time()


def should_spot_check() -> bool:
    return _rand.random() < SPOT_CHECK_RATE
