# Thicket — session handoff

Read this first. State of the project as of commit `0f58be4`.

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

**The economics are being farmed, and it is accelerating.**

At `REWARD_PER_MINUTE=1.0` a node earns 1,440 THKT/day and the bond is 1,000 THKT, so a
node **pays back its bond in 16.7 hours** and then prints indefinitely for heartbeating and
solving integer matmul. This is not a bug being exploited; it is the configured incentive
working as specified.

Observed: node count went **55 → 209 in a matter of hours**. At the first check, 50 of 55
were one operator's fleet (`mn-1` … `mn-50`, sequentially named). Meanwhile
`jobs_completed` is **3** — essentially no compute has been bought.

```
206 active nodes  ->  296,640 THKT/day  ->  ~270 days of pool runway
```

Two levers, neither applied yet because they are the project's call:

- **`REWARD_PER_MINUTE`** (Railway env). At `0.05`, bond payback becomes ~14 days and
  farming stops being free money. Honest operators still earn via the 70% work share.
- **`minOperatorStake`** — `setMinOperatorStake()` on NodeStaking, owner-only. Raising it
  makes fleets expensive rather than merely unprofitable.

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
3. **The coordinator runs out of gas.** `EPOCH_SECONDS=60` means ~1,440 root publishes a
   day. When the wallet empties, `publish_root` throws, the on-chain root freezes while the
   database keeps accruing, and every claim reverts with `InvalidProof` — which the frontend
   shows as "unknown custom error". **This has already happened once.**
   *No longer silent:* `/health` now reports `last_publish` and `gas`, and goes `degraded` on
   a failed publish, a scheduler that has missed three epochs, or under a day of gas left.
   The remaining half is unfixed — the burn rate itself. `EPOCH_SECONDS` stays at **60** by
   choice, so the wallet needs topping up every few days; nothing does that automatically,
   and nothing pages anyone when `/health` turns `degraded`.
4. **The bond is checked only at registration.** `is_bonded` appears zero times in the
   heartbeat handler, so an operator can unbond and keep earning until the coordinator
   restarts.
5. **No multisig.** The owner key can call `recover()` and move the whole pool in one
   transaction. The project has decided against transferring ownership for now — this is a
   known, accepted risk, not an oversight.
6. **Contracts are unaudited.**

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

- **Work-based rewards** — uptime plus 70% of what buyers paid; delegation splits it
- **Redundant verification** — k=3 quorum on challenges and a sampled share of paid jobs,
  settled by majority, wired to strike/slash; recompute fallback below k nodes
- **Real AI jobs** via Ollama — text and vision, capability-routed
- **Size-based pricing**, quoted before payment, re-priced server-side, oversized input
  refused with 413 rather than silently truncated
- Bulk batches, job history, agent SDK with spend guards
- Keychain key storage on the node (`--save-key`)

## Gotchas

- **Git pushes need the `Gentle2003` account.** gh's credential helper only serves the
  *active* account (gh 2.97: a username in the remote URL is ignored). Keep `Gentle2003`
  active; do not switch back to `parleyrobinhood`.
- **Never use the GitHub web editor on this repo.** Web edits are authored by your account
  and re-add you to the contributors list. History was rewritten twice to clear it. Edit
  locally and push.
- **Railway CLI is installed and linked** (`abundant-nurturing` / `Thicket` service). Two
  Postgres services exist: `Postgres` (old testnet data) and `Postgres-DeL4` (live).
- **Vercel CLI must run from the repo root**, not `frontend/` — the project's Root
  Directory is already `frontend`, so running inside it resolves to `frontend/frontend`.
- **Vercel `VITE_*` vars override code defaults** and are baked in at build time. Changing
  them needs a redeploy.
- Coordinator schema changes need an entry in `_ADDED` / `_WIDENED` in `coordinator/app/db.py`.
- Node env values must not have inline comments (`KEY=  # note` becomes the note).
- `MAINNET.md` and `scripts/deploy-mainnet.sh` are gitignored — local only, deliberately.

## Running things

```bash
# verification + reward scenarios (no server, no chain, no model)
cd coordinator && .venv/bin/python -m sim        # 78 checks, 16 scenarios

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

## Honest status

Mainnet, **unaudited**. The compute is genuinely real — actual models, actual output — but
almost none is being bought (`jobs_completed` = 3 against ~30k tasks executed). Paid output
is spot-checked at best: `spot_check_rate` is a live setting, and at zero nothing is
cross-checked at all.

The network is currently a large uptime farm rather than a compute market. That is a
consequence of the reward rate, not of anyone cheating, and it is the single most important
thing to decide on.
