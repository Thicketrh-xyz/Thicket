#!/usr/bin/env bash
# Reads the deployed contract addresses from the Foundry broadcast log and
# writes them into frontend/.env and coordinator/.env. Run from the repo root
# AFTER a successful `forge script ... --broadcast`.
#
#   ./scripts/write-env.sh [CHAIN_ID]   (default 46630 = Robinhood Chain testnet)
set -euo pipefail

CHAIN_ID="${1:-46630}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BROADCAST="$ROOT/contracts/broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"
RPC="${ROBINHOOD_TESTNET_RPC:-https://rpc.testnet.chain.robinhood.com/rpc}"

[ -f "$BROADCAST" ] || { echo "No broadcast at $BROADCAST — deploy first."; exit 1; }
command -v jq >/dev/null || { echo "jq is required (brew install jq)."; exit 1; }

pick() { jq -r "[.transactions[] | select(.contractName==\"$1\")][0].contractAddress" "$BROADCAST"; }
TOKEN="$(pick ThicketToken)"
STAKING="$(pick NodeStaking)"
DIST="$(pick RewardsDistributor)"

[ "$TOKEN" != "null" ] && [ "$STAKING" != "null" ] && [ "$DIST" != "null" ] \
  || { echo "Could not parse all addresses from broadcast."; exit 1; }

cat > "$ROOT/frontend/.env" <<EOF
VITE_CHAIN_ID=$CHAIN_ID
VITE_RPC_URL=$RPC
VITE_TOKEN_ADDRESS=$TOKEN
VITE_STAKING_ADDRESS=$STAKING
VITE_DISTRIBUTOR_ADDRESS=$DIST
EOF

# Preserve an existing coordinator key if one is already set.
KEY=""
[ -f "$ROOT/coordinator/.env" ] && KEY="$(grep -E '^COORDINATOR_PRIVATE_KEY=' "$ROOT/coordinator/.env" | head -1 | cut -d= -f2- || true)"
cat > "$ROOT/coordinator/.env" <<EOF
ROBINHOOD_RPC=$RPC
COORDINATOR_PRIVATE_KEY=$KEY
STAKING_ADDRESS=$STAKING
DISTRIBUTOR_ADDRESS=$DIST
EOF

echo "Wrote frontend/.env and coordinator/.env:"
echo "  THKT token         : $TOKEN"
echo "  NodeStaking        : $STAKING"
echo "  RewardsDistributor : $DIST"
[ -z "$KEY" ] && echo "  NOTE: set COORDINATOR_PRIVATE_KEY in coordinator/.env (publisher+slasher)."
