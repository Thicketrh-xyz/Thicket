"""
End-to-end simulator — exercises the verification layer in-process, with no
server, no chain and no model.

Spins up virtual nodes against a throwaway SQLite database and walks the cases
that decide whether redundant execution actually works: a liar outvoted, honest
nodes disagreeing, a node that simply didn't answer, a network too small to form
a quorum at all, and a paid job whose buyer gets the consensus answer.

Run:  .venv/bin/python -m sim        (from coordinator/)
"""
from __future__ import annotations

import os
import tempfile

# A scratch database, chosen before app.db reads DATABASE_URL at import time.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "sim.db")
os.environ.setdefault("EPOCH_SECONDS", "0")        # no background scheduler in the sim

import time  # noqa: E402

from eth_account import Account  # noqa: E402

from app import main as coord  # noqa: E402
from app import quorum as qm  # noqa: E402
from app import signing  # noqa: E402
from app.challenge import make_challenge, solve  # noqa: E402
from app.db import Delegation, Job, Node, Quorum, QuorumResult, SessionLocal, init_db  # noqa: E402
from app.epoch import OPERATOR_COMMISSION, close_epoch, split_earnings  # noqa: E402

WRONG = "0x" + "de" * 32

_pass = _fail = 0


def check(label: str, got, want) -> None:
    global _pass, _fail
    ok = got == want
    _pass, _fail = _pass + ok, _fail + (not ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}"
          + ("" if ok else f"\n          expected {want!r}\n          got      {got!r}"))


class VirtualNode:
    def __init__(self, db, i: int, caps=("text",)):
        self.acct = Account.from_key("0x" + f"{i + 1:02x}" * 32)
        self.address = self.acct.address
        self.db = db
        resp = coord.register(coord.RegisterReq(
            address=self.address, node_id=f"node-{i}",
            signature=_sign(self.acct, signing.register_message(self.address, f"node-{i}")),
            capabilities=list(caps)), db)
        assert resp["ok"]

    def beat(self) -> dict:
        ts = int(time.time())
        return coord.heartbeat(coord.HeartbeatReq(
            address=self.address, timestamp=ts,
            signature=_sign(self.acct, signing.heartbeat_message(self.address, ts))), self.db)

    def answer_challenge(self, challenge: dict, honest: bool = True, forced: str = "") -> dict:
        out = forced or (solve(make_challenge(challenge["id"], seed=challenge["seed"],
                                              size=challenge["size"])) if honest else WRONG)
        return coord.challenge_result(coord.ChallengeResultReq(
            address=self.address, challenge_id=challenge["id"], output_hash=out), self.db)

    def answer_job(self, jid: str, text: str, ok: bool = True) -> dict:
        return coord.job_result(jid, coord.JobResultReq(
            address=self.address, result=text, ok=ok), self.db)

    @property
    def row(self) -> Node:
        self.db.expire_all()
        return self.db.get(Node, self.address)


def _sign(acct, message: str) -> str:
    from eth_account.messages import encode_defunct
    return acct.sign_message(encode_defunct(text=message)).signature.hex()


def _reset(db) -> None:
    for table in (QuorumResult, Quorum, Job, Node):
        db.query(table).delete()
    db.commit()


def _challenge_all(nodes) -> dict:
    """Beat until every node holds the same task; returns {address: challenge}.

    Two rounds are needed by design: a node that has never heartbeated isn't a
    candidate for selection, so the first node to ask can only be given a solo
    challenge. Once the network has seen everyone, the next beat forms a quorum
    and each node picks up its slot. The latest challenge per node wins.
    """
    served = {}
    for _ in range(2):
        for n in nodes:
            out = n.beat()
            if out.get("challenge"):
                served[n.address] = out["challenge"]
    return served


# --- scenarios --------------------------------------------------------------

def scenario_majority(db) -> None:
    print("\n[1] two honest nodes outvote a liar")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    served = _challenge_all(nodes)

    check("all three got the same task", len({c["id"] for c in served.values()}), 1)
    check("all three were selected", len(served), 3)

    nodes[0].answer_challenge(served[nodes[0].address])
    nodes[1].answer_challenge(served[nodes[1].address])
    nodes[2].answer_challenge(served[nodes[2].address], honest=False)

    q = db.query(Quorum).first()
    db.expire_all()
    check("quorum settled", q.status, "settled")
    check("consensus is the honest answer", q.consensus,
          solve(make_challenge(q.id, seed=q.seed, size=q.size)))

    verdicts = {r.node_address: r.verdict
                for r in db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id)}
    check("honest node agreed", verdicts[nodes[0].address], "agreed")
    check("liar disagreed", verdicts[nodes[2].address], "disagreed")
    check("liar struck once", nodes[2].row.failed_challenges, 1)
    check("liar's earnings voided", nodes[2].row.contribution_minutes, 0.0)
    check("honest node unstruck", nodes[0].row.failed_challenges, 0)


