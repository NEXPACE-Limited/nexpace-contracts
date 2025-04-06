// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockWarpMessenger {
    constructor() {}

    function sendWarpMessage(bytes calldata payload) external returns (bytes32 messageID) {
        return bytes32(payload);
    }

    function getBlockchainID() external view returns (bytes32 blockchainID) {
        return 0xc9e61ad36b830e9907447bd5088c40279c47a92d73ae8929a1f83a0aaf357a0c;
    }
}
