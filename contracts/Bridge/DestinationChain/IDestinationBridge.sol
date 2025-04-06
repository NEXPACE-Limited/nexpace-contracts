// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IDestinationBridge {
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
    event BridgeTokens(
        address indexed tokenContractAddress,
        bytes32 indexed destinationBlockchainID,
        bytes32 indexed teleporterMessageID,
        address destinationBridgeAddress,
        address sender,
        address recipient,
        uint256 amount
    );
    event BridgeERC721(
        address indexed tokenContractAddress,
        bytes32 indexed destinationBlockchainID,
        bytes32 indexed teleporterMessageID,
        address destinationBridgeAddress,
        address sender,
        address recipient,
        uint256[] tokenIds
    );
    event BridgeERC1155(
        address indexed tokenContractAddress,
        bytes32 indexed destinationBlockchainID,
        bytes32 indexed teleporterMessageID,
        address destinationBridgeAddress,
        address sender,
        address recipient,
        uint256[] tokenIds,
        uint256[] amounts
    );
    event CreateBridgeToken(
        bytes32 indexed requestBlockchainID,
        address indexed requestBridgeAddress,
        address indexed originContractAddress,
        address bridgeTokenAddress,
        uint8 tokenType
    );
    event MintBridgeTokens(address indexed wrappedTokenAddress, address recipient, uint256 amount);
    event MintERC721(address indexed wrappedTokenAddress, address recipient, uint256[] tokenIds);
    event MintERC1155(address indexed wrappedTokenAddress, address recipient, uint256[] tokenIds, uint256[] amounts);
    event ClearedAllowedRelayer();
    event NewRelayerAdded(address indexed newRelayerAddress);
    event InitOwnerChanged(address previousInitOwner, address indexed newInitOwner);

    /* solhint-enable */

    function bridgeTokens(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address recipient,
        uint256 amount
    ) external;

    function bridgeERC721(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address recipient,
        uint256[] memory tokenIds
    ) external;

    function bridgeERC1155(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) external;
}
