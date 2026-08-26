# Redundant execution

**Status: built.** Implemented in `coordinator/app/quorum.py`, wired through
`/heartbeat`, `/challenge/result` and `/jobs/{id}/result`, and covered by nine
scenarios in `coordinator/sim.py` (`.venv/bin/python -m sim`). The design below
is what was built; decisions taken along the way are recorded at the bottom.

How Thicket moves from *"the coordinator re-runs the task"* to *"several nodes agree on the
answer"*. This is the verification layer that has to exist **before** a real GPU model can be
swapped in.

## Why change anything

Verification today (`coordinator/app/challenge.py`):

```python
verify = (submitted_hash == solve(challenge))   # the coordinator recomputes
```

That works only because the task is deterministic integer math. It breaks on real models:

| | Deterministic matmul (today) | Real model inference |
|---|---|---|
| Same input → same bits? | Yes, on every machine | **No** — GPU float ordering, drivers, hardware |
| Cost for coordinator to recheck | Trivial | **Same as doing the work** → network is pointless |

So the checker has to stop being "one trusted machine that recomputes" and become
"several independent machines that agree."

## The model

Send the **same task to `k` nodes**. Compare their answers. Majority wins.

```
                      ┌─── node A ──▶ hash_1 ─┐
  task (one spec) ────┼─── node B ──▶ hash_1 ─┼──▶ tally ──▶ consensus = hash_1
                      └─── node C ──▶ hash_9 ─┘              A,B agree · C disagrees
```

The coordinator never computes the answer — it only counts votes. That is the whole point:
it scales to work the coordinator could never do itself.

**`k = 3`** is the default: tolerates one liar, and a 2-of-3 majority is unambiguous.
(`k = 2` can't break ties; `k = 5` is stronger but 5× the cost.)

## Data model

Two tables alongside the existing `nodes` / `jobs`:

```
Quorum                                  QuorumResult
  id                                      quorum_id
  kind        challenge | job             node_address
  spec        seed+size, or job payload   output_hash
  required    k (default 3)               submitted_at
  deadline    timestamp                   verdict  pending | agreed | disagreed
  status      open | settled | inconclusive
  consensus   the winning hash (nullable)
```

## Flow

1. **Create** — coordinator opens a `Quorum`, picks `k` **random, bonded, online** nodes.
2. **Dispatch** — each selected node receives the task on its next heartbeat. It is *not*
   told that others have the same task, or who they are.
3. **Collect** — nodes submit results independently.
4. **Settle** — when `k` results arrive *or* the deadline passes:
   - tally identical hashes → the most common is `consensus`
   - **agreed** nodes: keep their earnings
   - **disagreed** nodes: earnings for that window voided, strike counter +1
   - 3 strikes → on-chain `slash` (unchanged from today)

## Edge cases that decide whether this actually works

**Not enough nodes online.** Early on the network may have fewer than `k` nodes. Fall back to
the current recompute check rather than halting verification. This keeps a 1-node network
working and is why the existing `solve()` should stay in the codebase, not be deleted.

**No majority (all `k` differ).** Mark `inconclusive` and **punish nobody**. Optionally re-run
with fresh nodes. This matters enormously once models are non-deterministic — an honest node
must never be slashed because two others produced legitimately different output.

**Stragglers.** A node that misses the deadline is *absent*, not *wrong*. Absence shouldn't
slash; only a confidently-wrong answer should.

**Collusion.** The security assumption is that an attacker doesn't control a majority of any
randomly-selected group. Random selection from the online pool + the THKT bond is what makes
that expensive — this is exactly why `NodeStaking` exists. It is **not** absolute: an attacker
who owns most of the network can outvote honest nodes. That's the known ceiling of this
approach and the reason ZK is the eventual answer.

**Cost.** Verifying every task at `k = 3` triples network compute. Mitigate with
**spot-checking**: run only a random `p%` of tasks redundantly (e.g. 10%), leaving the rest
unverified but *probabilistically* policed. Cheating becomes a gamble against a slashable bond.

## Keeping the comparison pluggable

Only *how two answers are compared* depends on the task. Quorum, tallying, strikes and
slashing are identical either way, so `agree()` is selected per kind and everything else
is shared. Tallying clusters mutually-agreeing votes rather than counting identical
hashes — with a tolerance function "identical" isn't an equivalence relation, and a dict
keyed on the answer would quietly stop working.

## What was built

1. `Quorum` + `QuorumResult` tables and the tally logic — **done**
2. Dispatch the same task to `k` nodes via heartbeat; recompute fallback when `online < k` — **done**
3. Settlement: agreed / disagreed / inconclusive, on the existing strike + slash path — **done**
4. Spot-check sampling (`p%`) — **done**, applied to single jobs and to every item in a batch
5. Real models behind a tolerance `agree()` — **done** (see below)

Knobs, all env-configurable: `QUORUM_K` (3), `QUORUM_SPOT_CHECK` (0.10),
`QUORUM_DEADLINE_S` (300), `QUORUM_JOB_THRESHOLD` (0.72).

## Decisions taken

- **`k = 3`, `p = 10%`** — one liar tolerated, ~1.2x overhead.
- **Both challenges and paid jobs are verified.** A sampled share of paid work runs
  on `k` nodes, and the buyer receives the answer the majority agreed on rather than
  whatever the single fastest node happened to say.
- **Buyers pay the normal 1x price for a spot-checked job.** Operator rewards are
  uptime-based, so redundancy costs the network compute but costs the pool nothing
  extra. This has to be revisited the moment rewards become per-task.
- **All agreeing nodes keep their earnings.** With flat per-minute rewards there is no
  per-task payout to split; in practice "paid" means agreeing nodes keep their
  contribution minutes and disagreeing ones have that window voided.
- **Settlement is early, not deadline-bound.** A quorum settles as soon as no further
  vote can arrive — including when a selected node's inference crashed — so a buyer
  never waits out the deadline for a vote that is never coming.
- **Epoch settlement holds back nodes awaiting a verdict.** Voiding a liar's earnings
  only works while they're unsettled, and a quorum can outlive several epochs. Anyone
  with an open slot rolls over to the next epoch; honest nodes are paid one epoch later.

## Making it survive nondeterminism

`agree()` is per-kind. Challenges compare hashes exactly. Job output compares by
similarity (`difflib` ratio over case- and whitespace-normalised text), because two
honest nodes do not emit identical bytes.

The node also pins its sampling — `temperature: 0`, `top_p: 1`, plus a per-job seed
the coordinator sends to every node running that job. Measured on one machine, this
makes `llama3.2:1b` output byte-identical across runs, so the similarity threshold is
headroom for cross-hardware drift (quantisation, GPU vs CPU) rather than the primary
mechanism. A node is never told which of its jobs are being checked, so every job runs
the reproducible way.

## Still open

- **A dropped-out node isn't replaced.** If a selected node's inference crashes, the
  quorum settles on the remaining votes instead of drafting a substitute. Fine at
  `k = 3` with `MIN_VOTES = 2`; worth revisiting if `k` grows.
- **The similarity threshold is unvalidated across heterogeneous hardware.** It was
  measured on one machine. Two nodes with different quantisations may sit below 0.72
  while both being honest — which shows up as `inconclusive`, so it fails safe, but it
  makes verification useless rather than wrong.
- **Collusion ceiling is unchanged.** An attacker controlling most of the network can
  outvote honest nodes. Random selection plus the bond is what makes that expensive.
