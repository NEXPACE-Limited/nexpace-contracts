// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

/// @title ERC1155Probability - A contract to store the probability of generating ERC1155 tokens
/// @dev This contract stores the weight of ERC1155 tokens each and the total weight of ERC1155 tokens.
contract ERC1155Probability is ERC2771Context, NextOwnablePausable {
    struct WeightInfo {
        uint256 tokenId;
        uint256 weight;
        uint24 universe;
    }
    mapping(IERC1155 => mapping(uint256 => uint256)) private _weight;
    mapping(IERC1155 => uint256) private _totalWeight;

    event WeightUpdated(
        IERC1155 indexed token,
        uint256 indexed tokenId,
        uint256 prevWeight,
        uint256 newWeight,
        uint256 totalWeight,
        uint24 indexed universe
    );

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    /// @notice Batch function of {setWeight}
    function setBatchWeight(IERC1155 token, WeightInfo[] memory newWeightInfo) external whenExecutable {
        uint256 newWeightInfoLength = newWeightInfo.length;
        for (uint256 i; i < newWeightInfoLength; ) {
            _setWeight(token, newWeightInfo[i].tokenId, newWeightInfo[i].weight, newWeightInfo[i].universe);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Set the weight of an ERC1155 token
    /// @param token The ERC1155 token contract address
    /// @param tokenId The ID of the token to set the weight for
    /// @param newWeight The new weight to set for the token
    /// @param universe The universe identifier where the token's weight is being set
    function setWeight(IERC1155 token, uint256 tokenId, uint256 newWeight, uint24 universe) external whenExecutable {
        _setWeight(token, tokenId, newWeight, universe);
    }

    /// @notice Get the weight of an ERC1155 token
    /// @param token The ERC1155 token contract address
    /// @param tokenId The ID of the token to retrieve the weight for
    /// @return uint256 The weight of the specified ERC1155 token
    function weight(IERC1155 token, uint256 tokenId) external view returns (uint256) {
        return _weight[token][tokenId];
    }

    /// @notice Get the total weight of an ERC1155 token
    /// @param token The ERC1155 token contract address
    /// @return uint256 The total weight of the specified ERC1155 token
    function totalWeight(IERC1155 token) external view returns (uint256) {
        return _totalWeight[token];
    }

    /// @notice Set the weight of an ERC1155 token
    function _setWeight(IERC1155 token, uint256 tokenId, uint256 newWeight, uint24 universe) internal {
        uint256 prevWeight = _weight[token][tokenId];
        _weight[token][tokenId] = newWeight;
        _totalWeight[token] = _totalWeight[token] - prevWeight + newWeight;

        emit WeightUpdated(token, tokenId, prevWeight, newWeight, _totalWeight[token], universe);
    }

    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
