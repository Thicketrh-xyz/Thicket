# Thicket — session handoff

Read this first. State of the project as of commit `636e343` (2026-08-31).

## What Thicket is

A decentralized GPU network on Robinhood Chain. Operators run a node client, pass
verification challenges, and earn **THKT** — a rate per minute online, plus 70% of what
buyers paid for jobs their node completed. Delegators take a stake-weighted share of an
operator's earnings.

**Live on mainnet.** Contracts, coordinator, site, portal, node client and SDK are all on
chain 4663.

## Live

| | |
|---|---|
| Site | https://thicketrh.xyz — landing, `/app` portal, `/docs` |
| Coordinator | https://thicket-production.up.railway.app (Railway + Postgres) |
| Repo | https://github.com/Thicketrh-xyz/Thicket (public, MIT) |
| Chain | Robinhood Chain **mainnet**, chain ID `4663` |
| RPC | `https://rpc.mainnet.chain.robinhood.com/rpc` |
| Explorer | https://robinhoodchain.blockscout.com |

**Contracts** — the token was launched separately and reused; the deploy minted nothing.

| Contract | Address |
|---|---|
| THKT token | `0xC4F36C7c1D00dcaab1d01159466afa189BFc7161` (1B fixed) |
| NodeStaking | `0xB179254Ca9A5eB59270c6a0088DD46a8a07b9bb9` |
| RewardsDistributor | `0x1c890110e9cc3dAdeBD6c449437606783B4B682b` |

Owner / treasury: `0xbc0840E56e35A1b333D7Df0D45c70E14343547BD`.
Publisher + slasher (coordinator): `0x15213d78F46cA9C3175fEC8886AD490c145F9339` — this is
the key in Railway's `COORDINATOR_PRIVATE_KEY`, and it is deliberately **not** the owner.

There is an orphaned first deployment at token `0xB935013804172402144cDf34b8F459c7823e7837`
from a deploy before the token-reuse fix. It is not used by anything. Its 970M float still
sits with the old deployer — worth burning so nothing can trade as if it were THKT.

## Read this before changing anything

**1. The coordinator was down, repeatedly, for most of 2026-08-31. It is fixed —
but understand why, because six of the eight fixes were the wrong thing.**

Symptom: total saturation for minutes at a time, recovering on its own, then
repeating. Node clients printed `heartbeat error: Read timed out`; the public
node page loaded 2 times in 20.

Two things actually caused it, and both were found by *measuring* rather than
reasoning:

- **`--workers 1`.** One Python process served ~44 requests/second. No index or
  cache could ever fix that — they raise how fast work completes, and the
  process was the ceiling. It was single-worker only because the epoch
  scheduler ran in-process.
- **Signature verification at 6.63ms.** `eth-keys` was using its pure-Python
  ECDSA backend. Every heartbeat carries a signature, so one core saturated at
  151 verifications/sec against a network generating 44/sec — 29% of a core
  before touching the database. Installing `coincurve` (libsecp256k1) made it
  **0.105ms**, a 63x improvement, with no code change.

Result: concurrent heartbeats went **437 -> 0-2**, slowest request **75s ->
nothing over 2s**, node page **2/20 -> 7/7**.

*What did not fix it, in order of how confidently it was proposed:* raising the
DB pool (made it **worse** — more connections against a busy database is more
contention, 51/60 fell to 6/60); a server-side heartbeat throttle (also worse,
43/60 — it moved quorum settlement off heartbeats and into a periodic flood);
raising `EPOCH_SECONDS`; three rounds of indexes. The indexes and caches were
all real defects worth keeping, but none of them were the problem.

**The lesson worth carrying:** `/health` now reports `in_flight` and
`slowest_requests`. During an outage, read those first. Request *count* misled
badly — heartbeats were 14% of requests but ~85% of held connections, because
`/stats` was fast and heartbeats were slow. Concurrency is what exhausts a pool,
not throughput.

**2. The economics are being farmed. The rate cut has not stopped it.**

`REWARD_PER_MINUTE` was cut **1.0 -> 0.35** on 2026-08-31. The network kept growing
anyway: **1,395 -> 1,502 nodes after the cut**, with `jobs_completed` at **5**.

