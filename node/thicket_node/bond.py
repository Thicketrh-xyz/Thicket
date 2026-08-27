"""
On-chain operator bonding for a Thicket node.

On startup a node checks whether its wallet is already a registered operator in
NodeStaking. If not (and bonding is configured), it approves and bonds THKT so
the coordinator's on-chain `is_bonded` check passes and the operator has real,
slashable skin in the game.

Requires the node wallet to hold THKT (for the bond) and a little ETH
(for gas). If it doesn't, we exit with a clear, actionable message.
"""
from __future__ import annotations

from decimal import Decimal

try:
    from web3 import Web3
except ImportError:  # pragma: no cover
    Web3 = None

TOKEN_ABI = [
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "allowance", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "o", "type": "address"}, {"name": "s", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "s", "type": "address"}, {"name": "a", "type": "uint256"}],
     "outputs": [{"name": "", "type": "bool"}]},
]
STAKING_ABI = [
    {"name": "operators", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "", "type": "address"}],
     "outputs": [{"name": "registered", "type": "bool"}, {"name": "selfStake", "type": "uint256"},
                 {"name": "delegatedStake", "type": "uint256"}, {"name": "nodeId", "type": "bytes32"}]},
    {"name": "minOperatorStake", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "registerOperator", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "nodeId", "type": "bytes32"}, {"name": "amount", "type": "uint256"}], "outputs": []},
]


def _thkt(wei: int) -> str:
    return f"{wei / 1e18:,.2f}"


def _send(w3, account, fn):
    tx = fn.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
    })
    signed = account.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(h)
    if receipt.status != 1:
        raise SystemExit(f"[thicket] transaction reverted: {w3.to_hex(h)}")
    return w3.to_hex(h)


def ensure_bonded(cfg, account) -> str:
    """Bond the operator if needed. Returns a human-readable status line."""
    if cfg.skip_bond:
        return "SKIP_BOND set — not bonding (coordinator likely in DRY mode)"
    if not cfg.bonding_configured:
        return "on-chain bonding not configured (no RPC/addresses) — skipping"
    if Web3 is None:
        return "web3 not installed — skipping on-chain bonding"

    w3 = Web3(Web3.HTTPProvider(cfg.rpc_url))
    addr = account.address
    token = w3.eth.contract(address=Web3.to_checksum_address(cfg.token_address), abi=TOKEN_ABI)
    staking = w3.eth.contract(address=Web3.to_checksum_address(cfg.staking_address), abi=STAKING_ABI)

    registered, self_stake, _, _ = staking.functions.operators(addr).call()
    if registered:
        return f"already bonded — {_thkt(self_stake)} THKT staked"

    min_stake = staking.functions.minOperatorStake().call()
    bond = int(Decimal(cfg.bond_amount) * 10**18) if cfg.bond_amount else min_stake
    if bond < min_stake:
        raise SystemExit(f"[thicket] BOND_AMOUNT {_thkt(bond)} < minimum {_thkt(min_stake)} THKT")

    balance = token.functions.balanceOf(addr).call()
    if balance < bond:
        raise SystemExit(
            f"[thicket] wallet {addr} holds {_thkt(balance)} THKT but needs {_thkt(bond)} to bond.\n"
            f"          Send at least {_thkt(bond)} THKT (and a little ETH for gas) to that address, then retry.\n"
            f"          Or set SKIP_BOND=true in node/.env to run without bonding (coordinator must be in DRY mode)."
        )

    print(f"[thicket] bonding {_thkt(bond)} THKT as operator {addr} …")
    if token.functions.allowance(addr, Web3.to_checksum_address(cfg.staking_address)).call() < bond:
        _send(w3, account, token.functions.approve(Web3.to_checksum_address(cfg.staking_address), bond))
    node_id32 = Web3.keccak(text=cfg.node_id)
    tx = _send(w3, account, staking.functions.registerOperator(node_id32, bond))
    return f"bonded {_thkt(bond)} THKT — operator registered (tx {tx})"
