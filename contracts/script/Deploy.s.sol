// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
///   TOKEN_ADDRESS        EXISTING THKT to use    (unset = deploy a new token)
///   TOTAL_SUPPLY         full fixed supply       (only when minting a new one)
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

        // TOKEN_ADDRESS set  -> use that token, deploy nothing new.
        // TOKEN_ADDRESS unset -> mint a fresh fixed-supply token.
        //
        // The token in this repo is a stand-in. If THKT is issued anywhere else
        // — a launchpad, an earlier deploy — pass its address, or this script
        // creates a SECOND token with the same name and wires staking and
        // rewards to the one nobody holds.
        address existingToken = vm.envOr("TOKEN_ADDRESS", address(0));

        if (existingToken == address(0)) {
            require(rewardsPool <= totalSupply, "REWARDS_POOL > TOTAL_SUPPLY");
        } else {
            // Can't mint what we don't control: the treasury has to already hold
            // enough of the real token to seed the pool.
            uint256 held = IERC20(existingToken).balanceOf(treasury);
            require(held >= rewardsPool, "treasury holds less THKT than REWARDS_POOL");
        }

        vm.startBroadcast(pk);

        IERC20 token = existingToken == address(0)
            ? IERC20(address(new ThicketToken(totalSupply, treasury)))
            : IERC20(existingToken);

        NodeStaking staking = new NodeStaking(token, minStake, treasury);
        RewardsDistributor dist = new RewardsDistributor(token, treasury);

        dist.setPublisher(coordinator);   // coordinator publishes reward roots
        staking.setSlasher(coordinator);  // coordinator slashes failed operators

        // Seed the rewards pool. This is an opening balance, not the target —
        // compute payments and buybacks top it up from here.
        token.transfer(address(dist), rewardsPool);

        vm.stopBroadcast();

        console2.log("== Thicket deployed (pool model) ==");
        console2.log(existingToken == address(0)
            ? "THKT token          : NEWLY DEPLOYED"
            : "THKT token          : existing, reused");
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
