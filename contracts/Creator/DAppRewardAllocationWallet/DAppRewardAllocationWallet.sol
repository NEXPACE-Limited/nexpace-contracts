// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC721Holder } from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import { ERC1155Holder } from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import { Exec } from "@projecta/util-contracts/contracts/exec/Exec.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { ICreatorFactory } from "../interfaces/ICreatorFactory.sol";

/// @title DAppRewardAllocationWallet - A Contract for activities in a DAPP
/// @dev Main feature
///      - Mainly distributing assets to users
///      - Exec contracts are used to perform actions.
contract DAppRewardAllocationWallet is ERC2771Context, Exec, NextOwnablePausable, ERC721Holder, ERC1155Holder {
    using SafeERC20 for IERC20;

    ICreatorFactory public immutable creatorFactory;

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {
        creatorFactory = ICreatorFactory(_msgSender());
    }

    /// @notice Send ERC20 tokens back to the creator
    /// @dev It is implemented separately because processing related to NonWithdrawableERC20 needs to happen alongside token transfer.
    /// @param token ERC20 token address
    /// @param amount Amount of ERC20 token
    function deallocateERC20(IERC20 token, uint256 amount) external whenExecutable {
        address creatorWallet = creatorFactory.creatorAddressOfDApp(address(this));
        token.safeTransfer(creatorWallet, amount);
    }

    /// @notice Get the dApp Id
    /// @return uint32 dApp Id
    function dAppId() external view returns (uint32) {
        return creatorFactory.dAppId(address(this));
    }

    function _beforeExec() internal override whenExecutable {}

    /* trivial overrides */
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
