// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import { MultisigUpgradeable } from "@projecta/multisig-contracts/contracts/MultisigUpgradeable.sol";
import { CreatorWalletLogicUpgradeable } from "./CreatorWalletLogicUpgradeable.sol";
import { INextMeso } from "../interfaces/INextMeso.sol";
import { ICreatorFactory } from "../interfaces/ICreatorFactory.sol";

/// @title CreatorWallet - The multisig wallet used by the creator for the creator activity
/// @dev Main feature
///      - multisig: This contract is a multisig wallet
///      - CreatorWalletLogicUpgradeable: The functions that this contract can send are defined.
contract CreatorWallet is ERC2771ContextUpgradeable, MultisigUpgradeable, CreatorWalletLogicUpgradeable {
    constructor(
        address trustedForwarder_,
        INextMeso nextMeso_,
        ICreatorFactory creatorFactory_
    ) ERC2771ContextUpgradeable(trustedForwarder_) CreatorWalletLogicUpgradeable(nextMeso_, creatorFactory_) {
        _disableInitializers();
    }

    function initialize(address[] memory owners_, uint256 threshold_) external initializer {
        __Multisig_init(owners_, threshold_);
        __CreatorWalletLogic_init();
    }

    /// @notice To use only the functions in CreatorWalletLogicUpgradeable, only allow transactions to be sent to the self address.
    function _beforeGenerateTransaction(Transaction[] memory transactions) internal view override {
        uint256 transactionsLength = transactions.length;
        for (uint i = 0; i < transactionsLength; ) {
            require(transactions[i].to == address(this), "CreatorWallet/invalidTo: to address must be a self");
            unchecked {
                i++;
            }
        }
    }

    /// @notice See {ERC2771ContextUpgradeable-_msgSender}.
    function _msgSender() internal view virtual override(Context, ERC2771ContextUpgradeable) returns (address sender) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /// @notice See {ERC2771ContextUpgradeable-_msgData}.
    function _msgData() internal view virtual override(Context, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }
}
