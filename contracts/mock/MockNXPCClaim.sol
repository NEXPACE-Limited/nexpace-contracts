// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

contract MockNXPCClaim is NextOwnablePausable {
    bytes32 public configuredMerkleRoot;
    mapping(address => bool) public isClaimed;
    uint256 public claimedValue;
    uint256 public deadline;

    event SetReward(bytes32 indexed merkleRoot, uint256 deadline);
    event ExtendDeadline(bytes32 indexed merkleRoot, uint256 timestamp);
    event Claim(address indexed user, uint256 amount);
    event Close(bytes32 indexed merkleRoot, uint256 value);

    receive() external payable {}

    function setReward(bytes32 merkleRoot, uint256 deadline_) external whenExecutable {
        // require(deadline == 0, "NXPCClaim/invalidRequest: Already set");
        // require(deadline_ != 0, "NXPCClaim/invalidRequest: Wrong daedline");
        // require(merkleRoot != 0, "NXPCClaim/invalidRequest: Invalid merkleRoot");
        configuredMerkleRoot = merkleRoot;
        deadline = deadline_;

        claimedValue = 0; // MockContract에만 추가된 내용

        emit SetReward(merkleRoot, deadline);
    }

    function claim(address user, uint256 amount, bytes32[] calldata proof) external whenExecutable {
        require(!isClaimed[user], "NXPCClaim/invalidRequest: Already claimed");
        require(deadline > block.timestamp, "NXPCClaim/timeout: Time limit has expired");

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(user, amount))));

        require(MerkleProof.verify(proof, configuredMerkleRoot, leaf), "NXPCClaim/invalidRequest: Invalid proof");

        // isClaimed[user] = true;
        claimedValue += amount;

        (bool sent, ) = address(user).call{ value: amount }("");
        require(sent, "NXPCClaim/transferFailed: Transfer failed");

        emit Claim(user, amount);
    }

    function extendDeadline(uint256 newDeadline) external whenExecutable {
        require(newDeadline > deadline, "NXPCClaim/invalidRequest: passed time");
        require(deadline > block.timestamp, "NXPCClaim/timeout: Time limit has expired");
        deadline = newDeadline;

        emit ExtendDeadline(configuredMerkleRoot, deadline);
    }

    function afterDeadline(address to) external onlyOwner {
        require(block.timestamp > deadline, "NXPCClaim/invalidRequest: Deadline is not reached");
        _withdraw(to);
    }

    function emergencyWithdraw(address to) external onlyOwner whenPaused {
        _withdraw(to);
    }

    function _withdraw(address to) private {
        require(to != address(0), "NXPCClaim/invalidRequest: Invalid address");

        (bool sent, ) = address(to).call{ value: address(this).balance }("");
        require(sent, "NXPCClaim/transferFailed: Transfer failed");

        emit Close(configuredMerkleRoot, address(this).balance);
    }
}
