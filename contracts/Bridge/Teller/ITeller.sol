// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface ITeller {
    struct BridgeTokensRequest {
        bytes32 destinationBlockchainID;
        address destinationBridgeAddress;
        address sourceTokenAddress;
        address sender;
        address recipient;
        uint256 amount;
        address commissionTo;
        uint256 commissionAmount;
        uint256 deadline;
        uint256 salt;
    }
    struct BridgeERC721Request {
        bytes32 destinationBlockchainID;
        address destinationBridgeAddress;
        address sourceTokenAddress;
        address sender;
        address recipient;
        uint256[] tokenIds;
        address commissionTo;
        uint256 commissionAmount;
        uint256 deadline;
        uint256 salt;
    }
    struct BridgeERC1155Request {
        bytes32 destinationBlockchainID;
        address destinationBridgeAddress;
        address sourceTokenAddress;
        address sender;
        address recipient;
        uint256[] tokenIds;
        uint256[] amounts;
        address commissionTo;
        uint256 commissionAmount;
        uint256 deadline;
        uint256 salt;
    }

    /* solhint-enable */
    event SetNewRequestSigner(address previousRequestSigner, address indexed newRequestSigner);
    event SetNewNeso(address previousNeso, address indexed newNeso);
}
