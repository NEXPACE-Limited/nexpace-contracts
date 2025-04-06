// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { ITeller } from "./ITeller.sol";
import { ISourceBridge } from "../SourceChain/ISourceBridge.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract Teller is ITeller, EIP712("Teller", "1.0"), ERC2771Context, NextOwnablePausable {
    using SafeERC20 for IERC20;

    address public constant NATIVE_TOKEN = 0x0200000000000000000000000000000000000001;
    ISourceBridge public immutable sourceBridgeAddress;

    address private requestSigner;
    address private neso;

    mapping(bytes32 => bool) public isfulfilled;

    constructor(
        address trustedForwarder,
        ISourceBridge sourceBridgeAddress_,
        address requestSigner_,
        address neso_
    ) ERC2771Context(trustedForwarder) {
        sourceBridgeAddress = sourceBridgeAddress_;
        requestSigner = requestSigner_;
        neso = neso_;
    }

    bytes32 internal constant REQUESTTOKENS_TYPEHASH =
        keccak256(
            "Request(bytes32 destinationBlockchainID,address destinationBridgeAddress,address sourceTokenAddress,address sender,address recipient,uint256 amount,address commissionTo,uint256 commissionAmount,uint256 deadline,uint256 salt)"
        );
    bytes32 internal constant REQUESTERC721_TYPEHASH =
        keccak256(
            "Request(bytes32 destinationBlockchainID,address destinationBridgeAddress,address sourceTokenAddress,address sender,address recipient,uint256[] tokenIds,address commissionTo,uint256 commissionAmount,uint256 deadline,uint256 salt)"
        );
    bytes32 internal constant REQUESTERC1155_TYPEHASH =
        keccak256(
            "Request(bytes32 destinationBlockchainID,address destinationBridgeAddress,address sourceTokenAddress,address sender,address recipient,uint256[] tokenIds,uint256[] amounts,address commissionTo,uint256 commissionAmount,uint256 deadline,uint256 salt)"
        );

    function bridgeTokensWithNXPC(
        BridgeTokensRequest calldata order,
        bytes calldata signature
    ) external payable whenNotPaused {
        {
            _validateRequest(order.sender, order.recipient, order.commissionTo, order.deadline);
            bytes32 orderHash = _requestTokens(order);
            _validateSignature(orderHash, requestSigner, signature);
            require(!isfulfilled[orderHash], "Teller/invalidOrderHash: used order hash");
            isfulfilled[orderHash] = true;
        }
        uint256 calculatedValue;
        if (order.sourceTokenAddress == NATIVE_TOKEN) {
            require(msg.value == order.amount + order.commissionAmount, "Teller/wrongValue: requested as wrong value");
            calculatedValue = order.amount;
        } else {
            require(msg.value == order.commissionAmount, "Teller/wrongValue: requested as wrong value");
        }
        (bool success, ) = order.commissionTo.call{ value: order.commissionAmount }("");
        require(success, "Teller/transferFailed: failed tokens");

        sourceBridgeAddress.bridgeTokens{ value: calculatedValue }(
            order.destinationBlockchainID,
            order.destinationBridgeAddress,
            order.sourceTokenAddress,
            order.sender,
            order.recipient,
            order.amount
        );
    }

    function bridgeERC721WithNXPC(
        BridgeERC721Request calldata order,
        bytes calldata signature
    ) external payable whenNotPaused {
        {
            _validateRequest(order.sender, order.recipient, order.commissionTo, order.deadline);
            bytes32 orderHash = _requestERC721(order);
            _validateSignature(orderHash, requestSigner, signature);
            require(!isfulfilled[orderHash], "Teller/invalidOrderHash: used order hash");

            require(msg.value == order.commissionAmount, "Teller/wrongValue: requested as wrong value");
            isfulfilled[orderHash] = true;
            (bool success, ) = order.commissionTo.call{ value: order.commissionAmount }("");
            require(success, "Teller/transferFailed: failed 721");
        }
        sourceBridgeAddress.bridgeERC721(
            order.destinationBlockchainID,
            order.destinationBridgeAddress,
            order.sourceTokenAddress,
            order.sender,
            order.recipient,
            order.tokenIds
        );
    }

    function bridgeERC1155WithNXPC(
        BridgeERC1155Request calldata order,
        bytes calldata signature
    ) external payable whenNotPaused {
        {
            require(
                order.tokenIds.length == order.amounts.length,
                "Teller/wrongLength: ids and amount length mismatch"
            );
            _validateRequest(order.sender, order.recipient, order.commissionTo, order.deadline);
            bytes32 orderHash = _requestERC1155(order);
            _validateSignature(orderHash, requestSigner, signature);
            require(!isfulfilled[orderHash], "Teller/invalidOrderHash: used order hash");

            require(msg.value == order.commissionAmount, "Teller/wrongValue: requested as wrong value");
            isfulfilled[orderHash] = true;
            (bool success, ) = order.commissionTo.call{ value: order.commissionAmount }("");
            require(success, "Teller/transferFailed: failed 1155");
        }

        sourceBridgeAddress.bridgeERC1155(
            order.destinationBlockchainID,
            order.destinationBridgeAddress,
            order.sourceTokenAddress,
            order.sender,
            order.recipient,
            order.tokenIds,
            order.amounts
        );
    }

    function bridgeTokensWithNESO(
        BridgeTokensRequest calldata order,
        bytes calldata signature
    ) external payable whenNotPaused {
        {
            _validateRequest(order.sender, order.recipient, order.commissionTo, order.deadline);
            bytes32 orderHash = _requestTokens(order);
            _validateSignature(orderHash, requestSigner, signature);
            require(!isfulfilled[orderHash], "Teller/invalidOrderHash: used order hash");
            isfulfilled[orderHash] = true;
        }
        uint256 calculatedValue;
        if (order.sourceTokenAddress == NATIVE_TOKEN) {
            require(msg.value == order.amount, "Teller/wrongValue: requested as wrong value");
            calculatedValue = order.amount;
        }
        IERC20(neso).safeTransferFrom(order.sender, order.commissionTo, order.commissionAmount);

        sourceBridgeAddress.bridgeTokens{ value: calculatedValue }(
            order.destinationBlockchainID,
            order.destinationBridgeAddress,
            order.sourceTokenAddress,
            order.sender,
            order.recipient,
            order.amount
        );
    }

    function bridgeERC721WithNESO(BridgeERC721Request calldata order, bytes calldata signature) external whenNotPaused {
        {
            _validateRequest(order.sender, order.recipient, order.commissionTo, order.deadline);
            bytes32 orderHash = _requestERC721(order);
            _validateSignature(orderHash, requestSigner, signature);
            require(!isfulfilled[orderHash], "Teller/invalidOrderHash: used order hash");
            isfulfilled[orderHash] = true;
            IERC20(neso).safeTransferFrom(order.sender, order.commissionTo, order.commissionAmount);
        }
        sourceBridgeAddress.bridgeERC721(
            order.destinationBlockchainID,
            order.destinationBridgeAddress,
            order.sourceTokenAddress,
            order.sender,
            order.recipient,
            order.tokenIds
        );
    }

    function bridgeERC1155WithNESO(
        BridgeERC1155Request calldata order,
        bytes calldata signature
    ) external whenNotPaused {
        {
            require(
                order.tokenIds.length == order.amounts.length,
                "Teller/wrongLength: ids and amount length mismatch"
            );
            _validateRequest(order.sender, order.recipient, order.commissionTo, order.deadline);
            bytes32 orderHash = _requestERC1155(order);
            _validateSignature(orderHash, requestSigner, signature);
            require(!isfulfilled[orderHash], "Teller/invalidOrderHash: used order hash");
            isfulfilled[orderHash] = true;
            IERC20(neso).safeTransferFrom(order.sender, order.commissionTo, order.commissionAmount);
        }
        sourceBridgeAddress.bridgeERC1155(
            order.destinationBlockchainID,
            order.destinationBridgeAddress,
            order.sourceTokenAddress,
            order.sender,
            order.recipient,
            order.tokenIds,
            order.amounts
        );
    }

    function setRequestSigner(address newRequestSigner) external onlyOwner {
        emit SetNewRequestSigner(requestSigner, newRequestSigner);
        requestSigner = newRequestSigner;
    }

    function setNeso(address newNeso) external onlyOwner {
        emit SetNewNeso(neso, newNeso);
        neso = newNeso;
    }

    function getRequestSigner() external view returns (address) {
        return requestSigner;
    }

    function getNeso() external view returns (address) {
        return neso;
    }

    function _validateSignature(bytes32 orderHash, address maker, bytes calldata signature) internal view {
        /* Calculate hash which must be signed. */
        bytes32 hashToSign = _hashTypedDataV4(orderHash);
        require(
            SignatureChecker.isValidSignatureNow(maker, hashToSign, signature),
            "Teller/invalidSignature: invalid signature"
        );
    }

    function _validateRequest(address from, address to, address commissionTo, uint256 deadline) internal view {
        require(_msgSender() == from, "Teller/invalidRequest: invalid requester");
        require(deadline >= block.timestamp, "Teller/invalidRequest: missed a deadline");
        require((to != address(0) && commissionTo != address(0)), "Teller/invalidRequest: invalid address");
    }

    function _requestTokens(BridgeTokensRequest calldata order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REQUESTTOKENS_TYPEHASH,
                    order.destinationBlockchainID,
                    order.destinationBridgeAddress,
                    order.sourceTokenAddress,
                    order.sender,
                    order.recipient,
                    order.amount,
                    order.commissionTo,
                    order.commissionAmount,
                    order.deadline,
                    order.salt
                )
            );
    }

    function _requestERC721(BridgeERC721Request calldata order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REQUESTERC721_TYPEHASH,
                    order.destinationBlockchainID,
                    order.destinationBridgeAddress,
                    order.sourceTokenAddress,
                    order.sender,
                    order.recipient,
                    keccak256(abi.encodePacked(order.tokenIds)),
                    order.commissionTo,
                    order.commissionAmount,
                    order.deadline,
                    order.salt
                )
            );
    }

    function _requestERC1155(BridgeERC1155Request calldata order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REQUESTERC1155_TYPEHASH,
                    order.destinationBlockchainID,
                    order.destinationBridgeAddress,
                    order.sourceTokenAddress,
                    order.sender,
                    order.recipient,
                    keccak256(abi.encodePacked(order.tokenIds)),
                    keccak256(abi.encodePacked(order.amounts)),
                    order.commissionTo,
                    order.commissionAmount,
                    order.deadline,
                    order.salt
                )
            );
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