def scenario_inconclusive(db) -> None:
    print("\n[2] all three differ — nobody is punished")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    served = _challenge_all(nodes)
    for i, n in enumerate(nodes):
        n.answer_challenge(served[n.address], forced="0x" + f"{i:02x}" * 32)

    q = db.query(Quorum).first()
    db.expire_all()
    check("marked inconclusive", q.status, "inconclusive")
    check("no consensus recorded", q.consensus, None)
    check("nobody struck", [n.row.failed_challenges for n in nodes], [0, 0, 0])
    check("no earnings voided", [r.verdict for r in
                                 db.query(QuorumResult).filter(QuorumResult.quorum_id == q.id)],
          ["pending"] * 3)


def scenario_straggler(db) -> None:
    print("\n[3] a node that never answers is absent, not wrong")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    served = _challenge_all(nodes)
    nodes[0].answer_challenge(served[nodes[0].address])
    nodes[1].answer_challenge(served[nodes[1].address])
    # nodes[2] stays silent; push the quorum past its deadline.

    q = db.query(Quorum).first()
    check("still open before the deadline", q.status, "open")
    q.deadline = time.time() - 1
    db.commit()
    coord.settle_quorum(db, q)
    db.commit()
    db.expire_all()

    check("settled on two votes", q.status, "settled")
    check("straggler not struck", nodes[2].row.failed_challenges, 0)
    check("straggler keeps its minutes", nodes[2].row.contribution_minutes > 0, True)
    check("straggler has no verdict",
          db.get(QuorumResult, f"{q.id}:{nodes[2].address.lower()}").verdict, "pending")


def scenario_too_few_nodes(db) -> None:
    print("\n[4] fewer than k nodes — fall back to recompute, don't stop verifying")
    _reset(db)
    solo = VirtualNode(db, 0)
    challenge = solo.beat()["challenge"]

    check("no quorum opened", db.query(Quorum).count(), 0)
    check("a challenge was still issued", bool(challenge), True)

    out = solo.answer_challenge(challenge, honest=False)
    db.expire_all()
    check("coordinator caught the liar by recomputing", out["ok"], False)
    check("struck", solo.row.failed_challenges, 1)

    ok = solo.answer_challenge(challenge)
    check("honest answer passes", ok["ok"], True)


def scenario_slash(db) -> None:
    print("\n[5] three strikes slashes the bond")
    _reset(db)
    solo = VirtualNode(db, 0)
    slashed = []
    real_slash = coord.chain.slash
    coord.chain.slash = lambda addr, amt, reason: slashed.append((addr, reason))
    try:
        for _ in range(3):
            ch = solo.beat()["challenge"]
            solo.answer_challenge(ch, honest=False)
            solo.row.last_challenge_at = 0     # make the node due again
            db.commit()
    finally:
        coord.chain.slash = real_slash
    db.expire_all()
    check("slashed once", len(slashed), 1)
    check("strike counter reset after slashing", solo.row.failed_challenges, 0)


def scenario_job_quorum(db) -> None:
    print("\n[6] a paid job: buyer gets the answer two nodes agreed on")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    for n in nodes:
        n.beat()

    real_roll = qm.should_spot_check
    qm.should_spot_check = lambda: True          # force this job into the sample
    try:
        job = coord.submit_job(coord.JobReq(
            prompt="Summarise this.", payer=nodes[0].address, kind="text"), db)
    finally:
        qm.should_spot_check = real_roll

    check("job was spot-checked", job["verified"], True)
    check("held out of the single-node queue", job["status"], "verifying")

    jid = job["id"]
    dispatched = [n for n in nodes if any(j["id"] == jid for j in n.beat().get("jobs", []))]
    check("dispatched to k nodes", len(dispatched), qm.QUORUM_K)
    seeds = {db.get(Job, jid).seed}
    check("all nodes share one sampling seed", len(seeds), 1)

    # Two nodes produce near-identical text (whitespace and casing differ, as two
    # honest runs of the same model would); the third returns something else.
    dispatched[0].answer_job(jid, "The document argues that decentralised compute is viable.")
    dispatched[1].answer_job(jid, "The document argues that decentralized compute is viable.")
    dispatched[2].answer_job(jid, "Buy cheap watches at example dot com.")
    db.expire_all()

    row = db.get(Job, jid)
    check("job finished", row.status, "done")
    check("buyer got the agreed answer",
          row.result.startswith("The document argues"), True)

    v = coord.verification_of(db, row)
    check("reported as verified", v["verified"], True)
    check("two agreed", v["agreed"], 2)
    check("one disagreed", v["disagreed"], 1)
    check("the odd one out was struck",
          db.get(Node, dispatched[2].address).failed_challenges, 1)


