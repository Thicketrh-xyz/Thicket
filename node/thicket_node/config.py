"""
Node configuration.

Values are resolved in this order (first wins):
  1. command-line flags   (--key, --node-id, ...)
  2. environment variables / node/.env
  3. built-in defaults (already pointed at the live Thicket network)
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

try:
    from dotenv import load_dotenv
    load_dotenv()  # picks up node/.env when present
except ImportError:
    pass  # dotenv is optional; plain env vars still work


def _bool(v) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    private_key: str = ""
    node_id: str = "node-1"
    coordinator_url: str = "https://thicket-production.up.railway.app"
    heartbeat_interval: int = 30

    # on-chain bonding (blank addresses => bonding skipped)
    rpc_url: str = "https://rpc.testnet.chain.robinhood.com/rpc"
    token_address: str = "0x4D4837ddb309a8dCeC3Abe727dbfED584771aEE2"
    staking_address: str = "0x434A64884B7C373eE145f11Ac9b7393723Ee5059"
    bond_amount: str = ""      # human THKT; blank => the contract minimum
    skip_bond: bool = False

    @classmethod
    def load(cls, **overrides) -> "Config":
        """Env first, then any non-empty CLI overrides on top."""
        cfg = cls(
            private_key=os.getenv("THICKET_PRIVATE_KEY", ""),
            node_id=os.getenv("NODE_ID", "node-1"),
            coordinator_url=os.getenv("COORDINATOR_URL", cls.coordinator_url),
            heartbeat_interval=int(os.getenv("HEARTBEAT_INTERVAL", "30")),
            rpc_url=os.getenv("ROBINHOOD_RPC", cls.rpc_url),
            token_address=os.getenv("TOKEN_ADDRESS", cls.token_address),
            staking_address=os.getenv("STAKING_ADDRESS", cls.staking_address),
            bond_amount=os.getenv("BOND_AMOUNT", ""),
            skip_bond=_bool(os.getenv("SKIP_BOND")),
        )
        for k, v in overrides.items():
            if v not in (None, "", False) and hasattr(cfg, k):
                setattr(cfg, k, v)
        return cfg

    @property
    def bonding_configured(self) -> bool:
        return bool(self.rpc_url and self.token_address and self.staking_address)


config = Config.load()   # convenience singleton for simple imports
