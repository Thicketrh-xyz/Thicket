"""
Thicket Node — the client users run to earn THKT.

Loop: register (signed) -> heartbeat every 30s (signed) -> when the
coordinator hands back a challenge, run it locally and submit the result.
Earnings accrue server-side; the user claims THKT on-chain from the UI.

The challenge solver here is intentionally the SAME function the coordinator
uses to verify — see thicket_node/work.py. Swap it for a real GPU model
runtime later without touching this loop.
"""
from __future__ import annotations

import time

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

from .work import solve_challenge

COORDINATOR_URL = "http://localhost:8000"
HEARTBEAT_INTERVAL = 30


class ThicketNode:
    def __init__(self, private_key: str, node_id: str, coordinator: str = COORDINATOR_URL):
        self.acct = Account.from_key(private_key)
        self.address = self.acct.address
        self.node_id = node_id
        self.coordinator = coordinator

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
        self.register()
        while True:
            try:
                self._beat()
            except Exception as e:  # noqa: BLE001 — keep the node alive
                print(f"[thicket] heartbeat error: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

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

    def _handle_challenge(self, challenge: dict) -> None:
        print(f"[thicket] challenge {challenge['id']} — solving {challenge['type']}")
        output_hash = solve_challenge(challenge)
        requests.post(f"{self.coordinator}/challenge/result",
                      json={"address": self.address, "challenge_id": challenge["id"],
                            "output_hash": output_hash}, timeout=120)


if __name__ == "__main__":
    # Dev key — DO NOT use on mainnet. Generate/import a real key for prod.
    node = ThicketNode(private_key="0x" + "11" * 32, node_id="node-1")
    node.run()
