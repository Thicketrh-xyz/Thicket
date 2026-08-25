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

import argparse
import getpass
import sys
import time

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

from .bond import ensure_bonded
from .config import Config
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
        ok = r.ok and r.json().get("ok")
        print(f"[thicket] challenge {'passed' if ok else 'FAILED'}")


def _normalise_key(k: str) -> str:
    """Accept a key with or without the 0x prefix, and strip stray quotes."""
    k = (k or "").strip().strip('"').strip("'")
    if k and not k.startswith("0x"):
        k = "0x" + k
    return k


def _new_wallet() -> None:
    acct = Account.create()
    key = acct.key.hex()
    if not key.startswith("0x"):
        key = "0x" + key
    print()
    print("New wallet created - save these somewhere safe:")
    print()
    print(f"  Address     : {acct.address}")
    print(f"  Private key : {key}")
    print()
    print("Fund it with THKT (for the bond) plus a little testnet ETH (for gas), then run:")
    print("  python -m thicket_node.client --key <YOUR_PRIVATE_KEY>")
    print()


def main() -> None:
    p = argparse.ArgumentParser(
        prog="thicket-node",
        description="Run a Thicket node: bond THKT, stay online, pass challenges, earn.",
    )
    p.add_argument("--key", "-k", help="wallet private key (or set THICKET_PRIVATE_KEY / node/.env)")
    p.add_argument("--node-id", help="a name for this node (default: node-1)")
    p.add_argument("--coordinator", dest="coordinator_url", help="coordinator URL")
    p.add_argument("--bond", dest="bond_amount", help="THKT to bond (default: contract minimum)")
    p.add_argument("--skip-bond", action="store_true", help="skip on-chain bonding (already bonded)")
    p.add_argument("--interval", type=int, dest="heartbeat_interval", help="seconds between heartbeats")
    p.add_argument("--new-wallet", action="store_true", help="generate a fresh wallet and exit")
    args = p.parse_args()

    if args.new_wallet:
        _new_wallet()
        return

    cfg = Config.load(
        private_key=_normalise_key(args.key) if args.key else "",
        node_id=args.node_id,
        coordinator_url=args.coordinator_url,
        bond_amount=args.bond_amount,
        skip_bond=args.skip_bond,
        heartbeat_interval=args.heartbeat_interval,
    )

    # Still no key? Ask for it (hidden input) instead of dying with an error.
    if not cfg.private_key:
        if not sys.stdin.isatty():
            raise SystemExit(
                "No wallet key.\n"
                "  Pass one:      python -m thicket_node.client --key 0xYOUR_KEY\n"
                "  Or save it:    echo 'THICKET_PRIVATE_KEY=0xYOUR_KEY' >> .env\n"
                "  No wallet yet: python -m thicket_node.client --new-wallet"
            )
        print("No wallet key found. Paste it below (input stays hidden),")
        print("or just press Enter to generate a new wallet.")
        print()
        entered = getpass.getpass("Private key: ").strip()
        if not entered:
            _new_wallet()
            return
        cfg.private_key = _normalise_key(entered)

    try:
        ThicketNode(cfg).run()
    except KeyboardInterrupt:
        print()
        print("[thicket] stopped. Your bond stays staked - run again to keep earning.")


if __name__ == "__main__":
    main()