def scenario_broken_node(db) -> None:
    print("\n[7] a node whose inference crashed is not treated as a liar")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    for n in nodes:
        n.beat()

    real_roll = qm.should_spot_check
    qm.should_spot_check = lambda: True
    try:
        jid = coord.submit_job(coord.JobReq(
            prompt="Summarise this.", payer=nodes[0].address, kind="text"), db)["id"]
    finally:
        qm.should_spot_check = real_roll

    dispatched = [n for n in nodes if any(j["id"] == jid for j in n.beat().get("jobs", []))]
    dispatched[0].answer_job(jid, "A clear summary of the text.")
    dispatched[1].answer_job(jid, "A clear summary of the text.")
    out = dispatched[2].answer_job(jid, "inference failed: connection refused", ok=False)
    db.expire_all()

    check("the failure was not counted as a vote", out["counted"], False)
    check("crashed node not struck",
          db.get(Node, dispatched[2].address).failed_challenges, 0)
    check("the other two settled it without waiting for the deadline",
          db.get(Job, jid).status, "done")


def scenario_epoch_holdback(db) -> None:
    print("\n[8] rewards aren't banked while a verdict is outstanding")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    _challenge_all(nodes)
    for n in nodes:
        db.get(Node, n.address).contribution_minutes = 5.0
    db.commit()          # commit before touching .row, which expires the session

    result = close_epoch()
    db.expire_all()
    check("all three held back", result["held"], 3)
    check("nothing settled yet", [n.row.cumulative_reward for n in nodes], [0.0, 0.0, 0.0])
    check("minutes still accrued", nodes[0].row.contribution_minutes, 5.0)

    q = db.query(Quorum).first()
    served = make_challenge(q.id, seed=q.seed, size=q.size).to_dict()
    for n in nodes:
        n.answer_challenge(served)
    db.expire_all()

    result = close_epoch()
    db.expire_all()
    check("nothing held back once settled", result["held"], 0)
    check("honest nodes paid", nodes[0].row.cumulative_reward, 5.0)


def scenario_no_double_dispatch(db) -> None:
    print("\n[9] a node still working isn't handed the same task again")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    for n in nodes:
        n.beat()

    real_roll = qm.should_spot_check
    qm.should_spot_check = lambda: True
    try:
        jid = coord.submit_job(coord.JobReq(
            prompt="Summarise this.", payer=nodes[0].address, kind="text"), db)["id"]
    finally:
        qm.should_spot_check = real_roll

    first = {n.address: [j["id"] for j in n.beat().get("jobs", [])] for n in nodes}
    again = {n.address: [j["id"] for j in n.beat().get("jobs", [])] for n in nodes}
    check("dispatched once", sum(jid in v for v in first.values()), qm.QUORUM_K)
    check("not dispatched again on the next beat",
          sum(jid in v for v in again.values()), 0)

    # After the assign timeout it's re-offered, so a node that vanished mid-job
    # doesn't strand the quorum.
    for r in db.query(QuorumResult).all():
        r.dispatched_at = time.time() - coord.JOB_ASSIGN_TIMEOUT_S - 1
    db.commit()
    later = {n.address: [j["id"] for j in n.beat().get("jobs", [])] for n in nodes}
    check("re-offered after the assign timeout",
          sum(jid in v for v in later.values()), qm.QUORUM_K)


