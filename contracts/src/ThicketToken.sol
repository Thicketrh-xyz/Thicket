// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title Thicket token (THKT) — fixed-supply stand-in for the launchpad token.
/// @notice On mainnet, THKT is created by an EVM launchpad: a fixed supply (e.g.
///         1B), fully minted at launch, with NO mint function anyone controls.
///         This testnet token mirrors that exactly — the entire supply is minted
///         once at deployment to the treasury, and there is no way to mint more.
///         Miner rewards are therefore paid from a pre-funded pool (see
///         RewardsDistributor), never by minting new supply.
contract ThicketToken is ERC20, ERC20Burnable {
    constructor(uint256 totalSupply_, address treasury) ERC20("Thicket", "THKT") {
        _mint(treasury, totalSupply_); // entire fixed supply to the treasury at launch
    }
}