At 0.35 a node earns 504 THKT/day against a 1,000 THKT bond — payback in **2 days**, a
**50.4% daily return** on locked capital for heartbeating and solving integer matmul.
That is still obviously worth doing, which is why they keep arriving. This is not a bug
being exploited; it is the configured incentive working as specified.

```
1,480 active nodes  ->  ~746,000 THKT/day  ->  ~112 days of pool runway
```

`REGISTRATION_OPEN=0` is currently set, which turns away **new** operators while letting
every already-known address through (the node client re-registers on every start, so
refusing known addresses would lock out existing operators). That is a holding measure,
not a decision.

The open question is whether 0.35 is low enough. The evidence so far says no. Levers:

- **`REWARD_PER_MINUTE`** (Railway env). At `0.05`, bond payback becomes ~14 days and
  farming stops being free money. Honest operators still earn via the 70% work share.
  **Careful with ordering:** unsettled `contribution_minutes` are priced at whatever the
  rate is *when they settle*, so a cut silently reprices any backlog. Settle first, then
  cut.
- **`minOperatorStake`** — `setMinOperatorStake()` on NodeStaking, owner-only. Raising it
  makes fleets expensive rather than merely unprofitable, and does not touch what honest
  operators earn.

Infrastructure and economics are the same problem: every new node is load, and the reward
rate is what recruits them.

## Open problems, in rough priority order

1. **Delegation is a griefing vector.** `delegate()` requires only that the operator is
   registered — no consent, no cap, and there is no reject or remove function anywhere in
   NodeStaking. Anyone can delegate to any operator and take a share of their earnings
   against their will. Worse, the split in `epoch.py` applies to `uptime + work`, not just
   work, so it dilutes income the operator earned purely by being online. **Cheapest fix:**
   split only `node.work_thkt` — a one-line change, no contract needed.
2. **Delegation is invisible to operators.** `/node/{address}` never mentions it, so an
   operator who receives a delegation sees earnings drop with no explanation. The data
   exists (`Delegation` rows are keyed by operator; `chain.operator_stake()` returns
   delegated stake) — it just is not surfaced.
3. **The coordinator runs out of gas.** When the wallet empties, `publish_root` throws,
   the on-chain root freezes while the database keeps accruing, and every claim reverts
   with `InvalidProof` — the frontend shows "unknown custom error". **This has happened.**
   *Mostly handled:* `/health` reports `last_publish` and `gas` and goes `degraded` on a
   failed publish, a stalled scheduler, or under a day of runway. `EPOCH_SECONDS` is now
   **300**, cutting the burn 5x. What is still missing: nothing tops the wallet up, and
   nothing pages anyone when `/health` turns `degraded` — the alarm works, but only if
   someone is looking. Top up `0x15213d78F46cA9C3175fEC8886AD490c145F9339` in the native
   gas token on chain 4663; gas price has swung 3x in a day, so size with margin.
4. **The bond is checked only at registration.** `is_bonded` appears exactly once, in
   `/register`, so an operator can unbond and keep earning. Re-checking it per heartbeat
   is *not* the fix — that would be an RPC in the hot path. Check it on a scheduler sweep.
5. **Nothing prunes `quorums` or `quorum_results`.** They grow ~38,000 and ~115,000 rows
   a day, forever. Both are now indexed, which makes that survivable rather than solved:
   the scans get slower every day. Settled quorums past some window are needed by nothing
   except the per-node verified counts, which could be maintained incrementally instead.
6. **`solve()` is a 0.354s trapdoor.** At `CHALLENGE_SIZE=128` the matmul is 2.1M
   pure-Python iterations. The coordinator only runs it on the *solo* challenge path,
   which fires when fewer than k=3 nodes look online — so a long outage that ages out
   heartbeats can make every challenge result cost the coordinator a third of a second of
   CPU, deepening the outage that caused it. Has not fired; worth capping the size.
7. **No multisig.** The owner key can call `recover()` and move the whole pool in one
   transaction. The project has decided against transferring ownership for now — this is a
   known, accepted risk, not an oversight.
8. **Contracts are unaudited.**

## Architecture

