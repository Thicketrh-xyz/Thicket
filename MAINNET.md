# Mainnet deploy runbook

Every command runs from your machine with **your** key. The key never leaves your shell,
is never committed, and nobody else needs to see it at any point.

Work through this in order. Each step has a check — do the check before moving on,
because most of these are irreversible.

## 0. Fill in what isn't known yet

The mainnet network details are not in this repo. Get them from Robinhood Chain's own
documentation and set them before anything else — **do not guess**, and do not reuse the
testnet values.

```bash
export MAINNET_RPC="https://…"          # Robinhood Chain mainnet RPC
export MAINNET_CHAIN_ID=                # mainnet chain id (NOT 46630)
export MAINNET_EXPLORER="https://…"     # block explorer
```

Confirm the RPC is the chain you think it is:

```bash
cast chain-id --rpc-url "$MAINNET_RPC"
```

**It must print `$MAINNET_CHAIN_ID`.** If it prints `46630` you are pointed at the testnet.

## 1. Decide the four addresses

Generate these yourself; nobody else should ever hold them.

| Role | What it is | Where the key lives |
|---|---|---|
| **Deployer / treasury** | deploys, receives the full 1B supply, becomes owner | hardware wallet |
| **Coordinator** | publisher + slasher | Railway env — this one is online |
| **Multisig** | takes ownership after deploy | Safe, hardware signers |
| *(later)* buyback sender | tops the pool up | can be the treasury |

The split that matters: **coordinator ≠ deployer.** The coordinator key has to sit on a
server to publish roots. If it is also the owner, then anyone who gets into Railway can
call `recover()` and take the pool. Keeping them separate means a server breach costs you
bad reward roots, not the pool.

Fund the deployer with mainnet gas — the deploy is roughly 2.1M gas.

## 2. Set the deploy parameters

```bash
cd contracts
export PRIVATE_KEY=0x…                                    # deployer; never commit
export COORDINATOR_ADDRESS=0x…                            # separate hot wallet — do not skip
export REWARDS_POOL=30000000000000000000000000            # 30M THKT opening balance
export TOTAL_SUPPLY=1000000000000000000000000000          # 1B fixed
export MIN_OPERATOR_STAKE=1000000000000000000000          # 1,000 THKT
```

`REWARDS_POOL` is the pool's **opening balance**, not its target. The remaining supply
stays in the treasury and is moved to the distributor over time by buybacks and compute
revenue. Leaving it unset gives you 30M, which is the intended default.

If `COORDINATOR_ADDRESS` is unset the deployer becomes publisher and slasher — the exact
thing step 1 is avoiding. Check it is set:

```bash
echo "coordinator: $COORDINATOR_ADDRESS"
```

## 3. Dry run first

No `--broadcast`, so nothing is sent and no gas is spent. It simulates the whole deploy
and prints the addresses it *would* create.

```bash
forge script script/Deploy.s.sol --rpc-url "$MAINNET_RPC"
```

Read the output. Confirm the supply, the pool amount, and that it is talking to the right
chain. **This is the last point at which nothing has happened yet.**

## 4. Deploy

```bash
forge script script/Deploy.s.sol --rpc-url "$MAINNET_RPC" --broadcast
```

The script deploys the token, NodeStaking and RewardsDistributor, points publisher and
slasher at `COORDINATOR_ADDRESS`, and transfers `REWARDS_POOL` into the distributor.

Addresses are printed and saved to
`contracts/broadcast/Deploy.s.sol/$MAINNET_CHAIN_ID/run-latest.json`.

## 5. Verify what you actually deployed

Read it back from chain rather than trusting the script output.

```bash
export TOKEN=0x…  STAKING=0x…  DIST=0x…      # from step 4

cast call $DIST "owner()(address)"      --rpc-url "$MAINNET_RPC"   # deployer
cast call $DIST "publisher()(address)"  --rpc-url "$MAINNET_RPC"   # COORDINATOR_ADDRESS
cast call $STAKING "owner()(address)"   --rpc-url "$MAINNET_RPC"   # deployer
cast call $STAKING "slasher()(address)" --rpc-url "$MAINNET_RPC"   # COORDINATOR_ADDRESS
cast call $DIST "poolBalance()(uint256)" --rpc-url "$MAINNET_RPC"  # 30M * 1e18
cast call $TOKEN "totalSupply()(uint256)" --rpc-url "$MAINNET_RPC" # 1B * 1e18
```

