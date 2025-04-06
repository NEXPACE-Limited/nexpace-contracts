// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title IVRFManager - Interface of VRFManager
interface IVRFManager {
    struct VRFRequester {
        bool isVRFRequester;
        uint64 maxVRFPendingTime;
    }
    struct VRFRequest {
        uint64 deadline;
        uint32 numWords;
        address requester;
        uint256 id; // original request id
    }

    event VRFRequesterAdded(address indexed requesterAddress, uint64 indexed maxVRFPendingTime);
    event VRFRequesterRemoved(address indexed requesterAddress);
    event VRFRequestGenerated(
        address indexed requesterAddress,
        uint256 indexed requestId,
        uint64 indexed deadline,
        uint32 numWords
    );
    event VRFRequestRetried(
        address indexed requesterAddress,
        uint256 indexed previousRequestId,
        uint256 indexed newRequestId,
        uint64 deadline
    );
    event VRFRequestFulfilled(address indexed requesterAddress, uint256 indexed requestId);
    event MaxVRFPendingTimeChanged(
        address indexed requesterAddress,
        uint64 indexed previousTime,
        uint64 indexed newTime
    );

    function requestVRF(uint32 numWords) external returns (uint256);

    function retryRequestVRF(uint256 requestId) external;

    function vrfRequester(address vrfRequesterAddress) external view returns (VRFRequester memory);

    function vrfRequest(uint256 requestId) external view returns (VRFRequest memory);
}
