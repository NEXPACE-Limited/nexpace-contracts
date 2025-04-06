// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { CreatorTokenControllerUpgradeable } from "../Creator/utils/CreatorTokenControllerUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockCreatorTokenControllerUpgradeable is Initializable, CreatorTokenControllerUpgradeable {
    function initialize() public initializer {
        __CreatorTokenController_init();
    }

    function f() public {
        __CreatorTokenController_init();
    }

    function g() public {
        __CreatorTokenController_init_unchained();
    }

    function withdrawERC20(IERC20 token, address account, uint256 amount) external override {}

    function allocateERC20(IERC20 token, address account, uint256 amount) external override {}
}
