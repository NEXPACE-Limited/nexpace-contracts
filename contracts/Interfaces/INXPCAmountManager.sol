// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface INXPCAmountManager {
    function totalSupply() external view returns (uint256);

    function addBurnedAmount(uint256 amount) external;

    function addMintedAmount(uint256 amount) external;
}