```
Browser ──▶ Frontend (Vercel)  ──▶ Coordinator (Railway) ──▶ Contracts (mainnet 4663)
Agents  ──▶ SDK (sdk/thicket.py) ──▶      │
Nodes   ──▶ node client ───────────────────┘
```

- `contracts/` — Foundry. Fixed-supply token, staking/slashing, Merkle claims from a pool.
- `coordinator/` — FastAPI + Postgres. Heartbeats, challenges, quorum, job routing, epochs.
- `node/` — the client operators run. Bonds, heartbeats, solves challenges, runs Ollama.
- `frontend/` — landing + portal + docs (15 docs pages under `/docs/<slug>`).
- `sdk/` — agent SDK: buy compute from a wallet in one call.

`ECONOMICS.md` — measured cost of real work. `VERIFICATION.md` — quorum design and limits.

## What's built

- **A public node page** at `/nodes` — every operator, what it verified, what it earned,
  and `claimed()` read from the RewardsDistributor in the reader's own browser so the
  coordinator's numbers can be checked against the chain
- **Work-based rewards** — uptime plus 70% of what buyers paid; delegation splits it
- **Redundant verification** — k=3 quorum on challenges and a sampled share of paid jobs,
  settled by majority, wired to strike/slash; recompute fallback below k nodes
- **Real AI jobs** via Ollama — text and vision, capability-routed
- **Size-based pricing**, quoted before payment, re-priced server-side, oversized input
  refused with 413 rather than silently truncated
- Bulk batches, job history, agent SDK with spend guards
- Keychain key storage on the node (`--save-key`)

## How the coordinator is deployed (changed 2026-08-31)

It runs **4 uvicorn workers**, which is safe only because of three things. Breaking any
of them breaks the network quietly rather than loudly:

- **Scheduled jobs take a Postgres advisory lock per run** (`epoch.py::_cluster_singleton`).
  Exactly one worker settles an epoch. Two would double-credit operators and build two
  transactions with the same nonce.
- **That lock also records the last run.** Mutual exclusion alone is not enough: every
  worker has its own timer offset, so they do not collide, they take turns — and the job
  ran once *per worker* per interval. Four workers quadrupled settlement and its gas
  before this was caught.
- **The pool budget is divided by worker count.** `DB_POOL_SIZE` is the number for the
  whole service, not per process. Read per process it would open 4x the connections and
  Postgres would refuse them.

Also: `--limit-concurrency 100` bounds the request queue. Without it, a slow patch becomes
a congestive collapse — in-flight requests climbed 165 -> 591 in twelve minutes with no
recovery, because clients time out at 15s and retry while the server is still working on
what they abandoned.

**Schema changes at startup are dangerous now.** `CREATE INDEX` and `ALTER TABLE` take
locks that deadlock against the outgoing container during a rolling deploy. Both are run
one statement at a time, outside the main transaction, with a 3s `lock_timeout`, and are
**never fatal** — a deadlocked index once refused to boot the entire service. Keep it
that way.

Chain writes never happen in a request. Slashes queue into `pending_slashes` and the
scheduler drains them; `ChainBridge._send` holds a lock so two writes cannot build the
same nonce.

## Gotchas

- **Git pushes need the `Gentle2003` account.** gh's credential helper only serves the
  *active* account (gh 2.97: a username in the remote URL is ignored). Keep `Gentle2003`
  active; do not switch back to `parleyrobinhood`.
- **Never use the GitHub web editor on this repo.** Web edits are authored by your account
  and re-add you to the contributors list. History was rewritten twice to clear it. Edit
  locally and push.
- **Railway CLI is installed and linked** (`abundant-nurturing` / `Thicket` service). Two
  Postgres services exist: `Postgres` (old testnet data) and `Postgres-DeL4` (**live** —
  `DATABASE_URL` points at it). Do not delete either: deleting the live one is
  unrecoverable and there is no backup, and deleting the idle one frees no meaningful
  CPU, because Railway allocates per service rather than from a shared pool.
- **Do not accept Railway's "Update template" prompt.** It applies the upstream template
  over your service and can overwrite the variables below.
- **Never run more than 1 worker without the advisory locks** — see the deployment
  section above.
