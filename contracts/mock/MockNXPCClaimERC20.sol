// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

contract MockNXPCClaimERC20 is NextOwnablePausable {
    using SafeERC20 for IERC20;

    bytes32 public configuredMerkleRoot;
    IERC20 public tokenAddress;
    mapping(address => bool) public isClaimed;
    uint256 public claimedAmount;
    uint256 public deadline;

    event SetReward(bytes32 indexed merkleRoot, uint256 deadline);
    event ExtendDeadline(bytes32 indexed merkleRoot, uint256 timestamp);
    event Claim(address indexed user, uint256 amount);
    event Close(bytes32 indexed merkleRoot, uint256 value);

    constructor(IERC20 _tokenAddress) {
        tokenAddress = _tokenAddress;
    }

    function setTokenAddress(IERC20 _tokenAddress) external onlyOwner {
        tokenAddress = _tokenAddress;
    }

    function setReward(bytes32 merkleRoot, uint256 deadline_) external whenExecutable {
        // require(deadline == 0, "NXPCClaim/invalidRequest: Already set");
        // require(deadline_ != 0, "NXPCClaim/invalidRequest: Wrong daedline");
        // require(merkleRoot != 0, "NXPCClaim/invalidRequest: Invalid merkleRoot");
        configuredMerkleRoot = merkleRoot;
        deadline = deadline_;

        emit SetReward(merkleRoot, deadline);
    }

    function claim(address user, uint256 amount, bytes32[] calldata proof) external {
        require(!isClaimed[user], "NXPCClaim/invalidRequest: Already claimed");
        require(deadline > block.timestamp, "NXPCClaim/timeout: Time limit has expired");

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(user, amount))));

        require(MerkleProof.verify(proof, configuredMerkleRoot, leaf), "NXPCClaim/invalidRequest: Invalid proof");

        require(
            IERC20(tokenAddress).balanceOf(address(this)) >= amount,
            "NXPCClaim/invalidRequest: Not enough balance"
        );
        isClaimed[user] = true;
        claimedAmount += amount;

        IERC20(tokenAddress).safeTransfer(user, amount);

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

        IERC20(tokenAddress).safeTransfer(to, IERC20(tokenAddress).balanceOf(address(this)));

        emit Close(configuredMerkleRoot, IERC20(tokenAddress).balanceOf(address(this)));
    }
}
