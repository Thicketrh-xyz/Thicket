# 🌿 Thicket

**A decentralized GPU network. Run a node on your machine, contribute AI compute, earn THKT.**

Thicket is a DePIN (decentralized physical infrastructure) network on **Robinhood Chain**.
People download the node client, share spare GPU, and earn the **THKT** token per verified
minute of contribution. Token holders can also earn by **staking/delegating** to operators.

Thicket uses a **hybrid model** — reward uptime, but nodes must
pass periodic real inference *challenges* to keep earning, with staked bonds and slashing
for anti-sybil.

## Brand

Lime-green circuit-tree on white (see the logo). Design tokens live in
[`brand/theme.css`](brand/theme.css) — import them everywhere UI is rendered. Primary is
`--thicket-lime: #a3ce3a`.

## Run a node

Any PC works — no GPU needed yet. You need a wallet holding **1,000 THKT** (the operator
bond) plus a little testnet ETH for gas.

**1. Get the code and install**

```bash
git clone https://github.com/Thicketrh-xyz/Thicket.git
cd Thicket/node
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

**2. Need a wallet? Make one** (skip if you already have one)

```bash
.venv/bin/python -m thicket_node.client --new-wallet
```

Save the address and private key it prints, then send that address 1,000+ THKT and a little
testnet ETH.

**3. Start earning**

```bash
.venv/bin/python -u -m thicket_node.client --key 0xYOUR_PRIVATE_KEY
```

That's it. The node bonds itself on-chain, registers, and starts earning. Watch it live at
[thicketrh.xyz/app](https://thicketrh.xyz/app). Press `Ctrl+C` to stop — your bond stays staked.

### Three ways to give it your key

| | How | Notes |
|---|---|---|
| **Prompt** *(safest)* | `.venv/bin/python -u -m thicket_node.client` | Asks for the key; input stays hidden and isn't saved to shell history |
| **Flag** *(quickest)* | `--key 0xYOUR_KEY` | Convenient, but the key lands in your shell history |
| **File** *(persistent)* | `echo 'THICKET_PRIVATE_KEY=0xYOUR_KEY' >> .env` | Set once, then just run the client |

### Serve real AI jobs (optional but recommended)

Uptime alone earns THKT. To also get **paid compute jobs**, install
[Ollama](https://ollama.com) and pull a model — the node detects what you have and
advertises only what it can actually run.

```bash
# text jobs (small + fast, runs on most laptops)
ollama pull llama3.2:1b

# image -> text jobs, e.g. captioning (heavier)
ollama pull llava:7b
```

Restart the node and it will print what it can serve:

```
[thicket] serving jobs: text=llama3.2:1b, vision=llava:7b
```

No Ollama? The node says so plainly and keeps earning from uptime — it just won't be
handed jobs it can't do.

### Handy flags

```bash
--new-wallet          # generate a wallet and exit
--node-id my-rig      # name this node
--bond 2000           # bond more than the minimum
--skip-bond           # already bonded via the web app
--interval 15         # seconds between heartbeats
--help                # everything
```

## Build on Thicket (agent SDK)

Agents can't sign up for an API key — but they can hold a wallet. The SDK turns a
job into one call: approve THKT, pay on-chain, submit, wait, return the result.

```python
from thicket import Thicket

t = Thicket(private_key="0x...")
print(t.quote("some text"))                 # price before committing
print(t.run("Summarise this: ...").output)  # pay + run + result
print(t.caption("chart.png").output)        # vision jobs too
```

It refuses before spending if no node can serve the job, the wallet is short, or the
price exceeds a `max_price` you set. See [`sdk/`](sdk/).

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

## Quick start

**Contracts** (5 passing tests, incl. Python↔Solidity Merkle interop):
```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test
```

**Coordinator + end-to-end simulation** (no chain needed — runs in DRY mode):
```bash
cd coordinator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m sim        # 4 nodes register, solve challenges, one liar gets slashed, epoch root published
.venv/bin/python gen_fixture.py # regenerate the Solidity interop test from the Python tree
.venv/bin/uvicorn app.main:app  # run the live API
```

## Status — the anti-sybil core is real and verified

The hybrid loop works end-to-end:
- **Signing** — real EIP-191. Nodes prove address control; coordinator recovers + checks freshness.
- **Challenge** — deterministic seeded compute (`challenge.py`), verified by recomputation. Liars fail, earnings void, repeated fails → on-chain `slash`.
- **Merkle** — OZ-compatible tree (`merkle.py`); a Python-generated proof **verifies on-chain** (`MerkleInterop.t.sol`).
- **Chain bridge** — reads bonds, publishes roots, slashes; DRY mode when no RPC/key is set.

Still stubbed for later: the challenge is integer matmul, not yet a real GPU model (swap behind `solve_challenge`); redundant/majority verification; Postgres+Redis for state; the Tauri desktop UI. **Not audited. Not on mainnet.**

> ⚠️ A token with staking yield paid from a treasury has real legal/securities
> implications. Get qualified counsel before any public mainnet launch. This repo is
> engineering scaffolding, not legal or financial advice.
