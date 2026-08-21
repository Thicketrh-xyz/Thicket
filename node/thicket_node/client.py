"""
Thicket Node — the client users run to earn THKT.

Flow: load wallet from node/.env -> bond as operator on-chain (if configured)
-> register with the coordinator (signed) -> heartbeat every N seconds ->
solve verification challenges the coordinator issues.

Run:
    cd node
    cp .env.example .env        # set THICKET_PRIVATE_KEY (and fund it)
    python -u -m thicket_node.client
"""
from __future__ import annotations

import time

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

from .bond import ensure_bonded
from .config import config
from .work import run_job, solve_challenge


class ThicketNode:
    def __init__(self, cfg):
        self.cfg = cfg
        self.acct = Account.from_key(cfg.private_key)
        self.address = self.acct.address
        self.node_id = cfg.node_id
        self.coordinator = cfg.coordinator_url

    def _sign(self, message: str) -> str:
        return self.acct.sign_message(encode_defunct(text=message)).signature.hex()

    def register(self) -> None:
        msg = f"thicket-register:{self.address}:{self.node_id}"
        r = requests.post(f"{self.coordinator}/register",
                          json={"address": self.address, "node_id": self.node_id,
                                "signature": self._sign(msg)}, timeout=10)
        r.raise_for_status()
        print(f"[thicket] registered {self.address} — {r.json()['reward_per_minute']} THKT/min")

    def run(self) -> None:
        print(f"[thicket] node {self.address} (id={self.node_id})")
        print(f"[thicket] {ensure_bonded(self.cfg, self.acct)}")
        self.register()
        while True:
            try:
                self._beat()
            except Exception as e:  # noqa: BLE001 — keep the node alive
                print(f"[thicket] heartbeat error: {e}")
            time.sleep(self.cfg.heartbeat_interval)

    def _beat(self) -> None:
        ts = int(time.time())
        msg = f"thicket-heartbeat:{self.address}:{ts}"
        r = requests.post(f"{self.coordinator}/heartbeat",
                          json={"address": self.address, "timestamp": ts,
                                "signature": self._sign(msg)}, timeout=15)
        r.raise_for_status()
        data = r.json()
        print(f"[thicket] online — {data['minutes']:.2f} contribution minutes")
        if data.get("challenge"):
            self._handle_challenge(data["challenge"])
        if data.get("job"):
            self._handle_job(data["job"])

    def _handle_job(self, job: dict) -> None:
        print(f"[thicket] compute job {job['id']} — running")
        result = run_job(job["prompt"])
        requests.post(f"{self.coordinator}/jobs/{job['id']}/result",
                      json={"address": self.address, "result": result}, timeout=120)
        print(f"[thicket] job {job['id']} done")

    def _handle_challenge(self, challenge: dict) -> None:
        print(f"[thicket] challenge {challenge['id']} — solving {challenge['type']}")
        output_hash = solve_challenge(challenge)
        r = requests.post(f"{self.coordinator}/challenge/result",
                          json={"address": self.address, "challenge_id": challenge["id"],
                                "output_hash": output_hash}, timeout=120)
        ok = r.ok and r.json().get("ok")
        print(f"[thicket] challenge {'passed' if ok else 'FAILED'}")


def main() -> None:
    if not config.private_key:
        raise SystemExit(
            "No wallet key. Set THICKET_PRIVATE_KEY in node/.env (see node/.env.example).\n"
            "Generate one with:  python -c \"from eth_account import Account; a=Account.create(); "
            "print(a.address, a.key.hex())\""
        )
    ThicketNode(config).run()


if __name__ == "__main__":
    main()
