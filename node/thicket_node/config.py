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


def _clean(v) -> str:
    """Env values can pick up an inline comment when the value is empty
    (dotenv keeps `KEY=   # note` as the comment text). Strip that, and any
    surrounding whitespace/quotes, so a stray note never becomes a value."""
    v = str(v or "").strip().strip('"').strip("'")
    if v.startswith("#"):
        return ""
    return v.split("  #")[0].strip()


def _bool(v) -> bool:
    return _clean(v).lower() in ("1", "true", "yes", "on")


def _amount(v) -> str:
    """Only keep a bond amount that's actually a number."""
    v = _clean(v)
    try:
        return v if v and float(v) > 0 else ""
    except ValueError:
        return ""


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
            private_key=_clean(os.getenv("THICKET_PRIVATE_KEY")),
            node_id=_clean(os.getenv("NODE_ID")) or "node-1",
            coordinator_url=_clean(os.getenv("COORDINATOR_URL")) or cls.coordinator_url,
            heartbeat_interval=int(_clean(os.getenv("HEARTBEAT_INTERVAL")) or 30),
            rpc_url=_clean(os.getenv("ROBINHOOD_RPC")) or cls.rpc_url,
            token_address=_clean(os.getenv("TOKEN_ADDRESS")) or cls.token_address,
            staking_address=_clean(os.getenv("STAKING_ADDRESS")) or cls.staking_address,
            bond_amount=_amount(os.getenv("BOND_AMOUNT")),
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
