"""
On-chain bridge to the Thicket contracts on Robinhood Chain.

Reads operator bonds from NodeStaking, publishes reward roots to
RewardsDistributor, and slashes misbehaving operators. All config comes from
env so nothing secret is committed:

    ROBINHOOD_RPC             https RPC URL
    COORDINATOR_PRIVATE_KEY   publisher/slasher key (fund it; keep it in a KMS/HSM in prod)
    STAKING_ADDRESS           deployed NodeStaking
    DISTRIBUTOR_ADDRESS       deployed RewardsDistributor

If web3/env aren't configured, ChainBridge runs in DRY mode: it logs what it
*would* send instead of transacting, so the coordinator + simulator work
with no chain attached.
"""
from __future__ import annotations

import os

try:
    from web3 import Web3
    from web3.logs import DISCARD
    _WEB3 = True
except ImportError:  # keeps the coordinator importable without web3 installed
    _WEB3 = False
    DISCARD = None

_STAKING_ABI = [
    {"name": "operators", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "", "type": "address"}],
     "outputs": [{"name": "registered", "type": "bool"},
                 {"name": "selfStake", "type": "uint256"},
                 {"name": "delegatedStake", "type": "uint256"},
                 {"name": "nodeId", "type": "bytes32"}]},
    {"name": "slash", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "operator", "type": "address"},
                {"name": "amount", "type": "uint256"},
                {"name": "reason", "type": "string"}], "outputs": []},
    {"name": "delegations", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "", "type": "address"}, {"name": "", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "Delegated", "type": "event", "anonymous": False,
     "inputs": [{"name": "delegator", "type": "address", "indexed": True},
                {"name": "operator", "type": "address", "indexed": True},
                {"name": "amount", "type": "uint256", "indexed": False}]},
]
_DISTRIBUTOR_ABI = [
    {"name": "publishRoot", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "root", "type": "bytes32"}], "outputs": []},
    {"name": "poolBalance", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "PoolFunded", "type": "event", "anonymous": False,
     "inputs": [{"name": "from", "type": "address", "indexed": True},
                {"name": "amount", "type": "uint256", "indexed": False}]},
]


class ChainBridge:
    def __init__(self):
        self.rpc = os.getenv("ROBINHOOD_RPC")
        self.key = os.getenv("COORDINATOR_PRIVATE_KEY")
        self.staking_addr = os.getenv("STAKING_ADDRESS")
        self.distributor_addr = os.getenv("DISTRIBUTOR_ADDRESS")
        self.dry = not (_WEB3 and self.rpc and self.key and self.staking_addr and self.distributor_addr)

        if not self.dry:
            self.w3 = Web3(Web3.HTTPProvider(self.rpc))
            self.acct = self.w3.eth.account.from_key(self.key)
            self.staking = self.w3.eth.contract(
                address=Web3.to_checksum_address(self.staking_addr), abi=_STAKING_ABI)
            self.distributor = self.w3.eth.contract(
                address=Web3.to_checksum_address(self.distributor_addr), abi=_DISTRIBUTOR_ABI)

    # --- reads ---
    def is_bonded(self, address: str) -> bool:
        """True if the operator has an active bond (skin in the game)."""
        if self.dry:
            return True  # trust in dry/sim mode
        registered, self_stake, _, _ = self.staking.functions.operators(
            Web3.to_checksum_address(address)).call()
        return registered and self_stake > 0

    def pool_balance(self) -> float:
        """THKT currently in the rewards pool (0.0 in DRY mode)."""
        if self.dry:
            return 0.0
        try:
            return self.distributor.functions.poolBalance().call() / 1e18
        except Exception:  # noqa: BLE001
            return 0.0

    def operator_stake(self, address: str) -> tuple[float, float]:
        """(self_stake, delegated_stake) in THKT for one operator."""
        if self.dry:
            return (0.0, 0.0)
        try:
            _, self_stake, delegated, _ = self.staking.functions.operators(
                Web3.to_checksum_address(address)).call()
            return (self_stake / 1e18, delegated / 1e18)
        except Exception:  # noqa: BLE001
            return (0.0, 0.0)

    def delegation_of(self, delegator: str, operator: str) -> float:
        """Current delegated THKT for one (delegator, operator) pair.

        The authoritative number. Event history alone can't give it:
        `unbondDelegation` emits UnbondQueued without saying which operator the
        stake came out of, so a delegator's balance can't be replayed from logs.
        Events are only used to *discover* pairs; this call is the truth.
        """
        if self.dry:
            return 0.0
        try:
            return self.staking.functions.delegations(
                Web3.to_checksum_address(delegator),
                Web3.to_checksum_address(operator)).call() / 1e18
        except Exception:  # noqa: BLE001
            return 0.0

    def find_delegations(self, from_block: int, to_block: int | None = None) -> tuple[list[tuple[str, str]], int]:
        """Scan Delegated logs for (delegator, operator) pairs.

        Returns (pairs, last_block_scanned). Pairs may repeat and may since have
        been fully undelegated — the caller re-reads each balance on chain.
        """
        if self.dry:
            return ([], from_block)
        try:
            latest = self.w3.eth.block_number if to_block is None else to_block
            if from_block > latest:
                return ([], latest)
            logs = self.staking.events.Delegated().get_logs(
                from_block=from_block, to_block=latest)
            pairs = [(ev["args"]["delegator"], ev["args"]["operator"]) for ev in logs]
            return (pairs, latest)
        except Exception:  # noqa: BLE001 — RPC log limits, reorgs, provider quirks
            return ([], from_block)

    def verify_payment(self, tx_hash: str, payer: str, min_thkt: float) -> bool:
        """Confirm tx_hash is a successful fund() that paid >= min_thkt into the
        pool from `payer` (a PoolFunded event). Trusts the client in DRY mode."""
        if self.dry:
            return True
        try:
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
            if not receipt or receipt.status != 1:
                return False
            min_wei = int(min_thkt * 1e18)
            events = self.distributor.events.PoolFunded().process_receipt(receipt, errors=DISCARD)
            for ev in events:
                if ev["args"]["from"].lower() == payer.lower() and ev["args"]["amount"] >= min_wei:
                    return True
            return False
        except Exception:  # noqa: BLE001 — any RPC/parse failure => not verified
            return False

    # --- writes ---
    def publish_root(self, root_hex: str):
        if self.dry:
            print(f"[chain:DRY] publishRoot({root_hex})")
            return None
        return self._send(self.distributor.functions.publishRoot(bytes.fromhex(root_hex[2:])))

    def slash(self, operator: str, amount_wei: int, reason: str):
        if self.dry:
            print(f"[chain:DRY] slash({operator}, {amount_wei}, {reason!r})")
            return None
        return self._send(self.staking.functions.slash(
            Web3.to_checksum_address(operator), amount_wei, reason))

    def _send(self, fn):
        tx = fn.build_transaction({
            "from": self.acct.address,
            "nonce": self.w3.eth.get_transaction_count(self.acct.address),
        })
        signed = self.acct.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return self.w3.to_hex(h)
