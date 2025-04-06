// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { VRFCoordinatorV2Interface } from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/shared/interfaces/LinkTokenInterface.sol";
import { VRFConsumerBaseV2 } from "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { VRFManager } from "../VRFManager.sol";

/// @title VRFManagerHoracle - Manage VRF Request and Requester using Horacle
/// @dev Main feature
///      - Allows for the management of VRF requests using the Horacle
contract VRFManagerHoracle is VRFConsumerBaseV2, VRFManager, Ownable {
    struct RequestConfig {
        bytes32 keyHash;
        uint64 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
    }

    VRFCoordinatorV2Interface private immutable _coordinator;

    LinkTokenInterface private immutable _linkToken;

    RequestConfig private _requestConfig;

    constructor(address coordinator_, LinkTokenInterface linkToken_) VRFConsumerBaseV2(coordinator_) {
        _coordinator = VRFCoordinatorV2Interface(coordinator_);
        _linkToken = linkToken_;
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
        require(_requestConfig.subId == 0, "VRFManagerHoracle/subscribeConflict: already subscribed");
        uint64 subId = _coordinator.createSubscription(); // never returns zero
        _requestConfig.subId = subId;
        _coordinator.addConsumer(subId, address(this));
        _topUpSubscription();
    }

    /// @notice Unsubscribe from a VRF
    function unsubscribe(address recipient) external onlyOwner {
        uint64 subId = _requestConfig.subId;
        require(subId != 0, "VRFManagerHoracle/unsubscribeConflict: not subscribed yet");
        _requestConfig.subId = 0;
        _coordinator.cancelSubscription(subId, recipient);
    }

    /// @notice Top-up all amount of link token to use VRF
    function topUpSubscription() external onlyOwner {
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
        _linkToken.transferAndCall(
            address(_coordinator),
            _linkToken.balanceOf(address(this)),
            abi.encode(_requestConfig.subId)
        );
    }

    /// @notice Request a random number
    function _requestVRF(uint32 numWords) internal override returns (uint256) {
        RequestConfig memory m = _requestConfig;
        return
            VRFCoordinatorV2Interface(_coordinator).requestRandomWords(
                m.keyHash,
                m.subId,
                m.requestConfirmations,
                m.callbackGasLimit,
                numWords
            );
    }
}
