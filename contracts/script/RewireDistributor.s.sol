// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardsDistributor} from "../src/RewardsDistributor.sol";

/// @notice Minimal rewire: deploy ONLY a new pool-based RewardsDistributor that
///         points at the EXISTING token, set its publisher, and fund the pool —
///         leaving the token, NodeStaking, and all existing bonds untouched.
///
/// Env:
///   PRIVATE_KEY          deployer/treasury key (must hold >= REWARDS_POOL THKT)
///   TOKEN_ADDRESS        existing THKT token (0xac2763…)
///   COORDINATOR_ADDRESS  publisher (defaults to deployer)
///   REWARDS_POOL         THKT to seed the pool (default 1,000,000)
///
///   forge script script/RewireDistributor.s.sol --rpc-url $ROBINHOOD_TESTNET_RPC --broadcast
contract RewireDistributor is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.addr(pk);
        IERC20 token = IERC20(vm.envAddress("TOKEN_ADDRESS"));
        address coordinator = vm.envOr("COORDINATOR_ADDRESS", treasury);
        uint256 pool = vm.envOr("REWARDS_POOL", uint256(1_000_000 ether));

        require(token.balanceOf(treasury) >= pool, "treasury balance < REWARDS_POOL");

        vm.startBroadcast(pk);
        RewardsDistributor dist = new RewardsDistributor(token, treasury);
        dist.setPublisher(coordinator);
        token.transfer(address(dist), pool); // seed the reward pool
        vm.stopBroadcast();

        console2.log("== new pool RewardsDistributor ==");
        console2.log("RewardsDistributor :", address(dist));
        console2.log("token (unchanged)  :", address(token));
        console2.log("publisher          :", coordinator);
        console2.log("pool funded        :", pool);
    }
}
