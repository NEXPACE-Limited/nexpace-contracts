// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { CreatorWalletLogicUpgradeableV2 } from "../Creator/CreatorWalletV2/CreatorWalletLogicUpgradeableV2.sol";
import { ICreatorFactory } from "../Creator/interfaces/ICreatorFactory.sol";
import { INextMeso } from "../Creator/interfaces/INextMeso.sol";

contract MockCreatorWalletLogicV2 is Initializable, CreatorWalletLogicUpgradeableV2 {
    constructor(
        INextMeso neso_,
        ICreatorFactory creatorFactory_
    ) CreatorWalletLogicUpgradeableV2(neso_, creatorFactory_) {}

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
