"""
OpenZeppelin-compatible Merkle tree for THKT reward claims.

Leaf encoding MUST match RewardsDistributor.claim():
    leaf = keccak256(abi.encodePacked(address account, uint256 cumulativeAmount))

Parent hashing matches OZ MerkleProof._hashPair: commutative — the two
32-byte children are sorted ascending, concatenated, then keccak256'd. This
is the same convention as merkletreejs({ sortPairs: true }), so proofs
generated here verify on-chain with OZ MerkleProof.verify().
"""
from __future__ import annotations

from eth_utils import keccak, to_bytes, to_checksum_address


def leaf_hash(address: str, cumulative_amount: int) -> bytes:
    """keccak256(abi.encodePacked(address, uint256))."""
    addr_bytes = to_bytes(hexstr=to_checksum_address(address))  # 20 bytes
    amt_bytes = cumulative_amount.to_bytes(32, "big")            # uint256
    return keccak(addr_bytes + amt_bytes)


def _hash_pair(a: bytes, b: bytes) -> bytes:
    """Commutative parent hash — sort the pair, then keccak (OZ _hashPair)."""
    return keccak(a + b) if a <= b else keccak(b + a)


class MerkleTree:
    """Builds a tree over (address, cumulativeAmount) leaves and yields proofs."""

    def __init__(self, entries: list[tuple[str, int]]):
        # Deduplicate by address (last write wins) and drop zero amounts.
        cleaned: dict[str, int] = {}
        for addr, amt in entries:
            if amt > 0:
                cleaned[to_checksum_address(addr)] = amt
        self.entries = sorted(cleaned.items())  # stable ordering
        self.leaves = [leaf_hash(a, v) for a, v in self.entries]
        self._layers = self._build(self.leaves) if self.leaves else [[]]

    @staticmethod
    def _build(leaves: list[bytes]) -> list[list[bytes]]:
        layers = [leaves]
        while len(layers[-1]) > 1:
            prev = layers[-1]
            nxt: list[bytes] = []
            for i in range(0, len(prev), 2):
                if i + 1 < len(prev):
                    nxt.append(_hash_pair(prev[i], prev[i + 1]))
                else:
                    nxt.append(prev[i])  # odd node promoted unchanged
            layers.append(nxt)
        return layers

    @property
    def root(self) -> bytes:
        if not self.leaves:
            return b"\x00" * 32
        return self._layers[-1][0]

    def root_hex(self) -> str:
        return "0x" + self.root.hex()

    def proof(self, address: str) -> list[str]:
        """Merkle proof (as 0x-hex siblings) for the given account's leaf."""
        target = leaf_hash(address, dict(self.entries)[to_checksum_address(address)])
        idx = self.leaves.index(target)
        proof: list[str] = []
        for layer in self._layers[:-1]:
            sibling = idx ^ 1
            if sibling < len(layer):
                proof.append("0x" + layer[sibling].hex())
            idx //= 2
        return proof

    def claims(self) -> dict[str, dict]:
        """Full claim table: address -> {amount, proof}. Feeds the client UI."""
        return {
            addr: {"cumulativeAmount": str(amt), "proof": self.proof(addr)}
            for addr, amt in self.entries
        }
