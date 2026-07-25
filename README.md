# 🌿 Thicket

**A decentralized GPU network. Run a node on your machine, contribute AI compute, earn THKT.**

Thicket is a DePIN (decentralized physical infrastructure) network on **Robinhood Chain**.
People download the node client, share spare GPU, and earn the **THKT** token per verified
minute of contribution. Token holders can also earn by **staking/delegating** to operators.

Inspired by [Crynux](https://crynux.io/), but scoped as a shippable MVP: instead of
ZK-proof verified compute, Thicket uses a **hybrid model** — reward uptime, but nodes must
pass periodic real inference *challenges* to keep earning, with staked bonds and slashing
for anti-sybil.

## Brand

Lime-green circuit-tree on white (see the logo). Design tokens live in
[`brand/theme.css`](brand/theme.css) — import them everywhere UI is rendered. Primary is
`--thicket-lime: #a3ce3a`.

## How it works — the hybrid loop

```
register (bond THKT)  ──▶  heartbeat every 30s  ──▶  accrue contribution minutes
        ▲                        │
        │                        ▼
     slash bond  ◀── fail ── random inference challenge (~10 min) ── pass ──▶ keep earning
                                 │
                                 ▼
        epoch close  ──▶  cumulative THKT per wallet  ──▶  Merkle root on-chain
                                 │
                                 ▼
                    user clicks Claim  ──▶  one tx pulls accrued THKT
```

**Why Merkle-per-epoch:** per-minute rewards can't pay gas every minute. The coordinator
accrues off-chain and publishes one cumulative root per epoch; users claim the delta.

**Why challenges:** "earn for being online" invites fake nodes. A node with no GPU fails
the inference challenge, its earnings for the window are voided, and repeated failures
slash its bond. That's the anti-sybil core — no ZK required for the MVP.

## Repo layout

| Path | What |
|---|---|
| [`contracts/`](contracts/) | Foundry — `ThicketToken` (THKT), `NodeStaking` (bond + delegation + slashing), `RewardsDistributor` (Merkle claims) |
| [`coordinator/`](coordinator/) | FastAPI — heartbeats, contribution accounting, challenges, epoch → Merkle root |
| [`node/`](node/) | Python node client (+ future Tauri desktop shell) users run to earn |
| [`brand/`](brand/) | Shared design tokens from the logo |

## Roadmap

1. **Contracts + testnet** — deploy the three contracts to Robinhood Chain testnet.
2. **Coordinator + simulated nodes** — heartbeat accounting, epoch roots, claim flow.
3. **Node client** — real desktop app, wallet, live earnings UI.
4. **Challenge system** — real inference task + result verification (anti-sybil core).
5. **Economics + hardening** — emission schedule, slashing tuning, load test, **legal review before mainnet.**

## Quick start (contracts)

```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test
```

## Status

Early scaffold. Skeletons compile-shaped with `TODO`s marking where real signing,
the model runtime, and Merkle construction go. **Not audited. Not on mainnet.**

> ⚠️ A token with staking yield paid from a treasury has real legal/securities
> implications. Get qualified counsel before any public mainnet launch. This repo is
> engineering scaffolding, not legal or financial advice.
