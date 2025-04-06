// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { VRFManager } from "../VRF/VRFManager.sol";
import { IVRFManager } from "../VRF/interfaces/IVRFManager.sol";

contract MockVRFManager is IVRFManager {
    mapping(uint256 => VRFRequest) private _vrfRequests; // [requestId] = VRFRequest

    function requestVRF(uint32 numWords) external override returns (uint256) {
        uint256 num = _requestVRF(numWords);
        _vrfRequests[num] = VRFRequest({ deadline: 0, numWords: numWords, requester: msg.sender, id: num });
        emit VRFRequestGenerated(msg.sender, num, 0, numWords);
        return num;
    }

    function retryRequestVRF(uint256 requestId) external override {
        VRFRequest memory requestedVRF = _vrfRequests[requestId];
        uint256 newRequestId = _requestVRF(uint32(requestId));
        _vrfRequests[newRequestId] = requestedVRF;
        delete _vrfRequests[requestId];
        emit VRFRequestRetried(msg.sender, requestId, newRequestId, 0);
    }

    function vrfRequester(address vrfRequesterAddress) external view returns (VRFRequester memory) {}

    function vrfRequest(uint256 requestId) external view returns (VRFRequest memory) {
        return _vrfRequests[requestId];
    }

    function fulfillVRF(uint256 requestId, uint256[] memory randomWords) external {
        _fulfillVRF(requestId, randomWords);
    }

    /// @notice Call the requester's callback function when the VRF request is fulfilled
    /* solhint-disable */
    function _fulfillVRF(uint256 requestId, uint256[] memory randomWords) internal virtual {
        VRFRequest memory requestedVRF = _vrfRequests[requestId];
        require(
            requestedVRF.deadline == 0 || block.timestamp < requestedVRF.deadline,
            "VRFManager/invalidRequestId: VRF request expired"
        );
        delete _vrfRequests[requestId];

        emit VRFRequestFulfilled(requestedVRF.requester, requestId);
    }

    /* solhint-enable */

    function _requestVRF(uint32 numWords) internal virtual returns (uint256) {
        return uint256(keccak256(abi.encodePacked(numWords, block.timestamp)));
    }
}
