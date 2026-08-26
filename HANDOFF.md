# Thicket — session handoff

Read this first. It's the state of the project as of commit `9fb11f0` (63 commits).

## What Thicket is

A decentralized GPU network on Robinhood Chain. Operators run a node client, pass
verification challenges, and earn **THKT** per verified minute. Buyers pay THKT for AI
compute (text + vision), and those payments refill the pool operators are paid from.

**It is live on testnet and working end to end** — a real node has served real model
jobs paid for with real on-chain THKT.

## Live

| | |
|---|---|
| Site | https://thicketrh.xyz — landing, `/app` portal, `/docs` |
| Coordinator | https://thicket-production.up.railway.app (Railway + Postgres) |
| Repo | https://github.com/Thicketrh-xyz/Thicket (public, MIT) |
| Chain | Robinhood Chain **testnet**, chain ID `46630` |

**Contracts** (fixed-supply pool model — no minting):

| Contract | Address |
|---|---|
| THKT token | `0x4D4837ddb309a8dCeC3Abe727dbfED584771aEE2` (1B fixed) |
| NodeStaking | `0x434A64884B7C373eE145f11Ac9b7393723Ee5059` |
| RewardsDistributor | `0xD5afab6f1d786be0fad6281b9c842D0662Fa88e5` (350M pool) |

Treasury / publisher / slasher: `0x249d3652A487a116cFa39B7B0D1a2f1A020Ec860` (holds 650M THKT).
Railway's `COORDINATOR_PRIVATE_KEY` **must** be this wallet's key — it's the only address
allowed to publish reward roots and slash.

## Architecture

```
Browser ──▶ Frontend (Vercel)  ──▶ Coordinator (Railway) ──▶ Contracts (testnet)
Agents  ──▶ SDK (sdk/thicket.py) ──▶      │
Nodes   ──▶ node client ───────────────────┘
```

- `contracts/` — Foundry. Fixed-supply token, staking/slashing, Merkle claims from a pool.
- `coordinator/` — FastAPI + Postgres. Heartbeats, challenges, job routing, epoch settlement.
- `node/` — the client operators run. Bonds on-chain, heartbeats, solves challenges, runs jobs via Ollama.
- `frontend/` — landing + portal + docs (one design system, `ref-landing.css`).
- `sdk/` — agent SDK: buy compute from a wallet in one call.

## What's built

- **Redundant verification** — a sampled share of tasks runs on k=3 random nodes and is
  settled by majority; disagreement voids earnings and strikes, 3 strikes slashes the bond
- Fixed-supply **pool tokenomics** (launchpad-compatible; rewards transferred, never minted)
- **Anti-sybil**: on-chain bond + EIP-191 signed heartbeats + challenges verified by quorum
  (or recompute, below k nodes) + slashing
- **Real AI jobs** via Ollama — text (`llama3.2:1b`) and vision (`llava:7b`), capability-routed
  so a node only gets work it can actually do
- **Size-based pricing** — base + per-1k-chars + per-megapixel for images; quoted before payment,
  re-priced server-side on submit
- **Bulk** — one payment, many items, fanned out (4 jobs per node per heartbeat); UI + SDK
- **Agent SDK** with spend guards (no capable node / insufficient balance / over max_price)
- Job history, failure reporting, orphaned-job requeue, `/debug/jobs`

## What's left, in priority order

1. **Economics — supply side.** Buyers are charged by work done, but operators still earn a flat
   **1 THKT/min** regardless of what they do. A node grinding a 1,000-item batch earns the same as
   an idle one. *Do this next: time a real batch and a large document first — those numbers tell
   you what the rate should be.*
2. ~~**Job verification.**~~ **Built** — see `VERIFICATION.md`. k-node quorum (k=3), 10%
   spot-check on paid work, majority settlement wired to the existing strike/slash path,
   recompute fallback when fewer than k nodes are online. `coordinator/sim.py` covers it.
   The claim you can now make is narrow and worth keeping narrow: *a sampled share of work
   is cross-checked by three independent nodes*. Not "all work is verified".
3. **Operators can't refuse jobs** — whatever a buyer sends runs on their machine.
4. **Mainnet prerequisites** — audit, multisig on publisher/owner, legal review. The
   `RewardsDistributor` holds the pool and whoever controls the publisher key can drain it.

## Untested

- The SDK's **paid** path (reads and guards verified; never completed a paid job)
- A **real bulk run** on the live network
- **Quorum with more than one real machine.** The logic is covered by `sim.py` and a single
  real node was run end to end, but three separate machines have never voted on one task.
  The similarity threshold (`QUORUM_JOB_THRESHOLD`, 0.72) was measured on one box, where
  `temperature: 0` makes output byte-identical — it has never been tested against two
  different GPUs or quantisations.

All need a funded wallet or more hardware. Expect rough edges there first.

## Gotchas

- **Git pushes need the `Gentle2003` account.** `gh` has two accounts; `parleyrobinhood` (a
  different project) is usually active and has no access to this org. Switch, push, switch back:
  ```
  gh auth switch --hostname github.com --user Gentle2003
  git push origin main
  gh auth switch --hostname github.com --user parleyrobinhood
  ```
- Commits are authored as **Thicket Team**, deliberately — the repo is public.
- `reference/` is git-ignored (design source, local only).
- Coordinator schema changes need an entry in `_ADDED` / `_WIDENED` in `coordinator/app/db.py` —
  `create_all()` won't alter live tables.
- Node env values must not have inline comments (`KEY=  # note` becomes the note).

## Running things

```bash
# verification scenarios (no server, no chain, no model)
cd coordinator && .venv/bin/python -m sim

# node
cd node && .venv/bin/python -u -m thicket_node.client        # prompts for key
ollama pull llama3.2:1b     # text jobs      (optional, but needed to serve work)
ollama pull llava:7b        # vision jobs

# coordinator locally (SQLite, DRY mode)
cd coordinator && .venv/bin/uvicorn app.main:app --port 8000

# frontend
cd frontend && npm run dev                                   # port 5178

# contracts
cd contracts && forge test
```

## Honest status

Testnet, **unaudited**. THKT has no real value here. The "compute" is genuinely real now
(actual models, actual output). Output is **spot-checked, not verified**: 10% of paid work is
cross-checked by three nodes and the other 90% is policed only by the risk of being sampled.
The reward side of the economy is still not tied to work done.
