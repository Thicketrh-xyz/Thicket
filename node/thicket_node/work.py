"""
Node-side challenge solver.

MUST stay byte-for-byte identical to coordinator/app/challenge.py::solve —
the coordinator verifies by recomputing, so any divergence fails every
challenge. In production this becomes a shared package; duplicated here so the
node ships without the coordinator code. The real GPU model runtime plugs in
behind solve_challenge() without changing the client loop.
"""
from __future__ import annotations

from eth_utils import keccak

_PRIME = (1 << 61) - 1


def _lcg(seed: int):
    state = seed & 0xFFFFFFFFFFFFFFFF
    while True:
        state = (6364136223846793005 * state + 1442695040888963407) & 0xFFFFFFFFFFFFFFFF
        yield state % _PRIME


def run_job(prompt: str) -> str:
    """Execute a paid compute job. Placeholder 'inference' — a deterministic
    transform standing in for a real model runtime (the GPU model is the Sapling
    roadmap item; swap it in here without changing the client loop)."""
    from hashlib import sha256
    ref = sha256(prompt.encode()).hexdigest()[:10]
    words = len(prompt.split())
    return (f"[thicket-node output] processed prompt ({words} words). "
            f"A real model runs here in production. ref={ref}")


def solve_challenge(challenge: dict) -> str:
    n = challenge["size"]
    rng = _lcg(challenge["seed"])
    a = [[next(rng) for _ in range(n)] for _ in range(n)]
    b = [[next(rng) for _ in range(n)] for _ in range(n)]

    digest = b""
    for i in range(n):
        ai = a[i]
        row = bytearray()
        for j in range(n):
            acc = 0
            for k in range(n):
                acc = (acc + ai[k] * b[k][j]) % _PRIME
            row += acc.to_bytes(8, "big")
        digest = keccak(digest + bytes(row))
    return "0x" + digest.hex()
