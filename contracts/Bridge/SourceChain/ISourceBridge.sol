// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface ISourceBridge {
    enum BridgeAction {
        TokenCreate,
        ERC721Create,
        ERC1155Create,
        MintTokens,
        MintERC721,
        MintERC1155,
        UnlockTokens,
        UnlockERC721,
        UnlockERC1155
    }
    struct RequestBridgeTokenInfo {
        bytes32 destinationBlockchainID;
        address destinationBridgeAddress;
        address sourceTokenAddress;
        address sender;
        address recipient;
        uint256 amount;
    }
    struct RequestBridgeERC721Info {
        bytes32 destinationBlockchainID;
        address destinationBridgeAddress;
        address sourceTokenAddress;
        address sender;
        address recipient;
        uint256[] tokenIds;
    }
    struct RequestBridgeERC1155Info {
        bytes32 destinationBlockchainID;
        address destinationBridgeAddress;
        address sourceTokenAddress;
        address sender;
        address recipient;
        uint256[] tokenIds;
        uint256[] amounts;
    }
    struct SourceTokenInfo {
        address sourceTokenAddress;
        uint8 tokenType;
        string defaultBaseURI;
    }
    event BridgeTokens(
        address indexed sourceTokenAddress,
        bytes32 indexed destinationBlockchainID,
        bytes32 indexed teleporterMessageID,
        address destinationBridgeAddress,
        address sender,
        address recipient,
        uint256 amount
    );
    event BridgeERC721(
        address indexed sourceTokenAddress,
        bytes32 indexed destinationBlockchainID,
        bytes32 indexed teleporterMessageID,
        address destinationBridgeAddress,
        address sender,
        address recipient,
        uint256[] tokenIds
    );
    event BridgeERC1155(
        address indexed sourceTokenAddress,
        bytes32 indexed destinationBlockchainID,
        bytes32 indexed teleporterMessageID,
        address destinationBridgeAddress,
        address sender,
        address recipient,
        uint256[] tokenIds,
        uint256[] amounts
    );
    event SubmitCreateBridgeToken(
        bytes32 indexed destinationBlockchainID,
        address indexed destinationBridgeAddress,
        address indexed sourceTokenAddress,
        uint8 tokenType,
        bytes32 teleporterMessageID
    );
    event ClearedAllowedRelayer();
    event TellerChanged(address previousTeller, address indexed newTeller);
    event NewRelayerAdded(address indexed newRelayerAddress);

    /* solhint-enable */

    function bridgeTokens(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address sender,
        address recipient,
        uint256 amount
    ) external payable;

    function bridgeERC721(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address sender,
        address recipient,
        uint256[] memory tokenIds
    ) external;

    function bridgeERC1155(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address sender,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) external;
}
