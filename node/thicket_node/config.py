"""
Node configuration, loaded from node/.env (or real environment variables).

Copy node/.env.example to node/.env and set at least THICKET_PRIVATE_KEY.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads node/.env when run from the node/ dir (or a parent)
except ImportError:
    pass  # dotenv optional; real env vars still work


def _bool(v: str | None) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    private_key: str = os.getenv("THICKET_PRIVATE_KEY", "")
    node_id: str = os.getenv("NODE_ID", "node-1")
    coordinator_url: str = os.getenv("COORDINATOR_URL", "http://localhost:8000")
    heartbeat_interval: int = int(os.getenv("HEARTBEAT_INTERVAL", "30"))

    # on-chain bonding (leave addresses blank to skip on-chain bonding)
    rpc_url: str = os.getenv("ROBINHOOD_RPC", "https://rpc.testnet.chain.robinhood.com/rpc")
    token_address: str = os.getenv("TOKEN_ADDRESS", "")
    staking_address: str = os.getenv("STAKING_ADDRESS", "")
    bond_amount: str = os.getenv("BOND_AMOUNT", "")   # human THKT; blank => contract minimum
    skip_bond: bool = _bool(os.getenv("SKIP_BOND"))    # true when coordinator is in DRY mode

    @property
    def bonding_configured(self) -> bool:
        return bool(self.rpc_url and self.token_address and self.staking_address)


config = Config()
