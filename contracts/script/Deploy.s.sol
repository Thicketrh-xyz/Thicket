// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ThicketToken} from "../src/ThicketToken.sol";
import {NodeStaking} from "../src/NodeStaking.sol";
import {RewardsDistributor} from "../src/RewardsDistributor.sol";

/// @notice Deploys the Thicket stack in the launchpad-compatible POOL model:
///   - a fixed-supply token (stand-in for the launchpad token)
///   - NodeStaking (operator bonds + delegation + slashing)
///   - RewardsDistributor funded with a reserved rewards allocation (the pool)
///
/// Env:
///   PRIVATE_KEY          deployer/treasury key (holds the full supply at launch)
///   COORDINATOR_ADDRESS  publisher + slasher (defaults to deployer)
///   TOTAL_SUPPLY         full fixed supply       (default 1,000,000,000 THKT)
///   REWARDS_POOL         pool's OPENING balance  (default    30,000,000 THKT)
///   MIN_OPERATOR_STAKE   node bond               (default         1,000 THKT)
///
/// REWARDS_POOL is what the pool starts with, not what it is meant to reach.
/// The stated target is 350,000,000 THKT, reached over time from compute
/// payments (automatic, on every job) and buybacks from the treasury (manual,
/// via fund()). Everything not sent to the distributor stays in the treasury,
/// so opening low and topping up is the intended shape — the old default
/// shipped the entire target on day one, which is a different promise.
///
///   forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_TESTNET_RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.addr(pk);

        uint256 totalSupply = vm.envOr("TOTAL_SUPPLY", uint256(1_000_000_000 ether));
        uint256 rewardsPool = vm.envOr("REWARDS_POOL", uint256(30_000_000 ether));
        uint256 minStake = vm.envOr("MIN_OPERATOR_STAKE", uint256(1_000 ether));
        address coordinator = vm.envOr("COORDINATOR_ADDRESS", treasury);

        require(rewardsPool <= totalSupply, "REWARDS_POOL > TOTAL_SUPPLY");

        vm.startBroadcast(pk);

        // Fixed supply minted once to treasury (mirrors the launchpad token).
        ThicketToken token = new ThicketToken(totalSupply, treasury);
        NodeStaking staking = new NodeStaking(token, minStake, treasury);
        RewardsDistributor dist = new RewardsDistributor(token, treasury);

        dist.setPublisher(coordinator);   // coordinator publishes reward roots
        staking.setSlasher(coordinator);  // coordinator slashes failed operators

        // Seed the rewards pool. This is an opening balance, not the target —
        // compute payments and buybacks top it up from here.
        token.transfer(address(dist), rewardsPool);

        vm.stopBroadcast();

        console2.log("== Thicket deployed (pool model) ==");
        console2.log("THKT token          :", address(token));
        console2.log("NodeStaking         :", address(staking));
        console2.log("RewardsDistributor  :", address(dist));
        console2.log("treasury            :", treasury);
        console2.log("coordinator (pub/sl):", coordinator);
        console2.log("totalSupply         :", totalSupply);
        console2.log("rewardsPool funded  :", rewardsPool);
        console2.log("minOperatorStake    :", minStake);
    }
}
