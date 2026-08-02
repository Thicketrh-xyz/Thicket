# Deploying Thicket to Robinhood Chain Testnet

Network: **Robinhood Chain Testnet** · chain ID **46630** · gas token **ETH**
RPC `https://rpc.testnet.chain.robinhood.com/rpc` · explorer `https://explorer.testnet.chain.robinhood.com`

Everything below runs from your machine with **your** deployer key — the key never leaves your shell and is not committed.

## 1. Fund a deployer wallet

Get testnet ETH from the faucet: https://faucet.testnet.chain.robinhood.com
You need a little ETH to pay gas for the deploy (~2.1M gas total).

## 2. Deploy the contracts

```bash
cd contracts
cp .env.example .env            # then edit .env, OR just export in your shell:
export ROBINHOOD_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com/rpc
export PRIVATE_KEY=0xYOUR_FUNDED_TESTNET_KEY
# optional: export COORDINATOR_ADDRESS=0x...   (publisher+slasher; defaults to deployer)

forge script script/Deploy.s.sol --rpc-url "$ROBINHOOD_TESTNET_RPC" --broadcast
```

The script deploys `ThicketToken`, `NodeStaking`, `RewardsDistributor`, then wires the
roles (token minter → distributor, publisher/slasher → coordinator) and prints the
addresses. They're also saved to `contracts/broadcast/Deploy.s.sol/46630/run-latest.json`.

> Tip: a dry run without `--broadcast` simulates and prints addresses without spending gas.

## 3. Inject addresses into the apps

```bash
cd ..
./scripts/write-env.sh          # reads the broadcast log -> writes frontend/.env + coordinator/.env
```

Then set the coordinator's key (the publisher/slasher that signs root/sles txs):

```bash
# coordinator/.env
COORDINATOR_PRIVATE_KEY=0x...   # fund this address too; use a KMS/HSM in production
```

## 4. Run the stack against testnet

```bash
# coordinator (reads bonds, publishes roots, slashes)
cd coordinator && .venv/bin/uvicorn app.main:app --port 8000

# frontend (Connect Wallet now targets chain 46630 and prompts to add it)
cd frontend && npm run dev
```

The dApp's **Connect Wallet** switches the wallet to Robinhood Chain Testnet (adding it if
needed), and Claim / Stake now hit the live contracts instead of demo data.

## 5. (optional) Verify on the explorer

If the explorer exposes a verification API, add its URL/key to `foundry.toml` `[etherscan]`
and re-run with `--verify`. Otherwise verify manually via the explorer UI.

---

### Safety notes
- **Never commit a private key.** `.env` files and `broadcast/` are git-ignored.
- This is **unaudited** code on a **testnet**. Do not put real value behind it.
- A token with staking yield has real legal/securities implications on mainnet — get
  qualified counsel before any public mainnet launch.
