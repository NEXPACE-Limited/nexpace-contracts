// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { NextOwnable } from "@projecta/util-contracts/contracts/access/NextOwnable.sol";
import { CommissionForCreator } from "../Commission/CommissionForCreator.sol";

contract MockCreator is CommissionForCreator, NextOwnable {
    constructor(address commission_, IERC20 token_) CommissionForCreator(commission_, token_) {}

    function contents(CommissionForCreator.CommissionParams memory params) public {
        _sendCommission(params);
    }

    function contentsWithOtherToken(CommissionForCreator.CommissionParams memory params, address token) public {
        _sendCommission(params, token);
    }
}
