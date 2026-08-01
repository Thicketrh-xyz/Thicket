"""
EIP-191 (personal_sign) message signing/verification shared by node + coordinator.

Nodes prove control of their operator address by signing a canonical message.
The coordinator recovers the signer and checks it matches the claimed address
and that the timestamp is fresh (anti-replay).
"""
from __future__ import annotations

import time

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import to_checksum_address

MAX_SKEW_S = 120  # reject signatures whose timestamp is older/newer than this


def register_message(address: str, node_id: str) -> str:
    return f"thicket-register:{to_checksum_address(address)}:{node_id}"


def heartbeat_message(address: str, timestamp: int) -> str:
    return f"thicket-heartbeat:{to_checksum_address(address)}:{timestamp}"


def sign(message: str, private_key: str) -> str:
    signed = Account.sign_message(encode_defunct(text=message), private_key=private_key)
    return signed.signature.hex()


def recover(message: str, signature: str) -> str:
    return to_checksum_address(Account.recover_message(encode_defunct(text=message), signature=signature))


def verify(message: str, signature: str, expected_address: str) -> bool:
    try:
        return recover(message, signature) == to_checksum_address(expected_address)
    except Exception:  # noqa: BLE001 — any recovery failure => invalid
        return False


def fresh(timestamp: int) -> bool:
    return abs(int(time.time()) - int(timestamp)) <= MAX_SKEW_S