def scenario_fresh_node_joins(db) -> None:
    print("\n[10] a node joining a busy network is in the quorum it triggers")
    _reset(db)
    established = [VirtualNode(db, i) for i in range(3)]
    for _ in range(2):
        for n in established:
            n.beat()

    newcomer = VirtualNode(db, 9)
    out = newcomer.beat()
    check("newcomer got a task", bool(out.get("challenge")), True)

    q = db.get(Quorum, out["challenge"]["id"])
    if q:      # a quorum, not the solo fallback
        check("newcomer holds a slot in it",
              db.get(QuorumResult, f"{q.id}:{newcomer.address.lower()}") is not None, True)
        check("the slot was marked dispatched",
              db.get(QuorumResult, f"{q.id}:{newcomer.address.lower()}").dispatched_at > 0, True)
    check("it can answer its own task", newcomer.answer_challenge(out["challenge"])["ok"], True)


def scenario_work_rewards(db) -> None:
    print("\n[11] a node that does work earns more than one that just idles")
    _reset(db)
    worker, idler = VirtualNode(db, 0), VirtualNode(db, 1)
    worker.beat(); idler.beat()

    jid = coord.submit_job(coord.JobReq(
        prompt="Summarise this document.", payer=idler.address, kind="text"), db)["id"]
    price = db.get(Job, jid).price_thkt
    check("job stored its own price", price > 0, True)

    worker.beat()                       # picks the job up
    worker.answer_job(jid, "A summary.")
    idler.beat()                        # uptime accrues between beats, so it needs a second
    db.expire_all()

    expected = round(price * coord.OPERATOR_REVENUE_SHARE, 6)
    check("worker paid a share of the job price", round(worker.row.work_thkt, 6), expected)
    check("worker's job counted", worker.row.jobs_done, 1)
    check("idler earned nothing from work", idler.row.work_thkt, 0.0)
    check("both still earn uptime", worker.row.contribution_minutes > 0
          and idler.row.contribution_minutes > 0, True)


def scenario_quorum_reward_split(db) -> None:
    print("\n[12] one payment is split between the nodes that agreed")
    _reset(db)
    nodes = [VirtualNode(db, i) for i in range(3)]
    for n in nodes:
        n.beat()

    real_roll = qm.should_spot_check
    qm.should_spot_check = lambda: True
    try:
        jid = coord.submit_job(coord.JobReq(
            prompt="Summarise this document.", payer=nodes[0].address, kind="text"), db)["id"]
    finally:
        qm.should_spot_check = real_roll

    price = db.get(Job, jid).price_thkt
    dispatched = [n for n in nodes if any(j["id"] == jid for j in n.beat().get("jobs", []))]
    dispatched[0].answer_job(jid, "The document explains the reward split.")
    dispatched[1].answer_job(jid, "The document explains the reward split.")
    dispatched[2].answer_job(jid, "Unrelated spam text.")
    db.expire_all()

    share = price * coord.OPERATOR_REVENUE_SHARE
    paid = [round(db.get(Node, n.address).work_thkt, 6) for n in dispatched]
    check("the two who agreed split one share", sorted(paid)[1:],
          [round(share / 2, 6), round(share / 2, 6)])
    check("the one who disagreed earned nothing", sorted(paid)[0], 0.0)
    check("total paid never exceeds one share", round(sum(paid), 6), round(share, 6))


def scenario_strike_voids_work(db) -> None:
    print("\n[13] a strike voids work earnings, not just minutes")
    _reset(db)
    solo = VirtualNode(db, 0)
    ch = solo.beat()["challenge"]
    jid = coord.submit_job(coord.JobReq(
        prompt="Summarise this document.", payer=solo.address, kind="text"), db)["id"]
    solo.beat()
    solo.answer_job(jid, "A summary.")
    db.expire_all()
    check("earned something first", solo.row.work_thkt > 0, True)

    solo.answer_challenge(ch, honest=False)      # caught lying
    db.expire_all()
    check("work earnings voided", solo.row.work_thkt, 0.0)
    check("minutes voided too", solo.row.contribution_minutes, 0.0)


def scenario_lifetime_minutes(db) -> None:
    print("\n[14] lifetime minutes survive settlement and voiding")
    _reset(db)
    n = VirtualNode(db, 0)
    n.beat(); n.beat()
    db.expire_all()
    before = n.row.lifetime_minutes
    check("accruing", before > 0, True)

    close_epoch()
    db.expire_all()
    check("survives an epoch close", n.row.lifetime_minutes, before)
    check("epoch minutes reset", n.row.contribution_minutes, 0.0)

    coord.void_and_strike(db, n.address, "test"); db.commit(); db.expire_all()
    check("survives a strike", n.row.lifetime_minutes, before)


