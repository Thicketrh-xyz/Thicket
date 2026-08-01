"""
Verifiable inference challenge — the anti-sybil core.

The problem: rewarding uptime invites fake nodes with no GPU. So each node
must periodically execute a *task the coordinator can verify* and return the
correct result within a deadline; failure voids the earning window and
repeated failure gets the operator's bond slashed.

MVP task: a deterministic, seed-driven integer matrix multiply mod a prime,
hashed with keccak. Deterministic across machines (pure integer math — no
float nondeterminism), so the coordinator verifies by recomputing. It
requires real compute, and the size knob scales the cost.

Honesty about limits: recomputation proves *work was performed and is
correct*; it does not by itself prove the work ran on a GPU or on a specific
model. Hardening paths (post-MVP):
  - assign the SAME challenge to k random nodes and take the majority (cheap,
    strong against a minority of liars) — redundant execution;
  - swap this task for a seeded run of the real model (SD-Turbo / small LLM),
    verified by the same redundancy;
  - eventually, the ZK route Crynux takes.

The interface (make_challenge / solve / verify) stays identical when the task
is swapped, so the rest of the system doesn't change.
"""
from __future__ import annotations

from dataclasses import dataclass

from eth_utils import keccak

_PRIME = (1 << 61) - 1  # Mersenne prime, keeps products in 64-bit-ish range


@dataclass
class Challenge:
    challenge_id: str
    seed: int
    size: int          # NxN matrices; scales compute cost
    deadline_s: int

    def to_dict(self) -> dict:
        return {
            "id": self.challenge_id,
            "seed": self.seed,
            "size": self.size,
            "deadline_s": self.deadline_s,
            "type": "matmul-v1",
        }


def make_challenge(challenge_id: str, seed: int, size: int = 256, deadline_s: int = 60) -> Challenge:
    return Challenge(challenge_id=challenge_id, seed=seed, size=size, deadline_s=deadline_s)


def _lcg(seed: int):
    """Deterministic PRNG (same on every machine). Numorous Recipes LCG."""
    state = seed & 0xFFFFFFFFFFFFFFFF
    while True:
        state = (6364136223846793005 * state + 1442695040888963407) & 0xFFFFFFFFFFFFFFFF
        yield state % _PRIME


def solve(challenge: Challenge) -> str:
    """Run the task and return the 0x-hex output hash. Node and coordinator
    both call this; they must agree. Pure integer math => deterministic."""
    n = challenge.size
    rng = _lcg(challenge.seed)
    a = [[next(rng) for _ in range(n)] for _ in range(n)]
    b = [[next(rng) for _ in range(n)] for _ in range(n)]

    # C = A·B mod PRIME, folded into a running keccak of each row.
    digest = b""
    for i in range(n):
        row = bytearray()
        ai = a[i]
        for j in range(n):
            acc = 0
            for k in range(n):
                acc = (acc + ai[k] * b[k][j]) % _PRIME
            row += acc.to_bytes(8, "big")
        digest = keccak(digest + bytes(row))
    return "0x" + digest.hex()


def verify(challenge: Challenge, submitted_hash: str) -> bool:
    return submitted_hash.lower() == solve(challenge).lower()
