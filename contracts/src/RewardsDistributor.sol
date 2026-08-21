// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RewardsDistributor
/// @notice Pays per-epoch compute rewards from a PRE-FUNDED pool of THKT — no
///         minting. This matches a launchpad token (fixed supply, no mint):
///         rewards come from real tokens the project reserves, and are topped up
///         over time by compute revenue. Fund the pool by sending THKT to this
///         contract; when it runs dry, claims revert until it's refilled.
///
/// Reward accounting is off-chain (the coordinator); each epoch it publishes the
/// cumulative-rewards Merkle root here, and users claim the delta since their
/// last claim in one tx.
///
/// Leaf = keccak256(abi.encodePacked(account, cumulativeAmount)).
contract RewardsDistributor is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

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
    event PoolFunded(address indexed from, uint256 amount);

    error NotPublisher();
    error InvalidProof();
    error NothingToClaim();
    error PoolExhausted(uint256 needed, uint256 available);

    constructor(IERC20 token_, address owner_) Ownable(owner_) {
        token = token_;
    }

    function setPublisher(address publisher_) external onlyOwner {
        publisher = publisher_;
        emit PublisherUpdated(publisher_);
    }

    /// @notice THKT currently available to pay rewards (this contract's balance).
    function poolBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Optional helper to fund the pool (or just transfer THKT here directly).
    function fund(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolFunded(msg.sender, amount);
    }

    /// @notice Publish the cumulative-rewards root for the next epoch.
    function publishRoot(bytes32 root) external {
        if (msg.sender != publisher) revert NotPublisher();
        merkleRoot = root;
        epoch += 1;
        emit RootPublished(epoch, root);
    }

    /// @notice Claim all rewards accrued up to `cumulativeAmount`, paid from the pool.
    function claim(address account, uint256 cumulativeAmount, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(abi.encodePacked(account, cumulativeAmount));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();

        uint256 already = claimed[account];
        if (cumulativeAmount <= already) revert NothingToClaim();

        uint256 payout = cumulativeAmount - already;
        uint256 available = token.balanceOf(address(this));
        if (available < payout) revert PoolExhausted(payout, available);

        claimed[account] = cumulativeAmount;
        token.safeTransfer(account, payout); // paid from the pool, not minted
        emit Claimed(account, payout, cumulativeAmount);
    }

    /// @notice Owner can recover pool THKT (wind-down or migration).
    function recover(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
