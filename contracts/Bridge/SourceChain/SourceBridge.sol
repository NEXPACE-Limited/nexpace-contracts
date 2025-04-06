// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { ISourceBridge } from "./ISourceBridge.sol";
import { ITeleporterMessenger, TeleporterMessageInput, TeleporterFeeInfo } from "../libs/Teleporter/ITeleporterMessenger.sol";
import { TeleporterOwnerUpgradeable } from "../libs/Teleporter/upgrades/TeleporterOwnerUpgradeable.sol";
import { IWarpMessenger } from "../libs/WarpMessenger/IWarpMessenger.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Holder } from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC1155Holder } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

contract SourceBridge is
    ERC2771Context,
    ISourceBridge,
    TeleporterOwnerUpgradeable,
    ERC721Holder,
    ERC1155Holder,
    NextOwnablePausable
{
    using SafeERC20 for ERC20;

    address public constant NATIVE_TOKEN = 0x0200000000000000000000000000000000000001;
    address public constant WARP_PRECOMPILE_ADDRESS = 0x0200000000000000000000000000000000000005;
    uint256 public constant CREATE_BRIDGE_TOKENS_REQUIRED_GAS = 3_000_000;
    uint256 public constant MINT_BRIDGE_TOKENS_REQUIRED_GAS = 200_000;
    bytes32 public immutable currentBlockchainID;

    address private _teller;
    address[] private _allowedRelayers;

    mapping(bytes32 destinationBlockchainID => mapping(address destinationBridgeAddress => mapping(address originTokenAddress => uint8 createdTokenType)))
        public submittedBridgeTokenCreations;
    mapping(bytes32 destinationBlockchainID => mapping(address destinationBridgeAddress => mapping(address originTokenAddress => uint256 balance)))
        public bridgedBalances;
    mapping(bytes32 destinationBlockchainID => mapping(address destinationBridgeAddress => mapping(address originTokenAddress => mapping(uint256 tokenId => bool bridged))))
        public bridgedNft;
    mapping(bytes32 destinationBlockchainID => mapping(address destinationBridgeAddress => mapping(address originTokenAddress => mapping(uint256 tokenId => uint256 amount))))
        public bridgedFts;

    modifier validAddress(address addr) {
        require(addr != address(0), "SourceBridge/invalidAddress: couldn't be zero address");
        _;
    }

    constructor(
        address trustedForwarder,
        address teleporterRegistryAddress,
        address teleporterManager
    )
        ERC2771Context(trustedForwarder)
        TeleporterOwnerUpgradeable(teleporterRegistryAddress, teleporterManager)
        validAddress(trustedForwarder)
        validAddress(teleporterRegistryAddress)
        validAddress(teleporterManager)
    {
        currentBlockchainID = IWarpMessenger(WARP_PRECOMPILE_ADDRESS).getBlockchainID();
    }

    /**
     * @notice Bridges Native tokens or ERC20 tokens to a destination blockchain.
     * @dev If the token address is the same as the native token minter address, it works as a native token bridge function.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge on the destination blockchain.
     * @param sourceTokenAddress The address of the token on the source blockchain.
     * @param sender The sender address on the source blockchain.
     * @param recipient The recipient address on the destination blockchain.
     * @param amount The amount of tokens to bridge.
     */
    function bridgeTokens(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address sender,
        address recipient,
        uint256 amount
    )
        external
        payable
        nonReentrant
        whenNotPaused
        validAddress(destinationBridgeAddress)
        validAddress(sourceTokenAddress)
        validAddress(recipient)
    {
        if (_msgSender() != _teller) {
            require(_msgSender() == sender, "SourceBridge/invalidRequest: cannot bridge others' assets");
        }

        require(
            destinationBlockchainID != currentBlockchainID,
            "SourceBridge/invalidRequest: cannot bridge to same chain"
        );
        if (sourceTokenAddress == NATIVE_TOKEN) {
            require(
                submittedBridgeTokenCreations[destinationBlockchainID][destinationBridgeAddress][sourceTokenAddress] ==
                    1,
                "SourceBridge/invalidRequest: invalid bridge token address"
            );
            require(msg.value == amount, "SourceBridge/wrongAmount: wrong value or amount");
        } else {
            require(
                submittedBridgeTokenCreations[destinationBlockchainID][destinationBridgeAddress][sourceTokenAddress] ==
                    2,
                "SourceBridge/invalidRequest: invalid bridge token address"
            );
            require(msg.value == 0, "SourceBridge/wrongValue: value must be 0");
        }

        return
            _processWrappedTokenMint(
                RequestBridgeTokenInfo({
                    destinationBlockchainID: destinationBlockchainID,
                    destinationBridgeAddress: destinationBridgeAddress,
                    sourceTokenAddress: sourceTokenAddress,
                    sender: sender,
                    recipient: recipient,
                    amount: amount
                })
            );
    }

    /**
     * @notice Bridges ERC721 tokens to a destination blockchain.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge on the destination blockchain.
     * @param sourceTokenAddress The address of the ERC721 token on the source blockchain.
     * @param sender The sender address on the source blockchain.
     * @param recipient The recipient address on the destination blockchain.
     * @param tokenIds The IDs of the ERC721 tokens to bridge.
     */
    function bridgeERC721(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address sender,
        address recipient,
        uint256[] memory tokenIds
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(destinationBridgeAddress)
        validAddress(sourceTokenAddress)
        validAddress(recipient)
    {
        if (_msgSender() != _teller) {
            require(_msgSender() == sender, "SourceBridge/invalidRequest: cannot bridge others' assets");
        }

        require(
            destinationBlockchainID != currentBlockchainID,
            "SourceBridge/invalidRequest: cannot bridge to same chain"
        );
        require(
            submittedBridgeTokenCreations[destinationBlockchainID][destinationBridgeAddress][sourceTokenAddress] == 3,
            "SourceBridge/invalidRequest: invalid bridge token address"
        );

        return
            _processERC721Mint(
                RequestBridgeERC721Info({
                    destinationBlockchainID: destinationBlockchainID,
                    destinationBridgeAddress: destinationBridgeAddress,
                    sourceTokenAddress: sourceTokenAddress,
                    sender: sender,
                    recipient: recipient,
                    tokenIds: tokenIds
                })
            );
    }

    /**
     * @notice Bridges ERC1155 tokens to a destination blockchain.
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge on the destination blockchain.
     * @param sourceTokenAddress The address of the ERC1155 token on the source blockchain.
     * @param sender The sender address on the source blockchain.
     * @param recipient The recipient address on the destination blockchain.
     * @param tokenIds The IDs of the ERC1155 tokens to bridge.
     * @param amounts The amounts of each ERC1155 token to bridge.
     */
    function bridgeERC1155(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address sender,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(destinationBridgeAddress)
        validAddress(sourceTokenAddress)
        validAddress(recipient)
    {
        if (_msgSender() != _teller) {
            require(_msgSender() == sender, "SourceBridge/invalidRequest: cannot bridge others' assets");
        }

        require(
            destinationBlockchainID != currentBlockchainID,
            "SourceBridge/invalidRequest: cannot bridge to same chain"
        );
        require(
            submittedBridgeTokenCreations[destinationBlockchainID][destinationBridgeAddress][sourceTokenAddress] == 4,
            "SourceBridge/invalidRequest: invalid bridge token address"
        );

        return
            _processERC1155Mint(
                RequestBridgeERC1155Info({
                    destinationBlockchainID: destinationBlockchainID,
                    destinationBridgeAddress: destinationBridgeAddress,
                    sourceTokenAddress: sourceTokenAddress,
                    sender: sender,
                    recipient: recipient,
                    tokenIds: tokenIds,
                    amounts: amounts
                })
            );
    }

    /**
     * @notice Submits a request to create a bridge token on a destination blockchain.
     * @dev The function validates the destination bridge address, ensures that a bridge token creation request does not already exist for the given parameters,
     * and then encodes and sends the appropriate message data for creating the bridge token.
     * @dev Token type 1. Native token / 2. ERC20 / 3. ERC721 / 4. ERC1155
     * @param destinationBlockchainID The ID of the destination blockchain.
     * @param destinationBridgeAddress The address of the bridge on the destination blockchain.
     * @param sourceTokenInfo Information about the source token including its address, type, and other relevant details.
     */
    function submitCreateBridgeToken(
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        SourceTokenInfo memory sourceTokenInfo
    )
        external
        nonReentrant
        whenExecutable
        validAddress(destinationBridgeAddress)
        validAddress(sourceTokenInfo.sourceTokenAddress)
    {
        require(
            submittedBridgeTokenCreations[destinationBlockchainID][destinationBridgeAddress][
                sourceTokenInfo.sourceTokenAddress
            ] == 0,
            "SourceBridge/invalidRequest: contract already exist"
        );
        bytes memory messageData;

        if (sourceTokenInfo.tokenType == 1) {
            messageData = _encodeCreateBridgeTokenData(
                sourceTokenInfo.sourceTokenAddress,
                // nativeToken name and symbol
                "NXPC",
                "NXPC",
                18
            );
        } else if (sourceTokenInfo.tokenType == 2) {
            ERC20 sourceToken = ERC20(sourceTokenInfo.sourceTokenAddress);
            messageData = _encodeCreateBridgeTokenData(
                sourceTokenInfo.sourceTokenAddress,
                sourceToken.name(),
                sourceToken.symbol(),
                sourceToken.decimals()
            );
        } else if (sourceTokenInfo.tokenType == 3) {
            ERC721 sourceToken = ERC721(sourceTokenInfo.sourceTokenAddress);
            messageData = _encodeCreateBridgeERC721Data(
                sourceTokenInfo.sourceTokenAddress,
                sourceToken.name(),
                sourceToken.symbol(),
                sourceTokenInfo.defaultBaseURI
            );
        } else if (sourceTokenInfo.tokenType == 4) {
            messageData = _encodeCreateBridgeERC1155Data(
                sourceTokenInfo.sourceTokenAddress,
                sourceTokenInfo.defaultBaseURI
            );
        } else {
            revert("SourceBridge/invalidRequest: invalid token type");
        }

        submittedBridgeTokenCreations[destinationBlockchainID][destinationBridgeAddress][
            sourceTokenInfo.sourceTokenAddress
        ] = sourceTokenInfo.tokenType;

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: address(0), amount: 0 }),
                requiredGasLimit: CREATE_BRIDGE_TOKENS_REQUIRED_GAS,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );
        emit SubmitCreateBridgeToken(
            destinationBlockchainID,
            destinationBridgeAddress,
            sourceTokenInfo.sourceTokenAddress,
            sourceTokenInfo.tokenType,
            messageID
        );
    }

    /**
     * @notice Sets a new teller contract address.
     * @dev A teller is an address that temporarily stores the bridge-requested assets of the user listed on the blocklist.
     * @param newTeller The new teller address.
     */
    function setTeller(address newTeller) external onlyOwner {
        emit TellerChanged(_teller, newTeller);
        _teller = newTeller;
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
     * @notice Gets the current teller address.
     * @return address The address of the current teller.
     */
    function getTeller() external view returns (address) {
        return _teller;
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

        if (action == BridgeAction.UnlockTokens) {
            (
                bytes32 destinationBlockchainID,
                address destinationBridgeAddress,
                address sourceTokenAddress,
                address recipient,
                uint256 amount
            ) = abi.decode(actionData, (bytes32, address, address, address, uint256));
            _unlockBridgeToken({
                sourceBlockchainID: sourceBlockchainID,
                sourceBridgeAddress: originSenderAddress,
                destinationBlockchainID: destinationBlockchainID,
                destinationBridgeAddress: destinationBridgeAddress,
                sourceTokenAddress: sourceTokenAddress,
                recipient: recipient,
                amount: amount
            });
        } else if (action == BridgeAction.UnlockERC721) {
            (
                bytes32 destinationBlockchainID,
                address destinationBridgeAddress,
                address sourceTokenAddress,
                address recipient,
                uint256[] memory tokenIds
            ) = abi.decode(actionData, (bytes32, address, address, address, uint256[]));
            _unlockBridgeERC721({
                sourceBlockchainID: sourceBlockchainID,
                sourceBridgeAddress: originSenderAddress,
                destinationBlockchainID: destinationBlockchainID,
                destinationBridgeAddress: destinationBridgeAddress,
                sourceTokenAddress: sourceTokenAddress,
                recipient: recipient,
                tokenIds: tokenIds
            });
        } else if (action == BridgeAction.UnlockERC1155) {
            (
                bytes32 destinationBlockchainID,
                address destinationBridgeAddress,
                address sourceTokenAddress,
                address recipient,
                uint256[] memory tokenIds,
                uint256[] memory amounts
            ) = abi.decode(actionData, (bytes32, address, address, address, uint256[], uint256[]));
            _unlockBridgeERC1155({
                sourceBlockchainID: sourceBlockchainID,
                sourceBridgeAddress: originSenderAddress,
                destinationBlockchainID: destinationBlockchainID,
                destinationBridgeAddress: destinationBridgeAddress,
                sourceTokenAddress: sourceTokenAddress,
                recipient: recipient,
                tokenIds: tokenIds,
                amounts: amounts
            });
        } else {
            revert("SourceBridge/invalidRequest: invalid action data");
        }
    }

    /**
     * @notice Encodes the data required to create a bridge token.
     * @dev The encoded data includes the origin contract address, token name, token symbol, and token decimals.
     * @param originContractAddress The address of the original token contract.
     * @param tokenName The name of the token.
     * @param tokenSymbol The symbol of the token.
     * @param tokenDecimals The number of decimals of the token.
     * @return bytes The encoded data as bytes.
     */
    function _encodeCreateBridgeTokenData(
        address originContractAddress,
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(originContractAddress, tokenName, tokenSymbol, tokenDecimals);
        return abi.encode(BridgeAction.TokenCreate, paramsData);
    }

    /**
     * @notice Encodes the data required to create a bridge ERC721 token.
     * @dev The encoded data includes the origin contract address, token name, token symbol, and base URI.
     * @param originContractAddress The address of the original ERC721 token contract.
     * @param tokenName The name of the ERC721 token.
     * @param tokenSymbol The symbol of the ERC721 token.
     * @param uri_ The base URI of the ERC721 token.
     * @return bytes The encoded data as bytes.
     */
    function _encodeCreateBridgeERC721Data(
        address originContractAddress,
        string memory tokenName,
        string memory tokenSymbol,
        string memory uri_
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(originContractAddress, tokenName, tokenSymbol, uri_);
        return abi.encode(BridgeAction.ERC721Create, paramsData);
    }

    /**
     * @notice Encodes the data required to create a bridge ERC1155 token.
     * @dev The encoded data includes the origin contract address and base URI.
     * @param originContractAddress The address of the original ERC1155 token contract.
     * @param uri_ The base URI of the ERC1155 token.
     * @return bytes The encoded data as bytes.
     */
    function _encodeCreateBridgeERC1155Data(
        address originContractAddress,
        string memory uri_
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(originContractAddress, uri_);
        return abi.encode(BridgeAction.ERC1155Create, paramsData);
    }

    /**
     * @notice Encodes the data required to mint wrapped tokens.
     * @dev The encoded data includes the origin contract address, recipient address, and amount to be bridged.
     * @param originContractAddress The address of the original token contract.
     * @param recipient The address of the recipient.
     * @param bridgeAmount The amount of tokens to be bridged.
     * @return bytes The encoded data as bytes.
     */
    function _encodeMintWrappedTokenData(
        address originContractAddress,
        address recipient,
        uint256 bridgeAmount
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(originContractAddress, recipient, bridgeAmount);
        return abi.encode(BridgeAction.MintTokens, paramsData);
    }

    /**
     * @notice Encodes the data required to mint ERC721 tokens.
     * @dev The encoded data includes the origin contract address, recipient address, and token IDs to be bridged.
     * @param originContractAddress The address of the original ERC721 token contract.
     * @param recipient The address of the recipient.
     * @param tokenIds The IDs of the tokens to be bridged.
     * @return bytes The encoded data as bytes.
     */
    function _encodeMintERC721Data(
        address originContractAddress,
        address recipient,
        uint256[] memory tokenIds
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(originContractAddress, recipient, tokenIds);
        return abi.encode(BridgeAction.MintERC721, paramsData);
    }

    /**
     * @notice Encodes the data required to mint ERC1155 tokens.
     * @dev The encoded data includes the origin contract address, recipient address, token IDs, and amounts to be bridged.
     * @param originContractAddress The address of the original ERC1155 token contract.
     * @param recipient The address of the recipient.
     * @param tokenIds The IDs of the tokens to be bridged.
     * @param bridgeAmounts The amounts of tokens to be bridged.
     * @return bytes The encoded data as bytes.
     */
    function _encodeMintERC1155Data(
        address originContractAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory bridgeAmounts
    ) internal pure returns (bytes memory) {
        bytes memory paramsData = abi.encode(originContractAddress, recipient, tokenIds, bridgeAmounts);
        return abi.encode(BridgeAction.MintERC1155, paramsData);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _unlockBridgeToken(
        bytes32 sourceBlockchainID,
        address sourceBridgeAddress,
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address recipient,
        uint256 amount
    ) private {
        require(
            sourceBlockchainID != destinationBlockchainID,
            "SourceBridge/invalidRequest: cannot bridge to same chain"
        );
        require(
            destinationBridgeAddress == address(this),
            "SourceBridge/invalidRequest: invalid destination bridge address"
        );

        uint256 currentBalance = bridgedBalances[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress];
        require(currentBalance >= amount, "SourceBridge/wrongAmount: insufficient balance");

        if (sourceTokenAddress == NATIVE_TOKEN) {
            unchecked {
                bridgedBalances[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress] = currentBalance - amount;
            }
            (bool success, ) = recipient.call{ value: amount }("");
            require(success, "SourceBridge/transferFailed: Transfer failed");
            return;
        }
        unchecked {
            bridgedBalances[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress] = currentBalance - amount;
        }
        ERC20(sourceTokenAddress).safeTransfer(recipient, amount);
        return;
    }

    function _unlockBridgeERC721(
        bytes32 sourceBlockchainID,
        address sourceBridgeAddress,
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address recipient,
        uint256[] memory tokenIds
    ) private {
        require(
            sourceBlockchainID != destinationBlockchainID,
            "SourceBridge/invalidRequest: cannot bridge to same chain"
        );
        require(
            destinationBridgeAddress == address(this),
            "SourceBridge/invalidRequest: invalid destination bridge address"
        );

        uint256 tokenLength = tokenIds.length;

        for (uint256 i; i < tokenLength; ) {
            bool isBridgedNft = bridgedNft[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress][tokenIds[i]];
            require(isBridgedNft, "SourceBridge/wrongAmount: insufficient balance");

            bridgedNft[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress][tokenIds[i]] = false;
            ERC721(sourceTokenAddress).safeTransferFrom(address(this), recipient, tokenIds[i]);
            unchecked {
                i++;
            }
        }

        return;
    }

    function _unlockBridgeERC1155(
        bytes32 sourceBlockchainID,
        address sourceBridgeAddress,
        bytes32 destinationBlockchainID,
        address destinationBridgeAddress,
        address sourceTokenAddress,
        address recipient,
        uint256[] memory tokenIds,
        uint256[] memory amounts
    ) private {
        require(
            sourceBlockchainID != destinationBlockchainID,
            "SourceBridge/invalidRequest: cannot bridge to same chain"
        );
        require(
            destinationBridgeAddress == address(this),
            "SourceBridge/invalidRequest: invalid destination bridge address"
        );

        uint256 tokenLength = tokenIds.length;
        for (uint256 i; i < tokenLength; ) {
            uint256 currentBalance = bridgedFts[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress][
                tokenIds[i]
            ];
            require(currentBalance >= amounts[i], "SourceBridge/wrongAmount: insufficient balance");

            unchecked {
                bridgedFts[sourceBlockchainID][sourceBridgeAddress][sourceTokenAddress][tokenIds[i]] =
                    currentBalance -
                    amounts[i];
            }
            ERC1155(sourceTokenAddress).safeTransferFrom(address(this), recipient, tokenIds[i], amounts[i], "");
            unchecked {
                i++;
            }
        }
        return;
    }

    function _processWrappedTokenMint(RequestBridgeTokenInfo memory requestBridgeTokenInfo) private {
        if (requestBridgeTokenInfo.sourceTokenAddress != NATIVE_TOKEN) {
            ERC20(requestBridgeTokenInfo.sourceTokenAddress).transferFrom(
                requestBridgeTokenInfo.sender,
                address(this),
                requestBridgeTokenInfo.amount
            );
        }

        bridgedBalances[requestBridgeTokenInfo.destinationBlockchainID][
            requestBridgeTokenInfo.destinationBridgeAddress
        ][requestBridgeTokenInfo.sourceTokenAddress] += requestBridgeTokenInfo.amount;

        bytes memory messageData = _encodeMintWrappedTokenData({
            originContractAddress: requestBridgeTokenInfo.sourceTokenAddress,
            recipient: requestBridgeTokenInfo.recipient,
            bridgeAmount: requestBridgeTokenInfo.amount
        });

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: requestBridgeTokenInfo.destinationBlockchainID,
                destinationAddress: requestBridgeTokenInfo.destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: address(0), amount: 0 }),
                requiredGasLimit: MINT_BRIDGE_TOKENS_REQUIRED_GAS,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );

        emit BridgeTokens({
            sourceTokenAddress: requestBridgeTokenInfo.sourceTokenAddress,
            destinationBlockchainID: requestBridgeTokenInfo.destinationBlockchainID,
            teleporterMessageID: messageID,
            destinationBridgeAddress: requestBridgeTokenInfo.destinationBridgeAddress,
            sender: requestBridgeTokenInfo.sender,
            recipient: requestBridgeTokenInfo.recipient,
            amount: requestBridgeTokenInfo.amount
        });
    }

    function _processERC721Mint(RequestBridgeERC721Info memory requestBridgeERC721Info) private {
        uint256 tokenLength = requestBridgeERC721Info.tokenIds.length;
        uint256 requiredGas = tokenLength * MINT_BRIDGE_TOKENS_REQUIRED_GAS;
        require(requiredGas < 15000000, "SourceBridge/overBlockGas: too much tokens");

        for (uint256 i; i < tokenLength; ) {
            ERC721(requestBridgeERC721Info.sourceTokenAddress).safeTransferFrom(
                requestBridgeERC721Info.sender,
                address(this),
                requestBridgeERC721Info.tokenIds[i]
            );

            bridgedNft[requestBridgeERC721Info.destinationBlockchainID][
                requestBridgeERC721Info.destinationBridgeAddress
            ][requestBridgeERC721Info.sourceTokenAddress][requestBridgeERC721Info.tokenIds[i]] = true;

            unchecked {
                i++;
            }
        }
        bytes memory messageData = _encodeMintERC721Data({
            originContractAddress: requestBridgeERC721Info.sourceTokenAddress,
            recipient: requestBridgeERC721Info.recipient,
            tokenIds: requestBridgeERC721Info.tokenIds
        });

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: requestBridgeERC721Info.destinationBlockchainID,
                destinationAddress: requestBridgeERC721Info.destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: address(0), amount: 0 }),
                requiredGasLimit: requiredGas,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );

        emit BridgeERC721({
            sourceTokenAddress: requestBridgeERC721Info.sourceTokenAddress,
            destinationBlockchainID: requestBridgeERC721Info.destinationBlockchainID,
            teleporterMessageID: messageID,
            destinationBridgeAddress: requestBridgeERC721Info.destinationBridgeAddress,
            sender: requestBridgeERC721Info.sender,
            recipient: requestBridgeERC721Info.recipient,
            tokenIds: requestBridgeERC721Info.tokenIds
        });
    }

    function _processERC1155Mint(RequestBridgeERC1155Info memory requestBridgeERC1155Info) private {
        uint256 tokenLength = requestBridgeERC1155Info.tokenIds.length;
        uint256 requiredGas = tokenLength * MINT_BRIDGE_TOKENS_REQUIRED_GAS;
        require(requiredGas < 15000000, "SourceBridge/overBlockGas: too much tokens");
        require(
            tokenLength == requestBridgeERC1155Info.amounts.length,
            "SourceBridge/wrongLength: ids and amount length mismatch"
        );
        for (uint256 i; i < tokenLength; ) {
            ERC1155(requestBridgeERC1155Info.sourceTokenAddress).safeTransferFrom(
                requestBridgeERC1155Info.sender,
                address(this),
                requestBridgeERC1155Info.tokenIds[i],
                requestBridgeERC1155Info.amounts[i],
                ""
            );

            bridgedFts[requestBridgeERC1155Info.destinationBlockchainID][
                requestBridgeERC1155Info.destinationBridgeAddress
            ][requestBridgeERC1155Info.sourceTokenAddress][
                requestBridgeERC1155Info.tokenIds[i]
            ] += requestBridgeERC1155Info.amounts[i];

            unchecked {
                i++;
            }
        }

        bytes memory messageData = _encodeMintERC1155Data({
            originContractAddress: requestBridgeERC1155Info.sourceTokenAddress,
            recipient: requestBridgeERC1155Info.recipient,
            tokenIds: requestBridgeERC1155Info.tokenIds,
            bridgeAmounts: requestBridgeERC1155Info.amounts
        });

        ITeleporterMessenger teleporterMessenger = _getTeleporterMessenger();
        bytes32 messageID = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: requestBridgeERC1155Info.destinationBlockchainID,
                destinationAddress: requestBridgeERC1155Info.destinationBridgeAddress,
                feeInfo: TeleporterFeeInfo({ feeTokenAddress: address(0), amount: 0 }),
                requiredGasLimit: requiredGas,
                allowedRelayerAddresses: _allowedRelayers,
                message: messageData
            })
        );

        emit BridgeERC1155({
            sourceTokenAddress: requestBridgeERC1155Info.sourceTokenAddress,
            destinationBlockchainID: requestBridgeERC1155Info.destinationBlockchainID,
            teleporterMessageID: messageID,
            destinationBridgeAddress: requestBridgeERC1155Info.destinationBridgeAddress,
            sender: requestBridgeERC1155Info.sender,
            recipient: requestBridgeERC1155Info.recipient,
            tokenIds: requestBridgeERC1155Info.tokenIds,
            amounts: requestBridgeERC1155Info.amounts
        });
    }
}
