// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { MockDestinationBridge } from "./MockDestinationBridge.sol";
import { MockSourceBridge } from "./MockSourceBridge.sol";
import { ISourceBridge } from "../Bridge/SourceChain/ISourceBridge.sol";

contract MockReentrantAttack {
    bytes32 public destChainID_;
    bytes32 public sourceChainID_;
    address public destBridge_;
    address public sourceBridge_;
    uint8 public tokenType_;
    uint256[] public tokenId_;
    bytes public fakeData;

    constructor(bytes32 destChainID, bytes32 sourceChainID, address destBridge, address sourceBridge) {
        destChainID_ = destChainID;
        sourceChainID_ = sourceChainID;
        destBridge_ = destBridge;
        sourceBridge_ = sourceBridge;
        tokenId_ = [2];
        fakeData = abi.encodePacked(address(1));
    }

    function setTokenType_(uint8 _tokenType) external {
        tokenType_ = _tokenType;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) public returns (bytes4) {
        MockSourceBridge sourceBridge = MockSourceBridge(sourceBridge_);
        ISourceBridge.SourceTokenInfo memory fakeTokenInfo = ISourceBridge.SourceTokenInfo(address(1), uint8(1), "");

        if (tokenType_ == 1) {
            sourceBridge.bridgeTokens(destChainID_, destBridge_, address(1), address(1), address(this), 2000);
        } else if (tokenType_ == 2) {
            sourceBridge.bridgeERC721(destChainID_, destBridge_, address(1), address(1), address(this), tokenId_);
        } else if (tokenType_ == 3) {
            sourceBridge.bridgeERC1155(
                destChainID_,
                destBridge_,
                address(1),
                address(1),
                address(this),
                tokenId_,
                tokenId_
            );
        } else if (tokenType_ == 4) {
            sourceBridge.receiveMessage(destChainID_, destBridge_, fakeData);
        } else {
            sourceBridge.submitCreateBridgeToken(destChainID_, destBridge_, fakeTokenInfo);
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) public returns (bytes4) {
        MockDestinationBridge destBridge = MockDestinationBridge(destBridge_);

        if (tokenType_ == 1) {
            destBridge.bridgeTokens(sourceChainID_, sourceBridge_, address(1), address(this), 2000);
        } else if (tokenType_ == 2) {
            destBridge.bridgeERC721(sourceChainID_, sourceBridge_, address(1), address(this), tokenId_);
        } else if (tokenType_ == 3) {
            destBridge.bridgeERC1155(sourceChainID_, sourceBridge_, address(1), address(this), tokenId_, tokenId_);
        } else {
            destBridge.receiveMessage(sourceChainID_, sourceBridge_, fakeData);
        }
        return this.onERC1155BatchReceived.selector;
    }
}
