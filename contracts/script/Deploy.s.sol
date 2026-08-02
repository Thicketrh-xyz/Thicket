// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ThicketToken} from "../src/ThicketToken.sol";
import {NodeStaking} from "../src/NodeStaking.sol";
import {RewardsDistributor, IThicketToken} from "../src/RewardsDistributor.sol";

/// @notice Deploys the Thicket stack and wires it together in one broadcast.
///
/// Env:
///   PRIVATE_KEY          deployer/owner key (funded with testnet ETH)
///   COORDINATOR_ADDRESS  publisher + slasher (defaults to deployer)
///   INITIAL_SUPPLY       treasury mint (default 10,000,000 THKT)
///   MAX_SUPPLY           emission cap    (default 100,000,000 THKT)
///   MIN_OPERATOR_STAKE   node bond       (default 1,000 THKT)
///
/// Run (Robinhood Chain testnet):
///   forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_TESTNET_RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);

        uint256 initialSupply = vm.envOr("INITIAL_SUPPLY", uint256(10_000_000 ether));
        uint256 maxSupply = vm.envOr("MAX_SUPPLY", uint256(100_000_000 ether));
        uint256 minStake = vm.envOr("MIN_OPERATOR_STAKE", uint256(1_000 ether));
        address coordinator = vm.envOr("COORDINATOR_ADDRESS", owner);

        require(maxSupply >= initialSupply, "MAX_SUPPLY < INITIAL_SUPPLY");

        vm.startBroadcast(pk);

        ThicketToken token = new ThicketToken(initialSupply, maxSupply, owner);
        NodeStaking staking = new NodeStaking(token, minStake, owner);
        RewardsDistributor dist = new RewardsDistributor(IThicketToken(address(token)), owner);

        // Wire roles:
        token.setMinter(address(dist));   // only the distributor can mint emission
        dist.setPublisher(coordinator);   // coordinator publishes reward roots
        staking.setSlasher(coordinator);  // coordinator slashes failed operators

        vm.stopBroadcast();

        console2.log("== Thicket deployed ==");
        console2.log("THKT token          :", address(token));
        console2.log("NodeStaking         :", address(staking));
        console2.log("RewardsDistributor  :", address(dist));
        console2.log("owner               :", owner);
        console2.log("coordinator (pub/sl):", coordinator);
        console2.log("initialSupply       :", initialSupply);
        console2.log("maxSupply           :", maxSupply);
        console2.log("minOperatorStake    :", minStake);
    }
}
