// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC20BridgeToken } from "../../Bridge/DestinationChain/Interfaces/IERC20BridgeToken.sol";
import { IERC721BridgeToken } from "../../Bridge/DestinationChain/Interfaces/IERC721BridgeToken.sol";
import { IERC1155BridgeToken } from "../../Bridge/DestinationChain/Interfaces/IERC1155BridgeToken.sol";
import { ERC20BridgeToken } from "../../Bridge/DestinationChain/ERC20BridgeToken.sol";
import { ERC721BridgeToken } from "../../Bridge/DestinationChain/ERC721BridgeToken.sol";
import { ERC1155BridgeToken } from "../../Bridge/DestinationChain/ERC1155BridgeToken.sol";
import { DestinationBridge } from "../../Bridge/DestinationChain/DestinationBridge.sol";
import { SourceBridge } from "../../Bridge/SourceChain/SourceBridge.sol";
import { ISourceBridge } from "../../Bridge/SourceChain/ISourceBridge.sol";
import { Teller } from "../../Bridge/Teller/Teller.sol";

interface IMockFake {
    function fake() external;
}

contract MockDestinationBridgeMetaTransactionFakeCoverage is IMockFake, DestinationBridge {
    constructor(
        address teleporterRegistryAddress
    )
        DestinationBridge(
            address(1),
            address(teleporterRegistryAddress),
            address(1),
            address(1),
            IERC20BridgeToken(address(1)),
            IERC721BridgeToken(address(1)),
            IERC1155BridgeToken(address(1))
        )
    {}

    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockERC20BridgeTokenMetaTransactionFakeCoverage is IMockFake, ERC20BridgeToken(address(1), address(1)) {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockERC721BridgeTokenMetaTransactionFakeCoverage is IMockFake, ERC721BridgeToken(address(1), address(1)) {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockERC1155BridgeTokenMetaTransactionFakeCoverage is IMockFake, ERC1155BridgeToken(address(1), address(1)) {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockSourceBridgeMetaTransactionFakeCoverage is IMockFake, SourceBridge {
    constructor(
        address teleporterRegistryAddress
    ) SourceBridge(address(1), address(teleporterRegistryAddress), address(1)) {}

    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockTellerMetaTransactionFakeCoverage is
    IMockFake,
    Teller(address(1), ISourceBridge(address(1)), address(1), address(1))
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}
