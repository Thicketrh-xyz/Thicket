// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Thicket network token (THKT)
/// @notice Reward token for the Thicket decentralized GPU network.
///         Node operators earn THKT for contributed compute; delegators
///         earn by staking to operators. Emission is minted to the
///         RewardsDistributor by the owner (a timelock/multisig in prod).
contract ThicketToken is ERC20, ERC20Burnable, Ownable {
    /// @notice Hard cap on total supply. Emission cannot exceed this.
    uint256 public immutable maxSupply;

    /// @notice Address allowed to mint emission rewards (the distributor).
    address public minter;

    event MinterUpdated(address indexed minter);

    error CapExceeded();
    error NotMinter();

    constructor(uint256 initialSupply, uint256 maxSupply_, address owner_)
        ERC20("Thicket", "THKT")
        Ownable(owner_)
    {
        require(maxSupply_ >= initialSupply, "cap < initial");
        maxSupply = maxSupply_;
        _mint(owner_, initialSupply); // treasury / liquidity / ecosystem
    }

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
        emit MinterUpdated(minter_);
    }

    /// @notice Mint emission rewards. Only the distributor may call.
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (totalSupply() + amount > maxSupply) revert CapExceeded();
        _mint(to, amount);
    }
}
