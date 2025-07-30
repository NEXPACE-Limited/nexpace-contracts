// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

/// @title ContributionRewardDistributor
/// @notice Distributes contribution rewards weekly based on a decaying exponential formula
/// @dev This contract guarantees accurate calculation of contribution rewards through the year 2100
contract ContributionRewardDistributor is ERC2771Context, NextOwnablePausable {
    /// @notice Thu May 15 2025 00:00:00 GMT+0400
    uint256 public constant BASE_TIMESTAMP = 1747252800;

    /// @notice Week duration in seconds
    uint256 public constant WEEK = 86400 * 7;

    /// @notice Precision factor for Taylor approximation (1e18)
    uint256 public constant TAYLOR_DECIMAL = 1e18;

    /// @notice Decimal precision for the result calculation
    uint256 public constant RESULT_DECIMAL = 1e3;

    /// @notice The address that receives distributed contribution rewards
    address public contributionRewardWallet;

    /// @notice Tracks if the reward for a given week (n) has been distributed
    mapping(uint256 => bool) public isDistributed;

    /// @notice Emitted when weekly reward is distributed
    /// @param week Week number being distributed
    /// @param transferAmount Reward amount for the week
    /// @param cumulativeAmount Cumulative total distributed amount till this week
    event Distributed(uint256 indexed week, uint256 transferAmount, uint256 cumulativeAmount);

    modifier validAddress(address addr) {
        require(addr != address(0), "ContributionRewardDistributor/invalidAddress: couldn't be zero address");
        _;
    }

    /// @param trustedForwarder Forwarder contract address
    /// @param _contributionRewardWallet ContributionRewardWallet contract address
    /// @param alreadyDistributed Number of weeks already distributed
    constructor(
        address trustedForwarder,
        address _contributionRewardWallet,
        uint256 alreadyDistributed
    ) ERC2771Context(trustedForwarder) validAddress(trustedForwarder) validAddress(_contributionRewardWallet) {
        contributionRewardWallet = _contributionRewardWallet;

        if (alreadyDistributed > 0) {
            require(
                (BASE_TIMESTAMP + alreadyDistributed * WEEK <= block.timestamp) &&
                    (BASE_TIMESTAMP + (alreadyDistributed + 1) * WEEK) > block.timestamp,
                "ContributionRewardDistributor/invalidDate: wrong distribution date"
            );

            for (uint256 i = 1; i <= alreadyDistributed; i++) {
                isDistributed[i] = true;
            }
        }
    }

    receive() external payable {}

    /// @notice Sets a new reward wallet
    /// @param newContributionRewardWallet New ContributionRewardWallet contract address
    function setContributionRewardWallet(
        address newContributionRewardWallet
    ) external onlyOwner validAddress(newContributionRewardWallet) {
        contributionRewardWallet = newContributionRewardWallet;
    }

    /// @notice Emergency function to withdraw NXPC from contract
    /// @param to Receiver address
    /// @param amount Amount to withdraw
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        (bool success, ) = to.call{ value: amount }("");
        require(success, "ContributionRewardDistributor/transferFailed: NXPC transfer failed");
    }

    /// @notice Distributes the reward for week `n`
    /// @param n Week number to distribute
    function distribute(uint256 n) external whenExecutable {
        require(!isDistributed[n], "ContributionRewardDistributor/alreadyDistributed: rewards already distributed");
        require(n != 0, "ContributionRewardDistributor/invalidWeek: week cannot be zero");
        require(
            block.timestamp >= BASE_TIMESTAMP + n * WEEK,
            "ContributionRewardDistributor/invalidDate: distribution date not reached"
        );

        isDistributed[n] = true;

        uint256 cumulativeRewardAmount = cumulativeAmount(n);
        uint256 previousRewardAmount = cumulativeAmount(n - 1);
        uint256 rewardAmount = cumulativeRewardAmount - previousRewardAmount;

        (bool success, ) = contributionRewardWallet.call{ value: rewardAmount }("");
        require(success, "ContributionRewardDistributor/transferFailed: NXPC transfer failed");

        emit Distributed(n, rewardAmount, cumulativeRewardAmount);
    }

    /// @notice Approximates e^(-x) using 33 terms of a Taylor series
    /// @param x Input value (scaled by TAYLOR_DECIMAL)
    /// @return Approximated result of e^(-x), scaled by TAYLOR_DECIMAL
    function taylorNegExp(uint256 x) internal pure returns (uint256) {
        uint256 terms = 33;
        uint256 term = TAYLOR_DECIMAL;
        uint256 sum = TAYLOR_DECIMAL;

        for (uint256 i = 1; i < terms; i++) {
            term = (term * x) / TAYLOR_DECIMAL / i;
            sum += term;
        }

        return (TAYLOR_DECIMAL ** 2) / sum;
    }

    /// @notice Calculates cumulative reward amount for week `n`
    /// @dev Based on a decaying exponential function: `1 - e^(-kx)`
    /// @param n Week number
    /// @return Cumulative reward amount in wei
    function cumulativeAmount(uint256 n) public pure returns (uint256) {
        uint256 x = (2666 * n * TAYLOR_DECIMAL) / 1e6;
        uint256 base = 8 * 1e8 * RESULT_DECIMAL;
        uint256 result = (base * (TAYLOR_DECIMAL - taylorNegExp(x))) / TAYLOR_DECIMAL;

        // Round to nearest 1 NXPC
        if (result % RESULT_DECIMAL >= RESULT_DECIMAL / 2) {
            return 1 ether * (result / RESULT_DECIMAL + 1);
        } else {
            return 1 ether * (result / RESULT_DECIMAL);
        }
    }

    /// @notice Returns the weekly reward amount for week `n`
    /// @param n Week number
    /// @return Amount of reward to be distributed at week `n`
    function transferAmount(uint256 n) public pure returns (uint256) {
        return n == 0 ? 0 : cumulativeAmount(n) - cumulativeAmount(n - 1);
    }

    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
