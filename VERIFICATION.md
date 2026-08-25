# Redundant execution — design sketch

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

## Making it survive the model swap

Keep the comparison **pluggable**. Today:

```python
def agree(a, b):            # exact hash equality
    return a == b
```

Later, for non-deterministic model output:

```python
def agree(a, b):            # perceptual / numeric tolerance
    return distance(a, b) < THRESHOLD
```

Everything else — quorum, tallying, strikes, slashing — stays identical. That is the whole
reason to build this **now, while the task is still cheap and deterministic**: the consensus
machinery gets proven while mistakes are free, and the model swap becomes a one-function change
behind a verification layer that already works.

## Suggested order

1. `Quorum` + `QuorumResult` tables and the tally logic
2. Dispatch the same task to `k` nodes via heartbeat; fall back to recompute when `online < k`
3. Settlement: agreed / disagreed / inconclusive, wired to the existing strike + slash path
4. Spot-check sampling (`p%`) to control cost
5. *Then* swap `run_job()` for a real model, and relax `agree()` to a tolerance

## Open questions (product decisions, not code)

- **`k` and `p`** — how much verification overhead is acceptable? (3 / 10% is a reasonable start)
- **Do jobs get verified too, or only challenges?** Verifying paid jobs means a buyer's work is
  done `k` times — someone has to pay for that.
- **Reward split** — when `k` nodes do the same task, do all agreeing nodes get paid, or only one?
  Paying all is fair but multiplies cost; paying one makes redundancy unpaid labour.
