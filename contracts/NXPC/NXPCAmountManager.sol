// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { INXPCAmountManager } from "../Interfaces/INXPCAmountManager.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

/// @title NXPCAmountManager
/// @notice NXPCAmountManager contract is a contract that manages native NXPC tokens
contract NXPCAmountManager is INXPCAmountManager, ERC2771Context, NextOwnablePausable {
    /// @notice Maximum supply of NXPC
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    /// @notice Accumulated burned amount
    uint256 private _accumulatedBurnedAmount;

    /// @notice Accumulated minted amount
    uint256 private _accumulatedMintedAmount;

    /// @notice Status of burn allowlisted address
    mapping(address => bool) private _isBurnAllowlisted;

    /// @notice Status of mint allowlisted address
    mapping(address => bool) private _isMintAllowlisted;

    event NXPCBurned(address indexed from, uint256 amount);
    event NXPCMinted(address indexed from, uint256 amount);

    modifier onlyBurnAllowlisted() {
        require(isBurnAllowlisted(_msgSender()), "NXPCAmountManager/notAllowlisted: msg sender is not allowlisted");
        _;
    }

    modifier onlyMintAllowlisted() {
        require(isMintAllowlisted(_msgSender()), "NXPCAmountManager/notAllowlisted: msg sender is not allowlisted");
        _;
    }

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    /// @notice Updates operator's burn allowlisted status
    /// @param operator CA of operator, operator can call `addBurnedAmount` function
    /// @param allowlisted New status of operator
    function setBurnAllowlist(address operator, bool allowlisted) external onlyOwner {
        _isBurnAllowlisted[operator] = allowlisted;
    }

    /// @notice Updates operator's mint allowlisted status
    /// @param operator CA of operator, operator can call `addMintedAmount` function
    /// @param allowlisted New status of operator
    function setMintAllowlist(address operator, bool allowlisted) external onlyOwner {
        _isMintAllowlisted[operator] = allowlisted;
    }

    /// @notice Adds accumulated burned amount
    /// @param amount Adds `amount` NXPC to `_accumulatedBurnedAmount`
    function addBurnedAmount(uint256 amount) external whenNotPaused onlyBurnAllowlisted {
        _accumulatedBurnedAmount += amount;

        emit NXPCBurned(_msgSender(), amount);
    }

    /// @notice Adds accumulated minted amount
    /// @param amount Adds `amount` NXPC to `_accumulatedMintedAmount`
    function addMintedAmount(uint256 amount) external whenNotPaused onlyMintAllowlisted {
        require(
            _accumulatedBurnedAmount >= _accumulatedMintedAmount + amount,
            "NXPCAmountManager/invalidAmount: accumulated minted amount exceeds the burned amount"
        );

        _accumulatedMintedAmount += amount;

        emit NXPCMinted(_msgSender(), amount);
    }

    /// @notice Returns accumulated burned amount
    /// @return uint256
    function accumulatedBurnedAmount() external view returns (uint256) {
        return _accumulatedBurnedAmount;
    }

    /// @notice Returns accumulated minted amount
    /// @return uint256
    function accumulatedMintedAmount() external view returns (uint256) {
        return _accumulatedMintedAmount;
    }

    /// @notice Returns true if `operator` is burn allowlisted
    /// @param operator CA of operator
    /// @return bool
    function isBurnAllowlisted(address operator) public view returns (bool) {
        return _isBurnAllowlisted[operator];
    }

    /// @notice Returns true if `operator` is mint allowlisted
    /// @param operator CA of operator
    /// @return bool
    function isMintAllowlisted(address operator) public view returns (bool) {
        return _isMintAllowlisted[operator];
    }

    /// @notice Get the current total supply of NXPC
    /// @return uint256
    function totalSupply() public view returns (uint256) {
        return MAX_SUPPLY + _accumulatedMintedAmount - _accumulatedBurnedAmount;
    }

    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
