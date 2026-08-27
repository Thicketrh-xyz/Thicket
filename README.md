# 🌿 Thicket

**A decentralized GPU network. Run a node on your machine, contribute AI compute, earn THKT.**

Thicket is a DePIN (decentralized physical infrastructure) network on **Robinhood Chain**.
People run the node client, share spare compute, and earn **THKT** two ways: a rate per
minute online, plus a share of what buyers actually paid for the jobs their node completed.
Token holders can also earn by **delegating** to operators.

It's a **hybrid model** — uptime is a subsidy so a node is worth running before demand
exists, and completed work is what actually pays. Bonded stake, recomputable challenges and
slashing keep it sybil-resistant without ZK proofs at this stage.

Live at **[thicketrh.xyz](https://thicketrh.xyz)** · docs at
**[thicketrh.xyz/docs](https://thicketrh.xyz/docs)**

## Contracts

Robinhood Chain · chain ID **4663** · gas token ETH

| | |
|---|---|
| THKT token | `0xC4F36C7c1D00dcaab1d01159466afa189BFc7161` |
| NodeStaking | `0xB179254Ca9A5eB59270c6a0088DD46a8a07b9bb9` |
| RewardsDistributor | `0x1c890110e9cc3dAdeBD6c449437606783B4B682b` |

RPC `https://rpc.mainnet.chain.robinhood.com/rpc` · explorer
[robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) · full record in
[`deployments/robinhood-mainnet.json`](deployments/robinhood-mainnet.json).

**These are the only official addresses.** Verify anything you're unsure about against this
repo and the explorer before sending funds.

## Run a node

No GPU required — **memory is the real constraint.** Uptime and challenges are CPU work.
Serving paid jobs means running a real model, and a node sizes its context window to the
job, up to 32k tokens on a long document. 8GB handles text; vision wants 16GB.

You need a wallet holding **1,000 THKT** (the operator bond) plus a little ETH for gas.

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

Save what it prints, then send that address 1,000+ THKT and a little ETH.

**3. Save your key once** (macOS — stored in the Keychain, never in shell history)

```bash
.venv/bin/python -m thicket_node.client --save-key
```

**4. Start earning**

```bash
.venv/bin/python -u -m thicket_node.client
```

The node bonds itself on-chain, registers, and starts earning. Watch it live at
[thicketrh.xyz/app](https://thicketrh.xyz/app). `Ctrl+C` to stop — your bond stays staked.

### Ways to give it your key

| | How | Notes |
|---|---|---|
| **Keychain** *(best, macOS)* | `--save-key` | Encrypted at rest. macOS prompts for it directly, so it never touches the command line or shell history. `--forget-key` removes it |
| **Prompt** | `.venv/bin/python -m thicket_node.client` | Asks each time; input stays hidden |
| **File** | `echo 'THICKET_PRIVATE_KEY=0x…' >> .env` | Plaintext on disk — `chmod 600 .env`. The only option off macOS |
| **Flag** *(avoid)* | `--key 0xYOUR_KEY` | Lands in your shell history and the process list |

Resolution order: `--key` → `THICKET_PRIVATE_KEY`/`.env` → Keychain → prompt.

### Serve real AI jobs (this is what pays)

Uptime alone earns the per-minute rate. To also receive **paid compute jobs** — and the 70%
revenue share that comes with them — install [Ollama](https://ollama.com) and pull a model.
The node detects what you have and advertises only what it can actually run.

```bash
ollama pull llama3.2:1b     # text jobs — runs on most laptops
ollama pull llava:7b        # image → text (captioning) — heavier
```

Restart and it prints what it can serve:

```
[thicket] serving jobs: text=llama3.2:1b, vision=llava:7b
```

No Ollama? The node says so plainly and keeps earning from uptime — it just won't be handed
jobs it can't do.

### Handy flags

```bash
--save-key            # store your key in the macOS Keychain
--forget-key          # remove it again
--new-wallet          # generate a wallet and exit
--node-id my-rig      # name this node
--bond 2000           # bond more than the minimum
--skip-bond           # already bonded via the web app
--interval 15         # seconds between heartbeats
--help                # everything
```

## Build on Thicket (agent SDK)

Agents can't sign up for an API key — but they can hold a wallet. The SDK turns a job into
one call: approve THKT, pay on-chain, submit, wait, return the result.

```python
from thicket import Thicket

t = Thicket(private_key="0x...")
print(t.quote("some text"))                 # price before committing
print(t.run("Summarise this: ...").output)  # pay + run + result
print(t.caption("chart.png").output)        # vision jobs too
```

It refuses before spending if no node can serve the job, the wallet is short, or the price
exceeds a `max_price` you set. See [`sdk/`](sdk/).

## How it works

```
register (bond THKT)  ──▶  heartbeat every 30s  ──▶  accrue minutes + completed work
        ▲                        │
        │                        ▼
     slash bond  ◀── fail ── challenge, checked by 3-node quorum ── pass ──▶ keep earning
                                 │
                                 ▼
        epoch close  ──▶  cumulative THKT per wallet  ──▶  Merkle root on-chain
                                 │
                                 ▼
                    click Claim  ──▶  one tx pulls everything accrued
```

**Rewards** are `minutes × rate + 70% of what buyers paid` for jobs that node completed.
Delegators take a stake-weighted share of their operator's earnings, minus a 20% commission.

**Merkle-per-epoch** because per-minute rewards can't pay gas every minute. The coordinator
accrues off-chain and publishes one cumulative root per epoch; you claim the delta.

**Challenges** exist because "earn for being online" invites fake nodes. Tasks go to three
random nodes at once and the majority decides; below three online, the coordinator verifies
by recomputing. Disagree and your window's earnings are voided plus a strike — three strikes
slash the bond.

A sampled share of **paid jobs** is cross-checked the same way, and when it is, the buyer
gets the answer the majority agreed on. That share is a live setting: read `spot_check_rate`
from `/stats`. This is spot-checking, not proof — see
[the docs](https://thicketrh.xyz/docs/verification).

## Repo layout

| Path | What |
|---|---|
| [`contracts/`](contracts/) | Foundry — `ThicketToken`, `NodeStaking` (bond + delegation + slashing), `RewardsDistributor` (Merkle claims from a pool) |
| [`coordinator/`](coordinator/) | FastAPI + Postgres — heartbeats, challenges, quorum verification, job routing, epoch → Merkle root |
| [`node/`](node/) | The Python client operators run. Bonds, heartbeats, answers challenges, runs jobs via Ollama |
| [`frontend/`](frontend/) | Landing page, portal and docs |
| [`sdk/`](sdk/) | Agent SDK — buy compute from a wallet in one call |
| [`brand/`](brand/) | Shared design tokens |

`ECONOMICS.md` has measured numbers on what work actually costs a node; `VERIFICATION.md`
is the design and limits of the quorum layer.

## Quick start

**Contracts** (8 tests, incl. Python↔Solidity Merkle interop):

```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test
```

**Coordinator + end-to-end simulation** — no server, no chain, no model required:

```bash
cd coordinator
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m sim         # 78 checks across 16 scenarios
.venv/bin/uvicorn app.main:app  # run the live API
```

The sim walks the cases that decide whether any of this works: a liar outvoted by two
honest nodes, all three disagreeing, a node that never answers, a network too small to form
a quorum, three strikes slashing a bond, a paid job settled by majority, and rewards split
with delegators.

## What's built, and what isn't

**Working end to end:** bonding and registration · signed heartbeats · challenges verified
by quorum or recomputation · real AI jobs through Ollama, text and vision · paid compute
priced by size and verified on-chain before work starts · work-based rewards · delegation
rewards · epoch settlement and claims · the agent SDK.

**Not there yet, stated plainly:**

- **Not audited.** No third party has reviewed the contracts.
- **Most paid work is not verified** — only the sampled share. Spot-checking, not proof.
- **The coordinator is a single point of trust.** It decides what everyone earned; nothing
  on-chain checks its arithmetic.
- **Operators can't refuse jobs.** Beyond capability routing, whatever a buyer sends runs.
- **No refunds.** Payment enters the pool before work starts and can't be pulled back.
- **No image generation.** Vision means image-to-text.
- **No desktop app.** The client is a terminal program.

The most current version of this list is
[What's live now](https://thicketrh.xyz/docs/status) — if anything here disagrees with it,
that page is right.

## License

MIT. The coordinator is included, so you can read exactly how earnings are calculated
rather than take our word for it.
