// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title IVRFRequester - Interface of VRFRequester
interface IVRFRequester {
    event VRFManagerChanged(address previousManagerAddress, address newManagerAddress);

    function fulfillVRF(uint256 requestId, uint256[] memory randomWords) external;
}
