// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { SourceBridge } from "../Bridge/SourceChain/SourceBridge.sol";

contract MockSourceBridge is SourceBridge {
    constructor(
        address trustedForwarder,
        address teleporterRegistryAddress,
        address teleporterManager
    ) SourceBridge(trustedForwarder, teleporterRegistryAddress, teleporterManager) {}

    function receiveMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes memory message
    ) external nonReentrant {
        _receiveTeleporterMessage(sourceBlockchainID, originSenderAddress, message);
    }

    function encodeCreateBridgeTokenData(
        address originContractAddress,
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals
    ) external view returns (bytes memory) {
        return _encodeCreateBridgeTokenData(originContractAddress, tokenName, tokenSymbol, tokenDecimals);
    }

    function encodeCreateBridgeERC721Data(
        address originContractAddress,
        string memory tokenName,
        string memory tokenSymbol,
        string memory uri_
    ) external view returns (bytes memory) {
        return _encodeCreateBridgeERC721Data(originContractAddress, tokenName, tokenSymbol, uri_);
    }

    function encodeCreateBridgeERC1155Data(
        address originContractAddress,
        string memory uri_
    ) external view returns (bytes memory) {
        return _encodeCreateBridgeERC1155Data(originContractAddress, uri_);
    }

    function encodeMintWrappedTokenData(
        address originContractAddress,
        address recipient,
        uint256 bridgeAmount
    ) external view returns (bytes memory) {
        return _encodeMintWrappedTokenData(originContractAddress, recipient, bridgeAmount);
    }

    function encodeMintERC721Data(
        address originContractAddress,
        address recipient,
        uint256[] memory tokenIds
    ) external view returns (bytes memory) {
        return _encodeMintERC721Data(originContractAddress, recipient, tokenIds);
    }

    function encodeMintERC1155Data(
        address originContractAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory bridgeAmounts
    ) external view returns (bytes memory) {
        return _encodeMintERC1155Data(originContractAddress, recipient, tokenIds, bridgeAmounts);
    }
}