`publisher` and `slasher` must be the coordinator address, **not** the deployer. If they
are the deployer, `COORDINATOR_ADDRESS` was unset — fix it now, before the key goes near a
server:

```bash
cast send $DIST "setPublisher(address)" $COORDINATOR_ADDRESS --rpc-url "$MAINNET_RPC" --interactive
cast send $STAKING "setSlasher(address)" $COORDINATOR_ADDRESS --rpc-url "$MAINNET_RPC" --interactive
```

## 6. Record the deployment

```bash
cd ..
./scripts/write-env.sh "$MAINNET_CHAIN_ID" "$MAINNET_RPC"
```

That writes `frontend/.env` and `coordinator/.env`. It refuses to run if a non-testnet
chain id is paired with a testnet RPC.

Then add a deployment record next to the testnet one — a new file,
`deployments/robinhood-mainnet.json`, rather than editing the existing one. The testnet
deployment keeps running and its record should stay accurate.

## 7. Point the live services at it

**Railway** (coordinator):

```
ROBINHOOD_RPC=<MAINNET_RPC>
STAKING_ADDRESS=<STAKING>
DISTRIBUTOR_ADDRESS=<DIST>
COORDINATOR_PRIVATE_KEY=<coordinator hot wallet key — NOT the deployer>
```

Fund the coordinator address with gas; it pays for every root it publishes.

**Vercel** (frontend): `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_TOKEN_ADDRESS`,
`VITE_STAKING_ADDRESS`, `VITE_DISTRIBUTOR_ADDRESS`.

**Docs and site copy** still describe testnet in `frontend/src/components/docs/shared.js`
(RPC, explorer, chain id, addresses, network name) and `frontend/src/config.js`.

## 8. Hand ownership to the multisig

Do this once the deployment is confirmed working. After it, the deployer key can no longer
call `recover()`, `setPublisher()`, `setSlasher()`, `setMinOperatorStake()` or
`setUnbondingPeriod()` — the multisig does.

```bash
cast send $DIST    "transferOwnership(address)" $MULTISIG --rpc-url "$MAINNET_RPC" --interactive
cast send $STAKING "transferOwnership(address)" $MULTISIG --rpc-url "$MAINNET_RPC" --interactive

cast call $DIST    "owner()(address)" --rpc-url "$MAINNET_RPC"
cast call $STAKING "owner()(address)" --rpc-url "$MAINNET_RPC"
```

Both must return the multisig. **Verify the multisig can actually execute a transaction
before transferring** — ownership transfer is one-way, and a Safe nobody can sign for means
the parameters are frozen forever.

## 9. Afterwards

**Topping up the pool** — send THKT to the distributor address. `fund()` (after `approve`)
emits a `PoolFunded` event, which gives a public trail for a buyback; a plain transfer
works too but leaves no distinguishing record.

```bash
cast send $TOKEN "approve(address,uint256)" $DIST <AMOUNT_WEI> --rpc-url "$MAINNET_RPC" --interactive
cast send $DIST  "fund(uint256)" <AMOUNT_WEI>                  --rpc-url "$MAINNET_RPC" --interactive
```

The portal picks the new balance up within seconds — it reads
`token.balanceOf(distributor)` live, so nothing needs redeploying or restarting.

**Settings you may want to revisit on day one:**

| Variable | Where | Note |
|---|---|---|
| `REWARD_PER_MINUTE` | Railway | still `1.0`. 60 THKT/hour for an idle node is a testnet figure |
| `QUORUM_SPOT_CHECK` | Railway | currently `0` — no paid job is cross-checked |
| `unbondingPeriod` | contract | `setUnbondingPeriod(seconds)`, owner-only |
| `OPERATOR_COMMISSION` | Railway | `0.20` — the operator's cut of delegator rewards |

## Known risks, still open

Stated plainly, because deploying does not resolve any of them.

- **The contracts are unaudited.** No third party has reviewed NodeStaking or
  RewardsDistributor, and both hold other people's money.
- **`recover()` can move the whole pool** in one transaction, by the owner. A multisig makes
  that a deliberate act rather than a single compromised key.
- **The coordinator is a single point of trust.** It decides what everyone earned; nothing
  on-chain checks its arithmetic.
- **Delegated stake is not slashed** — `slash()` only touches an operator's own bond, so
  delegation is upside without downside, paid out of a finite pool.
- **Bonds are checked at registration only**, so an operator who unbonds afterwards keeps
  earning until the coordinator restarts.
- **Nothing ties published roots to the pool balance.** If entitlements outrun the pool,
  claims simply start reverting.
