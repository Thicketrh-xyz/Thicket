// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ThicketToken} from "../src/ThicketToken.sol";
import {NodeStaking} from "../src/NodeStaking.sol";
import {RewardsDistributor, IThicketToken} from "../src/RewardsDistributor.sol";

contract ThicketTest is Test {
    ThicketToken token;
    NodeStaking staking;
    RewardsDistributor dist;

    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    address delegator = address(0xCA11);

    function setUp() public {
        vm.startPrank(owner);
        token = new ThicketToken(1_000_000e18, 100_000_000e18, owner);
        staking = new NodeStaking(token, 1_000e18, owner);
        dist = new RewardsDistributor(IThicketToken(address(token)), owner);
        token.setMinter(address(dist));
        staking.setSlasher(owner); // coordinator would be the slasher in prod
        token.transfer(operator, 10_000e18);
        vm.stopPrank();
    }

    function test_registerOperator() public {
        vm.startPrank(operator);
        token.approve(address(staking), 1_000e18);
        staking.registerOperator(keccak256("node-1"), 1_000e18);
        vm.stopPrank();
        (bool registered,,, ) = _op(operator);
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

        (bool registered, uint256 selfStake,,) = _op(operator);
        assertFalse(registered); // fell below min bond
        assertEq(selfStake, 400e18);
    }

    function test_merkleClaim() public {
        // Leaf = keccak256(abi.encodePacked(account, cumulativeAmount)).
        // Single-leaf tree => root == leaf, empty proof.
        uint256 amount = 42e18;
        bytes32 leaf = keccak256(abi.encodePacked(operator, amount));
        vm.prank(owner);
        dist.setPublisher(owner);
        vm.prank(owner);
        dist.publishRoot(leaf);

        bytes32[] memory proof = new bytes32[](0);
        dist.claim(operator, amount, proof);
        assertEq(token.balanceOf(operator) - 10_000e18, amount);

        // Re-claim same cumulative => nothing to claim.
        vm.expectRevert(RewardsDistributor.NothingToClaim.selector);
        dist.claim(operator, amount, proof);
    }

    function _op(address a) internal view returns (bool, uint256, uint256, bytes32) {
        return staking.operators(a);
    }
}
