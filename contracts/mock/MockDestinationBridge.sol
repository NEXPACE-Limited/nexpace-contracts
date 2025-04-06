// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC20BridgeToken } from "../Bridge/DestinationChain/Interfaces/IERC20BridgeToken.sol";
import { IERC721BridgeToken } from "../Bridge/DestinationChain/Interfaces/IERC721BridgeToken.sol";
import { IERC1155BridgeToken } from "../Bridge/DestinationChain/Interfaces/IERC1155BridgeToken.sol";
import { DestinationBridge } from "../Bridge/DestinationChain/DestinationBridge.sol";

contract MockDestinationBridge is DestinationBridge {
    constructor(
        address trustedForwarder,
        address teleporterRegistryAddress,
        address teleporterManager,
        address initOwner_,
        IERC20BridgeToken erc20BridgeTokenImpl_,
        IERC721BridgeToken erc721BridgeTokenImpl_,
        IERC1155BridgeToken erc1155BridgeTokenImpl_
    )
        DestinationBridge(
            trustedForwarder,
            teleporterRegistryAddress,
            teleporterManager,
            initOwner_,
            erc20BridgeTokenImpl_,
            erc721BridgeTokenImpl_,
            erc1155BridgeTokenImpl_
        )
    {}

    function receiveMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes memory message
    ) external nonReentrant {
        _receiveTeleporterMessage(sourceBlockchainID, originSenderAddress, message);
    }

    function encodeUnlockOriginTokensData(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address originTokenAddress,
        address recipient,
        uint256 amount
    ) external view returns (bytes memory) {
        return
            _encodeUnlockOriginTokensData(
                destinationBlockchainID,
                destinationBridgeAddress,
                originTokenAddress,
                recipient,
                amount
            );
    }

    function encodeUnlockERC721Data(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address originTokenAddress,
        address recipient,
        uint256[] memory tokenIds
    ) external view returns (bytes memory) {
        return
            _encodeUnlockERC721Data(
                destinationBlockchainID,
                destinationBridgeAddress,
                originTokenAddress,
                recipient,
                tokenIds
            );
    }

    function encodeUnlockERC1155Data(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address originTokenAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) external view returns (bytes memory) {
        return
            _encodeUnlockERC1155Data(
                destinationBlockchainID,
                destinationBridgeAddress,
                originTokenAddress,
                recipient,
                tokenIds,
                amounts
            );
    }
}
