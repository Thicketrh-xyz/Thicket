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


def run_job(job) -> str:
    """Execute a paid compute job.

    Accepts either a plain prompt string (legacy) or the full job dict from the
    coordinator: {kind, prompt, image}. Runs on the local model runtime; if no
    runtime is installed we say so plainly rather than returning fake output.
    """
    from .runtime import run as run_model, detect_capabilities

    if isinstance(job, str):
        kind, prompt, image, seed = "text", job, None, None
    else:
        kind = job.get("kind") or "text"
        prompt = job.get("prompt") or ""
        image = job.get("image")
        seed = job.get("seed")          # shared across every node running this job

    caps = detect_capabilities()
    if not caps["caps"]:
        # No model runtime on this machine. Be honest about it — never pretend
        # work happened. The node still earns from uptime + challenges.
        return {"ok": False, "output": "no model runtime installed on this node",
                "model": None, "seconds": 0.0}

    return run_model(kind, prompt, image, seed)   # {ok, output, model, seconds}


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