class FakeDelegation:
    """Stands in for a Delegation row where only the split maths is under test."""
    def __init__(self, delegator, amount):
        self.delegator, self.amount = delegator, amount


def scenario_delegation_split(db) -> None:
    print("\n[15] earnings split with delegators, stake-weighted")
    # 1000 self, 1000 delegated -> half the earnings follow delegated stake,
    # and the operator takes commission on that half.
    op_share, shares = split_earnings(100.0, 1000.0, [FakeDelegation("0xD", 1000.0)])
    expected_delegator = 100.0 * 0.5 * (1 - OPERATOR_COMMISSION)
    check("delegator gets its stake share minus commission",
          round(shares["0xD"], 6), round(expected_delegator, 6))
    check("operator keeps the rest", round(op_share, 6),
          round(100.0 - expected_delegator, 6))
    check("nothing is created or lost",
          round(op_share + sum(shares.values()), 6), 100.0)

    # Two delegators split their portion in proportion to each other.
    op_share, shares = split_earnings(100.0, 0.0,
                                      [FakeDelegation("0xA", 750.0), FakeDelegation("0xB", 250.0)])
    check("split pro-rata between delegators",
          [round(shares["0xA"], 6), round(shares["0xB"], 6)],
          [round(100.0 * 0.75 * (1 - OPERATOR_COMMISSION), 6),
           round(100.0 * 0.25 * (1 - OPERATOR_COMMISSION), 6)])
    check("operator still earns its commission", round(op_share, 6),
          round(100.0 * OPERATOR_COMMISSION, 6))

    # No delegators must behave exactly as before the feature existed.
    op_share, shares = split_earnings(100.0, 1000.0, [])
    check("undelegated operator keeps everything", op_share, 100.0)
    check("no delegator entries", shares, {})

    # A delegation that has been fully unbonded is not a delegation.
    op_share, shares = split_earnings(100.0, 1000.0, [FakeDelegation("0xD", 0.0)])
    check("zero-balance delegation ignored", op_share, 100.0)


def scenario_delegator_settles(db) -> None:
    print("\n[16] a delegator accrues and lands in the claim tree")
    _reset(db)
    db.query(Delegation).delete(); db.commit()
    node = VirtualNode(db, 0)
    node.beat(); node.beat()

    delegator = "0x00000000000000000000000000000000000000D1"
    db.add(Delegation(id=f"{delegator.lower()}:{node.address.lower()}",
                      delegator=delegator, operator=node.address, amount=1000.0))
    db.get(Node, node.address).contribution_minutes = 10.0
    db.commit()

    close_epoch()
    db.expire_all()
    row = db.query(Delegation).first()
    check("delegator earned something", row.cumulative_reward > 0, True)
    check("operator earned something", db.get(Node, node.address).cumulative_reward > 0, True)

    # DRY mode reports self_stake 0, so all the backing stake is delegated and
    # the operator keeps only its commission.
    total = row.cumulative_reward + db.get(Node, node.address).cumulative_reward
    check("nothing minted along the way", round(total, 6), 10.0)
    check("delegator got the non-commission part", round(row.cumulative_reward, 6),
          round(10.0 * (1 - OPERATOR_COMMISSION), 6))

    claims = coord.current_claims()
    check("delegator has a claim proof",
          any(k.lower() == delegator.lower() for k in claims), True)
    db.query(Delegation).delete(); db.commit()


def run() -> None:
    init_db()
    db = SessionLocal()
    coord.CHALLENGE_INTERVAL_S = 0        # challenge on every beat
    coord.HEARTBEAT_TIMEOUT_S = 10_000    # never time out mid-simulation
    try:
        for scenario in (scenario_majority, scenario_inconclusive, scenario_straggler,
                         scenario_too_few_nodes, scenario_slash, scenario_job_quorum,
                         scenario_broken_node, scenario_epoch_holdback,
                         scenario_no_double_dispatch, scenario_fresh_node_joins,
                         scenario_work_rewards, scenario_quorum_reward_split,
                         scenario_strike_voids_work, scenario_lifetime_minutes,
                         scenario_delegation_split, scenario_delegator_settles):
            scenario(db)
    finally:
        db.close()

    print(f"\n{_pass} passed, {_fail} failed")
    raise SystemExit(1 if _fail else 0)


if __name__ == "__main__":
    run()