- **`coincurve` must stay in requirements.** `eth-keys` silently falls back to a
  pure-Python ECDSA backend without it, and signature verification goes from 0.105ms to
  6.63ms — which is 29% of a core at current load and is what took the site down.
- **Vercel CLI must run from the repo root**, not `frontend/` — the project's Root
  Directory is already `frontend`, so running inside it resolves to `frontend/frontend`.
- **Vercel `VITE_*` vars override code defaults** and are baked in at build time. Changing
  them needs a redeploy.
- Coordinator schema changes need an entry in `_ADDED` / `_WIDENED` in `coordinator/app/db.py`.
- Node env values must not have inline comments (`KEY=  # note` becomes the note).
- `MAINNET.md` and `scripts/deploy-mainnet.sh` are gitignored — local only, deliberately.

## Live configuration (Railway env, `Thicket` service)

| variable | value | why |
|---|---|---|
| `REWARD_PER_MINUTE` | `0.35` | cut from 1.0 on 2026-08-31; has not stopped growth |
| `EPOCH_SECONDS` | `300` | was 60; 5x less gas and less write contention |
| `HEARTBEAT_TIMEOUT_S` | `300` | **must stay above the node's beat interval** — uptime is credited only when the gap is inside this window, so a timeout below it credits everyone zero |
| `REGISTRATION_OPEN` | `0` | new operators refused; known addresses still allowed |
| `HEARTBEAT_MIN_INTERVAL_S` | `0` | server-side beat throttle, **off** — measured worse (43/60 vs 51/60) because it moved quorum settlement into a periodic flood |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `20` / `10` | whole-service budget, divided by worker count. Raising these made things **worse**, not better |
| `NODES_TTL_S` | `120` | raised during the outage; 30 is fine now that latency is healthy |
| `UVICORN_WORKERS` | unset → 4 | see the deployment section |

## Running things

```bash
# verification + reward scenarios (no server, no chain, no model)
cd coordinator && .venv/bin/python -m sim        # 88 checks, 17 scenarios

# node
cd node && .venv/bin/python -m thicket_node.client --save-key   # once
cd node && .venv/bin/python -u -m thicket_node.client

# coordinator locally (SQLite, DRY mode)
cd coordinator && .venv/bin/uvicorn app.main:app --port 8000

# frontend
cd frontend && npm run dev                                       # port 5178

# contracts
cd contracts && forge test                                       # 8 tests
```

## Diagnosing the next outage

`/health` is `async` on purpose — a sync one cannot get a worker thread when the pool is
starved, which is exactly when you need it. It reports:

- `in_flight` — requests running right now, by path. **Read this first.** During the
  collapse it read `437x POST /heartbeat`; healthy is 0–2.
- `slowest_requests` — the 20 slowest seen since boot, with durations.

Request *count* is misleading; concurrency is what exhausts a pool. Heartbeats were 14%
of requests and ~85% of held connections.

Local reproduction is worth the ten minutes it takes: `coordinator/sim.py` runs 88 checks
with no server, no chain and no model, and a production-shaped Postgres can be stood up
locally to test multi-worker behaviour (that is how the startup deadlock and the
4x-settlement bug were both caught before *and* after they hit production).

## Honest status

Mainnet, **unaudited**. As of 2026-08-31: **1,502 nodes registered, 1,480 online,
`jobs_completed` = 5** against ~311,000 tasks executed. Pool 83.6M THKT, ~3.18M credited.

The compute is genuinely real — actual models, actual output — but almost none is being
bought. Paid output is spot-checked at best: `spot_check_rate` is a live setting, and at
zero nothing is cross-checked at all.

The network is a large uptime farm rather than a compute market. That is a consequence of
the reward rate, not of anyone cheating, and it remains the single most important thing to
decide on — cutting 1.0 to 0.35 did not stop it.

One thing was materially wrong and is now fixed: **2.44M THKT was credited but
unclaimable** across 745 operators, because a single missed challenge slot excluded a node
from settlement permanently. Released on 2026-08-31 at the old 1.0 rate, deliberately,
since those minutes were earned under it. The tell, if it ever recurs: healthy nodes sit
near zero `contribution_minutes` because they settle every epoch, stranded ones hold
thousands. Nothing compares credited earnings against the claim tree automatically — that
gap is still only visible if someone looks.
