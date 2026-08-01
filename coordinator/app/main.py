"""
Thicket Coordinator — the off-chain brain of the hybrid DePIN loop.

  1. Register nodes (verify EIP-191 signature + on-chain bond).
  2. Accrue "contribution minutes" per wallet from signed heartbeats.
  3. Issue random verifiable challenges; void earnings / slash on failure.
  4. At epoch close, build a cumulative-reward Merkle root and publish it.

MVP: in-memory state (swap for Postgres+Redis before testnet). The crypto
(signing, challenge, Merkle) and chain wiring are real.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import signing
from .challenge import make_challenge, verify as verify_challenge
from .chain import ChainBridge
from .merkle import MerkleTree

app = FastAPI(title="Thicket Coordinator", version="0.2.0")
chain = ChainBridge()

# --- config (move to env) ---
HEARTBEAT_TIMEOUT_S = 90
CHALLENGE_INTERVAL_S = 600
CHALLENGE_SIZE = 128
REWARD_PER_MINUTE = 1.0          # THKT per verified online minute (tune in economics pass!)
MAX_FAILS_BEFORE_SLASH = 3
SLASH_AMOUNT_WEI = 100 * 10**18  # portion of bond to slash per strike


@dataclass
class Node:
    address: str
    node_id: str
    last_heartbeat: float = 0.0
    contribution_minutes: float = 0.0
    cumulative_reward: float = 0.0
    pending_challenge_id: str | None = None
    pending_seed: int = 0
    last_challenge_at: float = 0.0
    failed_challenges: int = 0


NODES: dict[str, Node] = {}


class RegisterReq(BaseModel):
    address: str
    node_id: str
    signature: str


class HeartbeatReq(BaseModel):
    address: str
    timestamp: int
    signature: str


class ChallengeResultReq(BaseModel):
    address: str
    challenge_id: str
    output_hash: str


@app.post("/register")
def register(req: RegisterReq):
    msg = signing.register_message(req.address, req.node_id)
    if not signing.verify(msg, req.signature, req.address):
        raise HTTPException(401, "bad signature")
    if not chain.is_bonded(req.address):
        raise HTTPException(403, "operator not bonded on-chain")
    NODES[req.address] = Node(address=req.address, node_id=req.node_id)
    return {"ok": True, "reward_per_minute": REWARD_PER_MINUTE}


@app.post("/heartbeat")
def heartbeat(req: HeartbeatReq):
    node = NODES.get(req.address)
    if not node:
        raise HTTPException(404, "not registered")
    if not signing.fresh(req.timestamp):
        raise HTTPException(400, "stale timestamp")
    msg = signing.heartbeat_message(req.address, req.timestamp)
    if not signing.verify(msg, req.signature, req.address):
        raise HTTPException(401, "bad signature")

    now = time.time()
    if node.last_heartbeat and (now - node.last_heartbeat) <= HEARTBEAT_TIMEOUT_S:
        node.contribution_minutes += (now - node.last_heartbeat) / 60.0
    node.last_heartbeat = now

    challenge = None
    if now - node.last_challenge_at >= CHALLENGE_INTERVAL_S or node.last_challenge_at == 0:
        seed = int(now * 1000) ^ hash(node.address) & 0xFFFFFFFF
        ch = make_challenge(f"{node.address}:{int(now)}", seed=seed, size=CHALLENGE_SIZE)
        node.pending_challenge_id = ch.challenge_id
        node.pending_seed = seed
        node.last_challenge_at = now
        challenge = ch.to_dict()

    return {"ok": True, "minutes": round(node.contribution_minutes, 4), "challenge": challenge}


@app.post("/challenge/result")
def challenge_result(req: ChallengeResultReq):
    node = NODES.get(req.address)
    if not node or node.pending_challenge_id != req.challenge_id:
        raise HTTPException(400, "no such challenge")

    ch = make_challenge(req.challenge_id, seed=node.pending_seed, size=CHALLENGE_SIZE)
    if not verify_challenge(ch, req.output_hash):
        node.failed_challenges += 1
        node.contribution_minutes = 0.0  # void this window's earnings
        if node.failed_challenges >= MAX_FAILS_BEFORE_SLASH:
            chain.slash(node.address, SLASH_AMOUNT_WEI, "repeated failed challenges")
            node.failed_challenges = 0
        return {"ok": False, "reason": "wrong output", "fails": node.failed_challenges}

    node.pending_challenge_id = None
    node.failed_challenges = 0
    return {"ok": True}


@app.post("/epoch/close")
def close_epoch():
    """Roll accrued minutes into cumulative THKT, publish the Merkle root."""
    entries: list[tuple[str, int]] = []
    for node in NODES.values():
        node.cumulative_reward += node.contribution_minutes * REWARD_PER_MINUTE
        node.contribution_minutes = 0.0
        wei = int(node.cumulative_reward * 1e18)
        if wei > 0:
            entries.append((node.address, wei))

    tree = MerkleTree(entries)
    chain.publish_root(tree.root_hex())
    return {"root": tree.root_hex(), "accounts": len(entries), "claims": tree.claims()}


@app.get("/claims")
def claims():
    """Current claim table (address -> amount + proof) for the client UI."""
    entries = [(n.address, int(n.cumulative_reward * 1e18))
               for n in NODES.values() if n.cumulative_reward > 0]
    return MerkleTree(entries).claims()
