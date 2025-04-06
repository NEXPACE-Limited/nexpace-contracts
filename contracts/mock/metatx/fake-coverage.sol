// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { CreatorWallet } from "../../Creator/CreatorWallet/CreatorWallet.sol";
import { INextMeso } from "../../Creator/interfaces/INextMeso.sol";
import { ICreatorFactory } from "../../Creator/interfaces/ICreatorFactory.sol";
import { Commission } from "../../Commission/Commission.sol";
import { DAppRewardAllocationWallet } from "../../Creator/DAppRewardAllocationWallet/DAppRewardAllocationWallet.sol";
import { CreatorFactory } from "../../Creator/CreatorFactory.sol";
import { NXPCDistributor } from "../../NXPC/NXPCDistributor.sol";
import { NXPCAmountManager } from "../../NXPC/NXPCAmountManager.sol";
import { ItemIssuance } from "../../ItemIssuance/ItemIssuance.sol";

interface IMockFake {
    function fake() external;
}

contract MockCreatorWalletMetaTransactionFakeCoverage is
    CreatorWallet(address(1), INextMeso(address(1)), ICreatorFactory(address(1))),
    IMockFake
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockCommissionMetaTransactionFakeCoverage is IMockFake, Commission(address(1), IERC20(address(1))) {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockDAppRewardAllocationWalletMetaTransactionFakeCoverage is
    IMockFake,
    DAppRewardAllocationWallet(address(1))
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockCreatorFactoryMetaTransactionFakeCoverage is
    IMockFake,
    CreatorFactory(address(1), address(1), address(1), ItemIssuance(payable(address(1))))
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockNXPCDistributorMetaTransactionFakeCoverage is
    IMockFake,
    NXPCDistributor(address(1), address(1), address(1), address(1))
{
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockNXPCAmountManagerMetaTransactionFakeCoverage is IMockFake, NXPCAmountManager(address(1)) {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}

contract MockItemIssuanceMetaTransactionFakeCoverage is IMockFake, ItemIssuance(address(1), address(1), address(1)) {
    function fake() external view override {
        assert(_msgData().length == msg.data.length);
        assert(_msgSender() == msg.sender);
    }
}
