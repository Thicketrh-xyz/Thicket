// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title NodeStaking
/// @notice Skin-in-the-game for node operators + delegated staking.
///         An operator must bond `minOperatorStake` to register a node.
///         Delegators can stake to an operator to share rewards without
///         running hardware. The coordinator (slasher) can slash an
///         operator's bond for provable misbehavior (failed challenges).
///
/// @dev Reward *accounting* lives off-chain in the coordinator and is paid
///      via RewardsDistributor (Merkle claims). This contract governs the
///      bond/stake and the anti-sybil slashing only.
contract NodeStaking is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    /// @notice Minimum bond required to register as an operator.
    uint256 public minOperatorStake;

    /// @notice Cooldown before withdrawn stake is claimable (anti-hit-and-run).
    uint256 public unbondingPeriod = 7 days;

    /// @notice Address permitted to slash (the coordinator / a governance module).
    address public slasher;

    struct Operator {
        bool registered;
        uint256 selfStake;      // operator's own bond
        uint256 delegatedStake; // total delegated to this operator
        bytes32 nodeId;         // off-chain node identity (pubkey hash)
    }

    struct Unbond {
        uint256 amount;
        uint256 unlockAt;
    }

    mapping(address => Operator) public operators;
    // delegator => operator => amount
    mapping(address => mapping(address => uint256)) public delegations;
    // account => queued unbonding withdrawals
    mapping(address => Unbond[]) public unbonds;

    event OperatorRegistered(address indexed operator, bytes32 nodeId, uint256 stake);
    event Delegated(address indexed delegator, address indexed operator, uint256 amount);
    event UnbondQueued(address indexed account, uint256 amount, uint256 unlockAt);
    event Withdrawn(address indexed account, uint256 amount);
    event Slashed(address indexed operator, uint256 amount, string reason);
    event SlasherUpdated(address indexed slasher);

    error NotSlasher();
    error AlreadyRegistered();
    error NotRegistered();
    error BelowMinStake();
    error NothingToWithdraw();

    modifier onlySlasher() {
        if (msg.sender != slasher) revert NotSlasher();
        _;
    }

    constructor(IERC20 token_, uint256 minOperatorStake_, address owner_) Ownable(owner_) {
        token = token_;
        minOperatorStake = minOperatorStake_;
    }

    // --- admin ---
    function setSlasher(address slasher_) external onlyOwner {
        slasher = slasher_;
        emit SlasherUpdated(slasher_);
    }

    function setMinOperatorStake(uint256 v) external onlyOwner {
        minOperatorStake = v;
    }

    function setUnbondingPeriod(uint256 v) external onlyOwner {
        unbondingPeriod = v;
    }

    // --- operator ---
    function registerOperator(bytes32 nodeId, uint256 amount) external {
        if (operators[msg.sender].registered) revert AlreadyRegistered();
        if (amount < minOperatorStake) revert BelowMinStake();
        token.safeTransferFrom(msg.sender, address(this), amount);
        operators[msg.sender] =
            Operator({registered: true, selfStake: amount, delegatedStake: 0, nodeId: nodeId});
        emit OperatorRegistered(msg.sender, nodeId, amount);
    }

    // --- delegator ---
    function delegate(address operator, uint256 amount) external {
        if (!operators[operator].registered) revert NotRegistered();
        token.safeTransferFrom(msg.sender, address(this), amount);
        delegations[msg.sender][operator] += amount;
        operators[operator].delegatedStake += amount;
        emit Delegated(msg.sender, operator, amount);
    }

    /// @notice Queue an operator self-stake or delegation for unbonding.
    function unbondSelf(uint256 amount) external {
        Operator storage op = operators[msg.sender];
        require(op.selfStake >= amount, "exceeds stake");
        op.selfStake -= amount;
        if (op.selfStake < minOperatorStake) op.registered = false; // fell below bond
        _queueUnbond(msg.sender, amount);
    }

    function unbondDelegation(address operator, uint256 amount) external {
        require(delegations[msg.sender][operator] >= amount, "exceeds delegation");
        delegations[msg.sender][operator] -= amount;
        operators[operator].delegatedStake -= amount;
        _queueUnbond(msg.sender, amount);
    }

    function _queueUnbond(address account, uint256 amount) internal {
        uint256 unlockAt = block.timestamp + unbondingPeriod;
        unbonds[account].push(Unbond({amount: amount, unlockAt: unlockAt}));
        emit UnbondQueued(account, amount, unlockAt);
    }

    /// @notice Withdraw all matured unbonding entries.
    function withdraw() external {
        Unbond[] storage queue = unbonds[msg.sender];
        uint256 total;
        uint256 i = 0;
        while (i < queue.length) {
            if (queue[i].unlockAt <= block.timestamp) {
                total += queue[i].amount;
                queue[i] = queue[queue.length - 1];
                queue.pop();
            } else {
                i++;
            }
        }
        if (total == 0) revert NothingToWithdraw();
        token.safeTransfer(msg.sender, total);
        emit Withdrawn(msg.sender, total);
    }

    // --- slashing (anti-sybil enforcement) ---
    /// @notice Slash an operator's self-stake. Slashed tokens are sent to the
    ///         owner (treasury) — could be burned or redistributed instead.
    function slash(address operator, uint256 amount, string calldata reason) external onlySlasher {
        Operator storage op = operators[operator];
        uint256 slashAmt = amount > op.selfStake ? op.selfStake : amount;
        op.selfStake -= slashAmt;
        if (op.selfStake < minOperatorStake) op.registered = false;
        token.safeTransfer(owner(), slashAmt);
        emit Slashed(operator, slashAmt, reason);
    }
}
