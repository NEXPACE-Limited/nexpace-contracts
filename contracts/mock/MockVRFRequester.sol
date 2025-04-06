// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IVRFManager } from "../VRF/interfaces/IVRFManager.sol";
import { VRFRequester } from "../VRF/VRFRequester.sol";

contract MockVRFRequester is VRFRequester {
    constructor(IVRFManager vrfManager_) VRFRequester(vrfManager_) {}

    uint256 public requestId;
    mapping(uint256 => uint256[]) public randomWords;

    function changeVRFManager(IVRFManager vrfManager) external {
        _changeVRFManager(vrfManager);
    }

    function request() external {
        requestId = _requestVRF(1);
    }

    function fulfillVRF(uint256 _requestId, uint256[] memory _randomWords) external override onlyVRFManager {
        randomWords[_requestId] = _randomWords;
    }
}
