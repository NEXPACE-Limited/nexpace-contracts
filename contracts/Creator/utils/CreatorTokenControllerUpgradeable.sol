// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CreatorTokenControllerUpgradeable - A Contract to manage the amount of withdrawable and non-withdrawable tokens
abstract contract CreatorTokenControllerUpgradeable is Initializable {
    using SafeERC20 for IERC20;

    /// @notice Emitted when the creator balance is updated
    /// @param creatorAddress Creator address
    /// @param balance Creator target ERC20 balance
    event CreatorBalanceUpdated(address indexed creatorAddress, uint256 balance);

    /* solhint-disable-next-line func-name-mixedcase */
    function __CreatorTokenController_init() internal onlyInitializing {
        __CreatorTokenController_init_unchained();
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __CreatorTokenController_init_unchained() internal onlyInitializing {}

    /// @notice Withdraw ERC20 token
    function withdrawERC20(IERC20 token, address account, uint256 amount) external virtual;

    /// @notice Allocate ERC20 token
    function allocateERC20(IERC20 token, address account, uint256 amount) external virtual;

    /// @notice Withdraws the withdrawable amount
    /// @param token ERC20 token address to withdraw
    /// @param account Recipient address
    /// @param amount Amount of ERC20 token
    function _withdrawERC20(IERC20 token, address account, uint256 amount) internal {
        token.safeTransfer(account, amount);
    }

    /// @notice Allocate ERC20 token
    /// @dev Allocate is possible for all types of assets (withdrawable and non-withdrawable)
    /// @param token ERC20 token address to allocate
    /// @param account Recipient address
    /// @param amount Amount of ERC20 token
    function _allocateERC20(IERC20 token, address account, uint256 amount) internal {
        token.safeTransfer(account, amount);
    }

    uint256[49] private __gap;
}
