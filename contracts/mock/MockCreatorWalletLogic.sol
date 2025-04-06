// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { CreatorWalletLogicUpgradeable } from "../Creator/CreatorWallet/CreatorWalletLogicUpgradeable.sol";
import { ICreatorFactory } from "../Creator/interfaces/ICreatorFactory.sol";
import { INextMeso } from "../Creator/interfaces/INextMeso.sol";

contract MockCreatorWalletLogic is Initializable, CreatorWalletLogicUpgradeable {
    constructor(
        INextMeso neso_,
        ICreatorFactory creatorFactory_
    ) CreatorWalletLogicUpgradeable(neso_, creatorFactory_) {}

    function initialize() public initializer {
        __CreatorWalletLogic_init();
    }

    function f() public {
        __CreatorWalletLogic_init();
    }

    function g() public {
        __CreatorWalletLogic_init_unchained();
    }
}
