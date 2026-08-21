// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ThicketToken} from "../src/ThicketToken.sol";
import {NodeStaking} from "../src/NodeStaking.sol";
import {RewardsDistributor} from "../src/RewardsDistributor.sol";

contract ThicketTest is Test {
    ThicketToken token;
    NodeStaking staking;
    RewardsDistributor dist;

    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        vm.startPrank(owner);
        token = new ThicketToken(1_000_000_000 ether, owner); // fixed supply to treasury
        staking = new NodeStaking(token, 1_000e18, owner);
        dist = new RewardsDistributor(token, owner);
        staking.setSlasher(owner);          // coordinator would be the slasher in prod
        dist.setPublisher(owner);
        token.transfer(address(dist), 1_000_000 ether); // fund the rewards pool
        token.transfer(operator, 10_000e18);
        vm.stopPrank();
    }

    function test_fixedSupplyNoMint() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether); // supply is fixed
    }

    function test_poolFunded() public view {
        assertEq(dist.poolBalance(), 1_000_000 ether);
    }

    function test_registerOperator() public {
        vm.startPrank(operator);
        token.approve(address(staking), 1_000e18);
        staking.registerOperator(keccak256("node-1"), 1_000e18);
        vm.stopPrank();
        (bool registered,,,) = staking.operators(operator);
        assertTrue(registered);
    }

    function test_registerBelowMinReverts() public {
        vm.startPrank(operator);
        token.approve(address(staking), 500e18);
        vm.expectRevert(NodeStaking.BelowMinStake.selector);
        staking.registerOperator(keccak256("node-1"), 500e18);
        vm.stopPrank();
    }

    function test_slashDropsRegistration() public {
        vm.startPrank(operator);
        token.approve(address(staking), 1_000e18);
        staking.registerOperator(keccak256("node-1"), 1_000e18);
        vm.stopPrank();

        vm.prank(owner);
        staking.slash(operator, 600e18, "missed challenges");

        (bool registered, uint256 selfStake,,) = staking.operators(operator);
        assertFalse(registered);
        assertEq(selfStake, 400e18);
    }

    function test_merkleClaimFromPool() public {
        // Single-leaf tree => root == leaf, empty proof.
        uint256 amount = 42e18;
        bytes32 leaf = keccak256(abi.encodePacked(operator, amount));
        vm.prank(owner);
        dist.publishRoot(leaf);

        uint256 before = token.balanceOf(operator);
        uint256 poolBefore = dist.poolBalance();

        bytes32[] memory proof = new bytes32[](0);
        dist.claim(operator, amount, proof);

        assertEq(token.balanceOf(operator) - before, amount); // paid from pool
        assertEq(poolBefore - dist.poolBalance(), amount);     // pool drained by payout

        // Re-claim same cumulative => nothing to claim.
        vm.expectRevert(RewardsDistributor.NothingToClaim.selector);
        dist.claim(operator, amount, proof);
    }

    function test_claimRevertsWhenPoolEmpty() public {
        // Drain the pool, then a valid claim should revert PoolExhausted.
        uint256 poolBal = dist.poolBalance();
        vm.prank(owner);
        dist.recover(owner, poolBal);

        uint256 amount = 1e18;
        bytes32 leaf = keccak256(abi.encodePacked(operator, amount));
        vm.prank(owner);
        dist.publishRoot(leaf);

        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert(abi.encodeWithSelector(RewardsDistributor.PoolExhausted.selector, amount, 0));
        dist.claim(operator, amount, proof);
    }
}
