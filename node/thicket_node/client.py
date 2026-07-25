"""
Thicket Node — the client users run on their machine to earn THKT.

Loop:
  1. Register with the coordinator (proving an on-chain operator bond).
  2. Send a signed heartbeat every HEARTBEAT_INTERVAL seconds.
  3. When the coordinator returns a challenge, run the real inference task
     locally on the GPU and submit the output hash.
  4. Earnings accrue server-side; the user claims THKT on-chain from the UI.

MVP skeleton — wire real signing + a real model runtime before testnet.
The Tauri desktop shell wraps this and displays live earnings.
"""
from __future__ import annotations

import hashlib
import time

import requests

COORDINATOR_URL = "http://localhost:8000"
HEARTBEAT_INTERVAL = 30  # seconds


class ThicketNode:
    def __init__(self, address: str, node_id: str, private_key: str):
        self.address = address
        self.node_id = node_id
        self.private_key = private_key  # TODO: use eth_account for real signing

    def _sign(self, message: str) -> str:
        # TODO: replace with eth_account.Account.sign_message (EIP-191).
        return hashlib.sha256((self.private_key + message).encode()).hexdigest()

    def register(self) -> None:
        r = requests.post(
            f"{COORDINATOR_URL}/register",
            json={"address": self.address, "node_id": self.node_id,
                  "signature": self._sign(self.node_id)},
            timeout=10,
        )
        r.raise_for_status()
        print(f"[thicket] registered — {r.json()['reward_per_minute']} THKT/min")

    def run(self) -> None:
        self.register()
        while True:
            try:
                self._beat()
            except Exception as e:  # noqa: BLE001 — keep the node alive
                print(f"[thicket] heartbeat error: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

    def _beat(self) -> None:
        ts = str(int(time.time()))
        r = requests.post(
            f"{COORDINATOR_URL}/heartbeat",
            json={"address": self.address, "signature": self._sign(self.address + ts)},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        print(f"[thicket] online — {data['minutes']:.2f} contribution minutes")
        if data.get("challenge"):
            self._handle_challenge(data["challenge"])

    def _handle_challenge(self, challenge: dict) -> None:
        print(f"[thicket] challenge {challenge['id']} — running {challenge['type']}")
        output = self._run_inference(challenge)
        output_hash = "0x" + hashlib.sha256(output).hexdigest()
        requests.post(
            f"{COORDINATOR_URL}/challenge/result",
            json={"address": self.address, "challenge_id": challenge["id"],
                  "output_hash": output_hash},
            timeout=30,
        )

    def _run_inference(self, challenge: dict) -> bytes:
        # TODO: load the model (SD-Turbo / small LLM), run the seeded task
        # deterministically, return raw bytes to hash. This is the work that
        # proves the node actually has a GPU.
        return f"stub-output-for-{challenge['id']}".encode()


if __name__ == "__main__":
    node = ThicketNode(address="0xB0B", node_id="node-1", private_key="dev-key")
    node.run()
