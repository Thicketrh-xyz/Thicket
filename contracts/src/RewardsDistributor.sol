// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IThicketToken {
    function mint(address to, uint256 amount) external;
}

/// @title RewardsDistributor
/// @notice Pays per-epoch compute rewards via Merkle claims.
///
/// Why Merkle-per-epoch: rewards accrue per-minute off-chain in the
/// coordinator. Paying gas every minute is impossible, so each epoch the
/// coordinator computes the *cumulative* THKT owed to every wallet, builds
/// a Merkle tree of (account, cumulativeAmount), and publishes only the
/// root on-chain. Users claim the delta since their last claim in one tx.
///
/// Leaf = keccak256(abi.encodePacked(account, cumulativeAmount)).
contract RewardsDistributor is Ownable {
    IThicketToken public immutable token;

    /// @notice Current epoch index.
    uint256 public epoch;

    /// @notice Merkle root of cumulative rewards for the active epoch.
    bytes32 public merkleRoot;

    /// @notice Total THKT each account has already claimed (cumulative).
    mapping(address => uint256) public claimed;

    /// @notice Address allowed to publish new roots (the coordinator signer).
    address public publisher;

    event RootPublished(uint256 indexed epoch, bytes32 root);
    event Claimed(address indexed account, uint256 amount, uint256 cumulative);
    event PublisherUpdated(address indexed publisher);

    error NotPublisher();
    error InvalidProof();
    error NothingToClaim();

    constructor(IThicketToken token_, address owner_) Ownable(owner_) {
        token = token_;
    }

    function setPublisher(address publisher_) external onlyOwner {
        publisher = publisher_;
        emit PublisherUpdated(publisher_);
    }

    /// @notice Publish the cumulative-rewards root for the next epoch.
    function publishRoot(bytes32 root) external {
        if (msg.sender != publisher) revert NotPublisher();
        merkleRoot = root;
        epoch += 1;
        emit RootPublished(epoch, root);
    }

    /// @notice Claim all rewards accrued up to `cumulativeAmount`.
    /// @param cumulativeAmount Total THKT ever owed to `account` (the leaf value).
    /// @param proof Merkle proof against the current root.
    function claim(address account, uint256 cumulativeAmount, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(abi.encodePacked(account, cumulativeAmount));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        uint256 already = claimed[account];
        if (cumulativeAmount <= already) revert NothingToClaim();

        uint256 payout = cumulativeAmount - already;
        claimed[account] = cumulativeAmount;
        token.mint(account, payout); // emission minted on claim, capped by token
        emit Claimed(account, payout, cumulativeAmount);
    }
}
