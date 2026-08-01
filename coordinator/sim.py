"""
End-to-end simulator — exercises the whole hybrid loop in-process, no server
and no chain required. Spins up N virtual nodes, registers them, sends signed
heartbeats, solves the challenges the coordinator issues, then closes an epoch
and prints the Merkle root + a sample proof.

Run:  python -m sim   (from the coordinator/ dir, with deps installed)
"""
from __future__ import annotations

import time

from eth_account import Account

from app import main as coord
from app import signing
from app.challenge import make_challenge, solve
from app.merkle import MerkleTree


def run(num_nodes: int = 4, beats: int = 3) -> None:
    coord.CHALLENGE_INTERVAL_S = 0        # challenge on every beat, for the demo
    coord.HEARTBEAT_TIMEOUT_S = 10_000    # never time out during the sim
    coord.NODES.clear()

    accounts = [Account.from_key("0x" + f"{i+1:02x}" * 32) for i in range(num_nodes)]

    # register
    for i, acct in enumerate(accounts):
        msg = signing.register_message(acct.address, f"node-{i}")
        resp = coord.register(coord.RegisterReq(
            address=acct.address, node_id=f"node-{i}",
            signature=_sign(acct, msg)))
        assert resp["ok"]
    print(f"registered {num_nodes} nodes")

    # heartbeats + challenge solving
    honest = accounts[:-1]
    liar = accounts[-1]  # this one returns a wrong challenge answer
    for _ in range(beats):
        for acct in accounts:
            ts = int(time.time())
            msg = signing.heartbeat_message(acct.address, ts)
            out = coord.heartbeat(coord.HeartbeatReq(
                address=acct.address, timestamp=ts, signature=_sign(acct, msg)))
            ch = out.get("challenge")
            if ch:
                node_obj = coord.NODES[acct.address]
                real = solve(make_challenge(ch["id"], seed=node_obj.pending_seed, size=ch["size"]))
                answer = real if acct is not liar else "0x" + "de" * 32
                res = coord.challenge_result(coord.ChallengeResultReq(
                    address=acct.address, challenge_id=ch["id"], output_hash=answer))
                tag = "PASS" if res["ok"] else "FAIL"
                print(f"  {acct.address[:10]}… challenge {tag}")
        time.sleep(0.01)

    # close epoch
    result = coord.close_epoch()
    print(f"\nepoch root: {result['root']}")
    print(f"accounts in tree (liar should be excluded — earnings voided): {result['accounts']}")

    # verify a proof locally against the tree
    entries = [(a.address, coord.NODES[a.address].cumulative_reward) for a in honest]
    entries = [(addr, int(v * 1e18)) for addr, v in entries if v > 0]
    if entries:
        tree = MerkleTree(entries)
        who = entries[0][0]
        print(f"sample claim for {who[:10]}…: {tree.claims()[who]}")


def _sign(acct, message: str) -> str:
    from eth_account.messages import encode_defunct
    return acct.sign_message(encode_defunct(text=message)).signature.hex()


if __name__ == "__main__":
    run()
