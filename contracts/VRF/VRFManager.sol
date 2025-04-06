// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IVRFRequester } from "./interfaces/IVRFRequester.sol";
import { IVRFManager } from "./interfaces/IVRFManager.sol";

/// @title VRFManager - Manage VRF Request and Requester
/// @dev Main feature
///      - Manages requests for VRF (Verifiable Random Function) and the requesters.
///      - Provides functions for managing VRF requests and their associated requesters.
///      - Allows specifying deadlines for requests and supports retry requests.
abstract contract VRFManager is IVRFManager, Context {
    /// @notice Mapping of the address to VRFRequester
    mapping(address => VRFRequester) private _vrfRequesters; // [address] = VRFRequester

    /// @notice Mapping of the requestId to VRFRequest
    mapping(uint256 => VRFRequest) private _vrfRequests; // [requestId] = VRFRequest

    /// @notice Check if the msg.sender is VRFRequester
    modifier onlyVRFRequester() {
        require(
            _vrfRequesters[_msgSender()].isVRFRequester,
            "VRFManager/requesterForbidden: caller is not the requester"
        );
        _;
    }

    /// @notice Request a set of random words
    /// @param numWords The number of uint256 random values to receive
    function requestVRF(uint32 numWords) external virtual override onlyVRFRequester returns (uint256) {
        uint256 requestId = _requestVRF(numWords);
        uint256 maxVRFPendingTime = _vrfRequesters[_msgSender()].maxVRFPendingTime;
        uint64 deadline = maxVRFPendingTime == 0 ? 0 : uint64(block.timestamp + maxVRFPendingTime);
        _vrfRequests[requestId] = VRFRequest({
            deadline: deadline,
            numWords: numWords,
            requester: _msgSender(),
            id: requestId
        });
        emit VRFRequestGenerated(_msgSender(), requestId, deadline, numWords);
        return requestId;
    }

    /// @notice Retry VRF request
    /// @param requestId The Id of VRF request to retry
    function retryRequestVRF(uint256 requestId) external virtual {
        uint64 deadline = _vrfRequests[requestId].deadline;
        require(deadline != 0, "VRFManager/invalidRequestId: VRF request doesn't have deadline");
        require(deadline <= block.timestamp, "VRFManager/invalidRequestId: VRF request is alive");
        _retryRequestVRF(requestId);
    }

    /// @notice Get VRF requester
    /// @param vrfRequesterAddress address of VRF requester
    function vrfRequester(address vrfRequesterAddress) external view virtual returns (VRFRequester memory) {
        return _vrfRequesters[vrfRequesterAddress];
    }

    /// @notice Get VRF request
    /// @param requestId The Id of VRF request
    function vrfRequest(uint256 requestId) external view virtual returns (VRFRequest memory) {
        return _vrfRequests[requestId];
    }

    /// @notice Request a set of random words
    function _requestVRF(uint32 numWords) internal virtual returns (uint256);

    /// @notice Call the requester's callback function when the VRF request is fulfilled
    function _fulfillVRF(uint256 requestId, uint256[] memory randomWords) internal virtual {
        VRFRequest memory requestInfo = _vrfRequests[requestId];
        require(
            requestInfo.deadline == 0 || block.timestamp < requestInfo.deadline,
            "VRFManager/invalidRequestId: VRF request expired"
        );
        delete _vrfRequests[requestId];
        IVRFRequester(requestInfo.requester).fulfillVRF(requestInfo.id, randomWords);

        emit VRFRequestFulfilled(requestInfo.requester, requestId);
    }

    /// @notice add new VRFRequester
    function _addVRFRequester(address requesterAddress, uint64 maxVRFPendingTime) internal virtual {
        require(
            !_vrfRequesters[requesterAddress].isVRFRequester,
            "VRFManager/invalidRequesterAddress: VRF Requester is already added"
        );
        _vrfRequesters[requesterAddress] = VRFRequester({ isVRFRequester: true, maxVRFPendingTime: maxVRFPendingTime });
        emit VRFRequesterAdded(requesterAddress, maxVRFPendingTime);
    }

    /// @notice remove VRFRequester
    function _removeVRFRequester(address requesterAddress) internal virtual {
        require(
            _vrfRequesters[requesterAddress].isVRFRequester,
            "VRFManager/invalidRequesterAddress: VRF Requester is not exist"
        );
        delete _vrfRequesters[requesterAddress];
        emit VRFRequesterRemoved(requesterAddress);
    }

    /// @notice Retry VRF request
    function _retryRequestVRF(uint256 requestId) internal virtual {
        VRFRequest memory requestInfo = _vrfRequests[requestId];
        uint256 newRequestId = _requestVRF(requestInfo.numWords);
        uint64 newDeadline = uint64(block.timestamp + _vrfRequesters[requestInfo.requester].maxVRFPendingTime);
        requestInfo.deadline = newDeadline;
        _vrfRequests[newRequestId] = requestInfo;
        delete _vrfRequests[requestId];

        emit VRFRequestRetried(requestInfo.requester, requestId, newRequestId, newDeadline);
    }

    /// @notice change MaxVRFPendingTime of VRF requester
    function _changeMaxVRFPendingTime(address requesterAddress, uint64 newTime) internal virtual {
        VRFRequester storage requester = _vrfRequesters[requesterAddress];
        emit MaxVRFPendingTimeChanged(requesterAddress, requester.maxVRFPendingTime, newTime);
        requester.maxVRFPendingTime = newTime;
    }
}
