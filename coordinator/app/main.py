"""
Thicket Coordinator — the off-chain brain of the hybrid DePIN loop.

Responsibilities:
  1. Register nodes and verify their signed heartbeats.
  2. Accrue "contribution minutes" per wallet while a node is online.
  3. Issue random inference *challenges* and verify results (anti-sybil).
  4. At each epoch, compute cumulative THKT owed per wallet, build a Merkle
     tree of (account, cumulativeAmount), and publish the root on-chain via
     RewardsDistributor.publishRoot().

This is an MVP skeleton: in-memory state, wired endpoints, TODOs where the
real crypto/economics go. Swap the in-memory store for Postgres + Redis
before testnet.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Thicket Coordinator", version="0.1.0")

# --- config (move to env) ---
HEARTBEAT_TIMEOUT_S = 90          # miss this long => considered offline
CHALLENGE_INTERVAL_S = 600        # ~every 10 min, node must pass a real task
REWARD_PER_MINUTE = 1.0          # THKT per verified online minute (tune!)


# --- in-memory state (replace with DB) ---
@dataclass
class Node:
    address: str
    node_id: str
    last_heartbeat: float = 0.0
    online_since: float = 0.0
    contribution_minutes: float = 0.0
    cumulative_reward: float = 0.0       # THKT owed all-time (the Merkle leaf)
    pending_challenge: str | None = None
    last_challenge_at: float = 0.0
    failed_challenges: int = 0


NODES: dict[str, Node] = {}


# --- request models ---
class RegisterReq(BaseModel):
    address: str
    node_id: str
    signature: str  # signs node_id with the operator key; TODO verify on-chain bond


class HeartbeatReq(BaseModel):
    address: str
    signature: str  # signs (address, timestamp); TODO verify ECDSA


class ChallengeResultReq(BaseModel):
    address: str
    challenge_id: str
    output_hash: str  # keccak of the deterministic inference output


# --- endpoints ---
@app.post("/register")
def register(req: RegisterReq):
    # TODO: verify the operator has an active bond in NodeStaking on-chain.
    NODES[req.address] = Node(address=req.address, node_id=req.node_id)
    return {"ok": True, "reward_per_minute": REWARD_PER_MINUTE}


@app.post("/heartbeat")
def heartbeat(req: HeartbeatReq):
    node = NODES.get(req.address)
    if not node:
        raise HTTPException(404, "not registered")
    # TODO: verify req.signature against req.address.
    now = time.time()

    # Credit elapsed online time if the node was already online.
    if node.last_heartbeat and (now - node.last_heartbeat) <= HEARTBEAT_TIMEOUT_S:
        node.contribution_minutes += (now - node.last_heartbeat) / 60.0
    else:
        node.online_since = now  # fresh online session

    node.last_heartbeat = now

    # Time to challenge this node?
    challenge = None
    if now - node.last_challenge_at >= CHALLENGE_INTERVAL_S:
        challenge = _issue_challenge(node, now)

    return {"ok": True, "minutes": round(node.contribution_minutes, 4), "challenge": challenge}


@app.post("/challenge/result")
def challenge_result(req: ChallengeResultReq):
    node = NODES.get(req.address)
    if not node or node.pending_challenge != req.challenge_id:
        raise HTTPException(400, "no such challenge")
    # TODO: recompute expected output_hash for this seeded task and compare.
    expected = _expected_output_hash(req.challenge_id)
    if req.output_hash != expected:
        node.failed_challenges += 1
        node.contribution_minutes = 0.0  # void this window's earnings
        # TODO: after N fails, call NodeStaking.slash() on-chain.
        return {"ok": False, "reason": "wrong output", "fails": node.failed_challenges}
    node.pending_challenge = None
    return {"ok": True}


@app.post("/epoch/close")
def close_epoch():
    """Convert accrued minutes to cumulative THKT and build the Merkle root."""
    leaves: list[tuple[str, int]] = []
    for node in NODES.values():
        node.cumulative_reward += node.contribution_minutes * REWARD_PER_MINUTE
        node.contribution_minutes = 0.0
        wei = int(node.cumulative_reward * 1e18)
        if wei > 0:
            leaves.append((node.address, wei))
    root = _merkle_root(leaves)
    # TODO: send RewardsDistributor.publishRoot(root) via the publisher key.
    return {"root": root, "accounts": len(leaves)}


# --- helpers (stubs) ---
def _issue_challenge(node: Node, now: float) -> dict:
    challenge_id = f"{node.address}:{int(now)}"
    node.pending_challenge = challenge_id
    node.last_challenge_at = now
    # TODO: real task spec — model id, seeded prompt, deadline.
    return {"id": challenge_id, "type": "sd_turbo", "seed": int(now), "deadline_s": 60}


def _expected_output_hash(challenge_id: str) -> str:
    # TODO: run the same seeded task on a reference node, or use redundant
    # cross-checking across multiple nodes and take the majority.
    return "TODO"


def _merkle_root(leaves: list[tuple[str, int]]) -> str:
    # TODO: keccak256(abi.encodePacked(addr, amount)) leaves, sorted-pair tree
    # matching OpenZeppelin MerkleProof.verify. Placeholder for now.
    return "0x" + "00" * 32
