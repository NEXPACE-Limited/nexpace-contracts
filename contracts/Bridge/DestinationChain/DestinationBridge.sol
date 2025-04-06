// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC20BridgeToken } from "./Interfaces/IERC20BridgeToken.sol";
import { IERC721BridgeToken } from "./Interfaces/IERC721BridgeToken.sol";
import { IERC1155BridgeToken } from "./Interfaces/IERC1155BridgeToken.sol";
import { IDestinationBridge } from "./IDestinationBridge.sol";
import { ITeleporterMessenger, TeleporterMessageInput, TeleporterFeeInfo } from "../libs/Teleporter/ITeleporterMessenger.sol";
import { TeleporterOwnerUpgradeable } from "../libs/Teleporter/upgrades/TeleporterOwnerUpgradeable.sol";
import { IWarpMessenger } from "../libs/WarpMessenger/IWarpMessenger.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { MinProxy } from "@projecta/min-proxy/contracts/MinProxy.sol";

contract DestinationBridge is ERC2771Context, IDestinationBridge, TeleporterOwnerUpgradeable, NextOwnablePausable {
    uint256 public constant UNLOCK_BRIDGE_TOKENS_REQUIRED_GAS = 200_000;
    address public constant WARP_PRECOMPILE_ADDRESS = 0x0200000000000000000000000000000000000005;
    bytes32 public immutable currentBlockchainID;
    IERC20BridgeToken public immutable erc20BridgeTokenImpl;
    IERC721BridgeToken public immutable erc721BridgeTokenImpl;
    IERC1155BridgeToken public immutable erc1155BridgeTokenImpl;

    address private _initOwner;
    address[] private _allowedRelayers;

    mapping(address bridgedToken => bool wrappedTokenExist) public wrappedTokenContract;
    mapping(bytes32 originBlockchainID => mapping(address originBridgeAddress => mapping(address originTokenAddress => address wrappedTokenAddress)))
        public wrappedTokensAddress;

    modifier validAddress(address addr) {
        require(addr != address(0), "DestinationBridge/invalidAddress: couldn't be zero address");
        _;
    }

    constructor(
        address trustedForwarder,
        address teleporterRegistryAddress,
        address teleporterManager,
        address initOwner_,
        IERC20BridgeToken erc20BridgeTokenImpl_,
        IERC721BridgeToken erc721BridgeTokenImpl_,
        IERC1155BridgeToken erc1155BridgeTokenImpl_
    )
        ERC2771Context(trustedForwarder)
        TeleporterOwnerUpgradeable(teleporterRegistryAddress, teleporterManager)
        validAddress(trustedForwarder)
        validAddress(teleporterRegistryAddress)
        validAddress(teleporterManager)
        validAddress(initOwner_)
    {
        currentBlockchainID = IWarpMessenger(WARP_PRECOMPILE_ADDRESS).getBlockchainID();
        _initOwner = initOwner_;
        erc20BridgeTokenImpl = erc20BridgeTokenImpl_;
        erc721BridgeTokenImpl = erc721BridgeTokenImpl_;
        erc1155BridgeTokenImpl = erc1155BridgeTokenImpl_;
    }

    /* solhint-enable */

    /**
     * @notice Bridges ERC20 tokens to a destination blockchain.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge contract on the destination blockchain.
     * @param destinationTokenAddress The address of the token contract on the destination blockchain.
     * @param recipient The address of the recipient on the destination blockchain.
     * @param amount The amount of tokens to bridge.
     */
    function bridgeTokens(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address recipient,
        uint256 amount
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(destinationBridgeAddress)
        validAddress(destinationTokenAddress)
        validAddress(recipient)
    {
        require(
            destinationBlockchainID != currentBlockchainID,
            "DestinationBridge/invalidRequest: cannot bridge to same chain"
        );

        return
            _requestTokenBridge({
                destinationBlockchainID: destinationBlockchainID,
                destinationBridgeAddress: destinationBridgeAddress,
                sourceTokenAddress: destinationTokenAddress,
                recipient: recipient,
                amount: amount
            });
    }

    /**
     * @notice Bridges ERC721 tokens to a destination blockchain.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge contract on the destination blockchain.
     * @param destinationTokenAddress The address of the token contract on the destination blockchain.
     * @param recipient The address of the recipient on the destination blockchain.
     * @param tokenIds The IDs of the tokens to bridge.
     */
    function bridgeERC721(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address recipient,
        uint256[] memory tokenIds
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(destinationBridgeAddress)
        validAddress(destinationTokenAddress)
        validAddress(recipient)
    {
        require(
            destinationBlockchainID != currentBlockchainID,
            "DestinationBridge/invalidRequest: cannot bridge to same chain"
        );

        return
            _requestERC721Bridge({
                destinationBlockchainID: destinationBlockchainID,
                destinationBridgeAddress: destinationBridgeAddress,
                sourceTokenAddress: destinationTokenAddress,
                recipient: recipient,
                tokenIds: tokenIds
            });
    }

    /**
     * @notice Bridges ERC1155 tokens to a destination blockchain.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge contract on the destination blockchain.
     * @param destinationTokenAddress The address of the token contract on the destination blockchain.
     * @param recipient The address of the recipient on the destination blockchain.
     * @param tokenIds The IDs of the tokens to bridge.
     * @param amounts The amounts of each token to bridge.
     */
    function bridgeERC1155(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address destinationTokenAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(destinationBridgeAddress)
        validAddress(destinationTokenAddress)
        validAddress(recipient)
    {
        require(
            destinationBlockchainID != currentBlockchainID,
            "DestinationBridge/invalidRequest: cannot bridge to same chain"
        );

        return
            _requestERC1155Bridge({
                destinationBlockchainID: destinationBlockchainID,
                destinationBridgeAddress: destinationBridgeAddress,
                sourceTokenAddress: destinationTokenAddress,
                recipient: recipient,
                tokenIds: tokenIds,
                amounts: amounts
            });
    }

    /**
     * @notice Sets a new init owner address.
     * @dev A init owner is an address that first owner of the new token contract.
     * @param newInitOwner The new init owner address.
     */
    function setInitOwner(address newInitOwner) external onlyOwner validAddress(newInitOwner) {
        emit InitOwnerChanged(_initOwner, newInitOwner);
        _initOwner = newInitOwner;
    }

    /**
     * @notice Adds a new relayer address to the allowed relayers list.
     * @param newRelayerAddress The address of the new relayer to be added.
     */
    function addAllowedRelayer(address newRelayerAddress) external onlyOwner validAddress(newRelayerAddress) {
        emit NewRelayerAdded(newRelayerAddress);
        _allowedRelayers.push(newRelayerAddress);
    }

    /**
     * @notice Clears all addresses from the allowed relayers list.
     */
    function clearAllowedRelayer() external onlyOwner {
        emit ClearedAllowedRelayer();
        _allowedRelayers = new address[](0);
    }

    /**
     * @notice Gets the current init owner address.
     * @return address The address of the current init owner.
     */
    function getInitOwner() external view returns (address) {
        return _initOwner;
    }

    /**
     * @notice Gets the list of allowed relayer addresses.
     * @return address[] An array of addresses that are allowed as relayers.
     */
    function getAllowedRelayerAddresses() external view returns (address[] memory) {
        return _allowedRelayers;
    }

    function _receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes memory message
    ) internal override {
        (BridgeAction action, bytes memory actionData) = abi.decode(message, (BridgeAction, bytes));
        if (action == BridgeAction.MintTokens) {
            (address originContractAddress, address recipient, uint256 bridgeAmount) = abi.decode(
                actionData,
                (address, address, uint256)
            );
            _mintBridgeTokens(sourceBlockchainID, originSenderAddress, originContractAddress, recipient, bridgeAmount);
        } else if (action == BridgeAction.MintERC721) {
            (address originContractAddress, address recipient, uint256[] memory tokenIds) = abi.decode(
                actionData,
                (address, address, uint256[])
            );
            _mintERC721(sourceBlockchainID, originSenderAddress, originContractAddress, recipient, tokenIds);
        } else if (action == BridgeAction.MintERC1155) {
            (
                address originContractAddress,
                address recipient,
                uint256[] memory tokenIds,
                uint256[] memory bridgeAmounts
            ) = abi.decode(actionData, (address, address, uint256[], uint256[]));
            _mintERC1155(
                sourceBlockchainID,
                originSenderAddress,
                originContractAddress,
                recipient,
                tokenIds,
                bridgeAmounts
            );
        } else if (action == BridgeAction.TokenCreate) {
            (address originContractAddress, string memory tokenName, string memory tokenSymbol, uint8 decimals) = abi
                .decode(actionData, (address, string, string, uint8));
            _createBridgeToken({
                requestBlockchainID: sourceBlockchainID,
                requestBridgeAddress: originSenderAddress,
                originContractAddress: originContractAddress,
                wrappedTokenName: tokenName,
                wrappedTokenSymbol: tokenSymbol,
                wrappedTokenDecimals: decimals
            });
        } else if (action == BridgeAction.ERC721Create) {
            (
                address originContractAddress,
                string memory tokenName,
                string memory tokenSymbol,
                string memory tokenURI
            ) = abi.decode(actionData, (address, string, string, string));
            _createERC721({
                requestBlockchainID: sourceBlockchainID,
                requestBridgeAddress: originSenderAddress,
                originContractAddress: originContractAddress,
                wrappedTokenName: tokenName,
                wrappedTokenSymbol: tokenSymbol,
                wrappedTokenURI: tokenURI
            });
        } else if (action == BridgeAction.ERC1155Create) {
            (address originContractAddress, string memory tokenURI) = abi.decode(actionData, (address, string));
            _createERC1155({
                requestBlockchainID: sourceBlockchainID,
                requestBridgeAddress: originSenderAddress,
                originContractAddress: originContractAddress,
                wrappedTokenURI: tokenURI
            });
        } else {
            revert("DestinationBridge/invalidRequest: invalid action data");
        }
    }

    /**
     * @notice Encodes the data required to unlock origin tokens on the destination blockchain.
     * @dev The encoded data includes destination blockchain ID, destination bridge address, origin token address,
     * recipient, and amount of tokens to unlock.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge contract on the destination blockchain.
     * @param originTokenAddress The address of the original token contract on the origin blockchain.
     * @param recipient The address of the recipient on the destination blockchain.
     * @param amount The amount of tokens to unlock.
     * @return bytes The encoded data as bytes.
     */
    function _encodeUnlockOriginTokensData(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address originTokenAddress,
        address recipient,
        uint256 amount
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(
            destinationBlockchainID,
            destinationBridgeAddress,
            originTokenAddress,
            recipient,
            amount
        );
        return abi.encode(BridgeAction.UnlockTokens, paramsData);
    }

    /**
     * @notice Encodes the data required to unlock ERC721 tokens on the destination blockchain.
     * @dev The encoded data includes destination blockchain ID, destination bridge address, origin token address,
     * recipient, and token IDs of ERC721 tokens to unlock.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge contract on the destination blockchain.
     * @param originTokenAddress The address of the original ERC721 token contract on the origin blockchain.
     * @param recipient The address of the recipient on the destination blockchain.
     * @param tokenIds The IDs of ERC721 tokens to unlock.
     * @return bytes The encoded data as bytes.
     */
    function _encodeUnlockERC721Data(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address originTokenAddress,
        address recipient,
        uint256[] memory tokenIds
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(
            destinationBlockchainID,
            destinationBridgeAddress,
            originTokenAddress,
            recipient,
            tokenIds
        );
        return abi.encode(BridgeAction.UnlockERC721, paramsData);
    }

    /**
     * @notice Encodes the data required to unlock ERC1155 tokens on the destination blockchain.
     * @dev The encoded data includes destination blockchain ID, destination bridge address, origin token address,
     * recipient, token IDs, and amounts of ERC1155 tokens to unlock.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge contract on the destination blockchain.
     * @param originTokenAddress The address of the original ERC1155 token contract on the origin blockchain.
     * @param recipient The address of the recipient on the destination blockchain.
     * @param tokenIds The IDs of ERC1155 tokens to unlock.
     * @param amounts The amounts of ERC1155 tokens to unlock.
     * @return bytes The encoded data as bytes.
     */
    function _encodeUnlockERC1155Data(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address originTokenAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(
            destinationBlockchainID,
            destinationBridgeAddress,
            originTokenAddress,
            recipient,
            tokenIds,
            amounts
        );
        return abi.encode(BridgeAction.UnlockERC1155, paramsData);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _createBridgeToken(
        bytes32 requestBlockchainID,
        address requestBridgeAddress,
        address originContractAddress,
        string memory wrappedTokenName,
        string memory wrappedTokenSymbol,
        uint8 wrappedTokenDecimals
    ) private {
        require(
            wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][originContractAddress] == address(0),
            "DestinationBridge/invalidRequest: bridge token already exists"
        );
        address bridgeTokenAddress = MinProxy.createProxy(address(erc20BridgeTokenImpl));
        IERC20BridgeToken(bridgeTokenAddress).initialize(
            wrappedTokenName,
            wrappedTokenSymbol,
            wrappedTokenDecimals,
            _initOwner
        );

        emit CreateBridgeToken(requestBlockchainID, requestBridgeAddress, originContractAddress, bridgeTokenAddress, 2);
        wrappedTokenContract[bridgeTokenAddress] = true;
        wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][originContractAddress] = bridgeTokenAddress;
    }

    function _createERC721(
        bytes32 requestBlockchainID,
        address requestBridgeAddress,
        address originContractAddress,
        string memory wrappedTokenName,
        string memory wrappedTokenSymbol,
        string memory wrappedTokenURI
    ) private {
        require(
            wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][originContractAddress] == address(0),
            "DestinationBridge/invalidRequest: bridge token already exists"
        );
        address bridgeTokenAddress = MinProxy.createProxy(address(erc721BridgeTokenImpl));
        IERC721BridgeToken(bridgeTokenAddress).initialize(
            wrappedTokenName,
            wrappedTokenSymbol,
            wrappedTokenURI,
            _initOwner
        );

        emit CreateBridgeToken(requestBlockchainID, requestBridgeAddress, originContractAddress, bridgeTokenAddress, 3);
        wrappedTokenContract[bridgeTokenAddress] = true;
        wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][originContractAddress] = bridgeTokenAddress;
    }

    function _createERC1155(
        bytes32 requestBlockchainID,
        address requestBridgeAddress,
        address originContractAddress,
        string memory wrappedTokenURI
    ) private {
        require(
            wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][originContractAddress] == address(0),
            "DestinationBridge/invalidRequest: bridge token already exists"
        );
        address bridgeTokenAddress = MinProxy.createProxy(address(erc1155BridgeTokenImpl));
        IERC1155BridgeToken(bridgeTokenAddress).initialize(wrappedTokenURI, _initOwner);

        emit CreateBridgeToken(requestBlockchainID, requestBridgeAddress, originContractAddress, bridgeTokenAddress, 4);
        wrappedTokenContract[bridgeTokenAddress] = true;
        wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][originContractAddress] = bridgeTokenAddress;
    }

    function _mintBridgeTokens(
        bytes32 requestBlockchainID,
        address requestBridgeAddress,
        address originContractAddress,
        address recipient,
        uint256 amount
    ) private {
        address wrappedTokenAddress = wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][
            originContractAddress
        ];
        require(wrappedTokenAddress != address(0), "DestinationBridge/invalidAddress: bridge token does not exist");
        emit MintBridgeTokens(wrappedTokenAddress, recipient, amount);
        IERC20BridgeToken(wrappedTokenAddress).mint(recipient, amount);
    }

    function _mintERC721(
        bytes32 requestBlockchainID,
        address requestBridgeAddress,
        address originContractAddress,
        address recipient,
        uint256[] memory tokenIds
    ) private {
        address wrappedTokenAddress = wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][
            originContractAddress
        ];
        require(wrappedTokenAddress != address(0), "DestinationBridge/invalidAddress: bridge token does not exist");
        emit MintERC721(wrappedTokenAddress, recipient, tokenIds);
        IERC721BridgeToken(wrappedTokenAddress).mintBatch(recipient, tokenIds);
    }

    function _mintERC1155(
        bytes32 requestBlockchainID,
        address requestBridgeAddress,
        address originContractAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) private {
        address wrappedTokenAddress = wrappedTokensAddress[requestBlockchainID][requestBridgeAddress][
            originContractAddress
        ];
        require(wrappedTokenAddress != address(0), "DestinationBridge/invalidAddress: bridge token does not exist");
        emit MintERC1155(wrappedTokenAddress, recipient, tokenIds, amounts);
        IERC1155BridgeToken(wrappedTokenAddress).mintBatch(recipient, tokenIds, amounts, "");
    }

    function _requestTokenBridge(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address recipient,
        uint256 amount
    ) private {
        require(!wrappedTokenContract[sourceTokenAddress], "DestinationBridge/invalidAddress: non-exist wrapped token");
        address wrappedTokenAddress = wrappedTokensAddress[destinationBlockchainID][destinationBridgeAddress][
            sourceTokenAddress
        ];
        IERC20BridgeToken(wrappedTokenAddress).burnFrom(_msgSender(), amount);
        bytes memory messageData = _encodeUnlockOriginTokensData(
            destinationBlockchainID,
            destinationBridgeAddress,
            sourceTokenAddress,
            recipient,
            amount
        );

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: sourceTokenAddress, amount: 0 }),
                requiredGasLimit: UNLOCK_BRIDGE_TOKENS_REQUIRED_GAS,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );
        emit BridgeTokens({
            tokenContractAddress: sourceTokenAddress,
            destinationBlockchainID: destinationBlockchainID,
            teleporterMessageID: messageID,
            destinationBridgeAddress: destinationBridgeAddress,
            sender: _msgSender(),
            recipient: recipient,
            amount: amount
        });
    }

    function _requestERC721Bridge(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address recipient,
        uint256[] memory tokenIds
    ) private {
        uint256 tokenLength = tokenIds.length;
        uint256 requiredGas = tokenLength * UNLOCK_BRIDGE_TOKENS_REQUIRED_GAS;
        require(requiredGas < 25000000, "DestinationBridge/overBlockGas: too much tokens");
        require(!wrappedTokenContract[sourceTokenAddress], "DestinationBridge/invalidAddress: non-exist wrapped token");
        address wrappedTokenAddress = wrappedTokensAddress[destinationBlockchainID][destinationBridgeAddress][
            sourceTokenAddress
        ];

        IERC721BridgeToken(wrappedTokenAddress).burnBatch(tokenIds);
        bytes memory messageData = _encodeUnlockERC721Data(
            destinationBlockchainID,
            destinationBridgeAddress,
            sourceTokenAddress,
            recipient,
            tokenIds
        );

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: sourceTokenAddress, amount: 0 }),
                requiredGasLimit: requiredGas,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );
        emit BridgeERC721({
            tokenContractAddress: sourceTokenAddress,
            destinationBlockchainID: destinationBlockchainID,
            teleporterMessageID: messageID,
            destinationBridgeAddress: destinationBridgeAddress,
            sender: _msgSender(),
            recipient: recipient,
            tokenIds: tokenIds
        });
    }

    function _requestERC1155Bridge(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) private {
        uint256 tokenLength = tokenIds.length;
        uint256 requiredGas = tokenLength * UNLOCK_BRIDGE_TOKENS_REQUIRED_GAS;
        require(requiredGas < 25000000, "DestinationBridge/overBlockGas: too much tokens");
        require(!wrappedTokenContract[sourceTokenAddress], "DestinationBridge/invalidAddress: non-exist wrapped token");
        address wrappedTokenAddress = wrappedTokensAddress[destinationBlockchainID][destinationBridgeAddress][
            sourceTokenAddress
        ];
        IERC1155BridgeToken(wrappedTokenAddress).burnBatch(_msgSender(), tokenIds, amounts);
        bytes memory messageData = _encodeUnlockERC1155Data(
            destinationBlockchainID,
            destinationBridgeAddress,
            sourceTokenAddress,
            recipient,
            tokenIds,
            amounts
        );

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: sourceTokenAddress, amount: 0 }),
                requiredGasLimit: requiredGas,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );
        emit BridgeERC1155({
            tokenContractAddress: sourceTokenAddress,
            destinationBlockchainID: destinationBlockchainID,
            teleporterMessageID: messageID,
            destinationBridgeAddress: destinationBridgeAddress,
            sender: _msgSender(),
            recipient: recipient,
            tokenIds: tokenIds,
            amounts: amounts
        });
    }
}
