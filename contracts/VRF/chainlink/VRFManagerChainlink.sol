// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { VRFCoordinatorV2_5 } from "@chainlink/contracts/src/v0.8/dev/vrf/VRFCoordinatorV2_5.sol";
import { VRFV2PlusClient } from "@chainlink/contracts/src/v0.8/dev/vrf/libraries/VRFV2PlusClient.sol";
import { VRFManager } from "../VRFManager.sol";
import { VRFConsumerBaseV2Plus } from "./VRFConsumerBaseV2Plus.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

/// @title VRFManagerChainlink - Manage VRF Request and Requester using Chainlink
/// @dev Main feature
///      - Allows for the management of VRF requests using the Chainlink
contract VRFManagerChainlink is VRFConsumerBaseV2Plus, VRFManager, NextOwnablePausable {
    struct RequestConfig {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
    }

    VRFCoordinatorV2_5 private _coordinator;

    RequestConfig private _requestConfig;

    constructor(address coordinator_) VRFConsumerBaseV2Plus(coordinator_) {
        _coordinator = VRFCoordinatorV2_5(coordinator_);
    }

    receive() external payable {}

    function addVRFRequester(address requesterAddress, uint64 newMaxVRFPendingTime) external onlyOwner {
        _addVRFRequester(requesterAddress, newMaxVRFPendingTime);
    }

    function removeVRFRequester(address requesterAddress) external onlyOwner {
        _removeVRFRequester(requesterAddress);
    }

    function changeMaxVRFPendingTime(address requesterAddress, uint64 newTime) external onlyOwner {
        _changeMaxVRFPendingTime(requesterAddress, newTime);
    }

    /// @notice Set up the config to subscribe to a VRF
    function setConfig(bytes32 keyHash, uint16 requestConfirmations, uint32 callbackGasLimit) external onlyOwner {
        _requestConfig = RequestConfig({
            keyHash: keyHash,
            subId: _requestConfig.subId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit
        });
    }

    /// @notice Subscribe to a VRF
    function subscribe() external onlyOwner {
        require(_requestConfig.subId == 0, "VRFManagerChainlink/subscribeConflict: already subscribed");
        uint256 subId = _coordinator.createSubscription(); // never returns zero
        _requestConfig.subId = subId;
        _coordinator.addConsumer(subId, address(this));
        _topUpSubscription();
    }

    /// @notice Unsubscribe from a VRF
    function unsubscribe(address recipient) external onlyOwner {
        uint256 subId = _requestConfig.subId;
        require(subId != 0, "VRFManagerChainlink/unsubscribeConflict: not subscribed yet");
        _requestConfig.subId = 0;
        _coordinator.cancelSubscription(subId, recipient);
    }

    /// @notice Top-up all amount of link token to use VRF
    function topUpSubscription() external whenExecutable {
        _topUpSubscription();
    }

    /// @notice Get the current config
    function requestConfig() external view returns (RequestConfig memory) {
        return _requestConfig;
    }

    /// @notice Callback functions for using VRF
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        _fulfillVRF(requestId, randomWords);
    }

    /// @notice Top-up all amount of link token to use VRF
    function _topUpSubscription() internal {
        _coordinator.fundSubscriptionWithNative{ value: address(this).balance }(_requestConfig.subId);
    }

    /// @notice Request a random number
    function _requestVRF(uint32 numWords) internal override returns (uint256) {
        RequestConfig memory m = _requestConfig;
        return
            VRFCoordinatorV2_5(_coordinator).requestRandomWords(
                VRFV2PlusClient.RandomWordsRequest(
                    m.keyHash,
                    m.subId,
                    m.requestConfirmations,
                    m.callbackGasLimit,
                    numWords,
                    VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({ nativePayment: true }))
                )
            );
    }
}
