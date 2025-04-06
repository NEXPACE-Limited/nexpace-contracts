// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IEquip {
    function transferFrom(address, address, uint256) external;

    function tokenItemId(uint256) external view returns (uint64);

    function ownerOf(uint256) external view returns (address);
}
