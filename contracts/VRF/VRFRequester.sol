// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IVRFRequester } from "./interfaces/IVRFRequester.sol";
import { IVRFManager } from "./interfaces/IVRFManager.sol";

/// @title VRFRequester - A contract to request VRF
/// @dev Main features
///      - make VRF requests within VRFManager
abstract contract VRFRequester is IVRFRequester, Context {
    /// @notice An address of the VRFManager contract
    IVRFManager private _vrfManager;

    constructor(IVRFManager vrfManager_) {
        _vrfManager = vrfManager_;
    }

    /// @notice Check if the msg.sender is VRFManager
    modifier onlyVRFManager() {
        require(_msgSender() == address(_vrfManager), "VRFRequester/managerForbidden: caller is not the VRF manager");
        _;
    }

    /// @notice callback function when the VRF request is fulfilled
    function fulfillVRF(uint256 requestId, uint256[] memory randomWords) external virtual;

    /// @notice change the VRFManager
    function _changeVRFManager(IVRFManager newVRFManager) internal virtual {
        emit VRFManagerChanged(address(_vrfManager), address(newVRFManager));
        _vrfManager = newVRFManager;
    }

    /// @notice request VRF within VRFManager
    function _requestVRF(uint32 numWords) internal virtual returns (uint256) {
        return _vrfManager.requestVRF(numWords);
    }
}
