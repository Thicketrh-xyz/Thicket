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
from .db import Job, Node, SessionLocal, init_db
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
COMPUTE_PRICE_THKT = float(os.getenv("COMPUTE_PRICE_THKT", "10"))  # price per job

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
    return {
        "nodes": len(nodes),                                   # operators ever registered
        "active_nodes": online,                                # heartbeating right now
        "minutes_contributed": round(total_earned / REWARD_PER_MINUTE, 1),
        "thkt_earned": round(total_earned, 2),
        "pool_thkt": round(chain.pool_balance(), 2),           # rewards pool balance (on-chain)
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

    # Hand this online node a pending compute job, if any.
    job_payload = None
    pending = db.query(Job).filter(Job.status == "pending").order_by(Job.created_at).first()
    if pending:
        pending.status = "assigned"
        pending.assigned_node = req.address
        job_payload = {"id": pending.id, "prompt": pending.prompt}

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
    payment_tx: str = ""       # the fund() tx that paid into the pool
    payment_thkt: float = 0.0


class JobResultReq(BaseModel):
    address: str
    result: str


@app.get("/compute/price")
def compute_price():
    return {"price_thkt": COMPUTE_PRICE_THKT}


@app.post("/jobs")
def submit_job(req: JobReq, db: Session = Depends(get_db)):
    """Record a paid job. Payment is the on-chain fund() into the rewards pool;
    for the MVP we trust the client-provided tx (production would verify it on
    chain). The job is then assigned to the next online node via heartbeat."""
    if not req.prompt.strip():
        raise HTTPException(400, "empty prompt")

    # No reusing one payment for multiple jobs.
    if req.payment_tx and db.query(Job).filter(Job.payment_tx == req.payment_tx).first():
        raise HTTPException(400, "payment already used")

    # Verify the payment actually funded the pool (skipped only in DRY mode).
    if not chain.dry:
        if req.payment_thkt < COMPUTE_PRICE_THKT:
            raise HTTPException(402, f"payment below price ({COMPUTE_PRICE_THKT} THKT)")
        if not req.payment_tx or not chain.verify_payment(req.payment_tx, req.payer, COMPUTE_PRICE_THKT):
            raise HTTPException(402, "payment not verified on-chain")

    jid = secrets.token_hex(8)
    db.add(Job(
        id=jid, prompt=req.prompt[:2000], payer=req.payer,
        payment_thkt=req.payment_thkt, payment_tx=req.payment_tx,
        status="pending", created_at=time.time(),
    ))
    db.commit()
    return {"id": jid, "status": "pending"}


@app.get("/jobs/{jid}")
def get_job(jid: str, db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job:
        raise HTTPException(404, "no such job")
    return {"id": job.id, "status": job.status, "prompt": job.prompt,
            "result": job.result, "node": job.assigned_node}


@app.post("/jobs/{jid}/result")
def job_result(jid: str, req: JobResultReq, db: Session = Depends(get_db)):
    job = db.get(Job, jid)
    if not job or job.assigned_node != req.address:
        raise HTTPException(400, "not your job")
    job.result = (req.result or "")[:4000]
    job.status = "done"
    db.commit()
    return {"ok": True}


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
