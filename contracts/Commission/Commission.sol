// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

/// @title Commission - A contract that manages the fees received
/// @dev Main feature
///      - claim: Claim the fees received
///      - burn: Burn the fees received
contract Commission is ERC2771Context, NextOwnablePausable {
    using SafeERC20 for IERC20;

    /// @notice Token that be paid as fees
    IERC20 private _token;

    mapping(address => uint256) private _latestTokenAmount;

    mapping(address => mapping(address => uint256)) private _creatorFees;

    /// @notice Emitted when the fees are deposited
    event Deposited(address indexed creator, address token, uint256 amount, uint256 totalAmount);

    /// @notice Emitted when the fees are claimed
    event Claimed(
        address indexed creator,
        address claimToken,
        uint256 claimAmount,
        uint256 burnAmount,
        uint256 remainAmount
    );

    /// @notice Emitted when the defult token address is set
    /// @param prevToken A address of previous erc20 token
    /// @param newToken A address of new erc20 token
    event SetToken(IERC20 indexed prevToken, IERC20 indexed newToken);

    modifier validAddress(address addr) {
        require(addr != address(0), "Commission: couldn't be zero address");
        _;
    }

    /// @dev Set the values of {_token}.
    constructor(
        address trustedForwarder,
        IERC20 token_
    ) validAddress(trustedForwarder) validAddress(address(token_)) ERC2771Context(trustedForwarder) {
        _token = IERC20(token_);
    }

    /// @notice Claim the fees received
    /// @param creator A address of creator to claim
    /// @param claimAmount A amount of fees to claim
    function claim(address creator, uint256 claimAmount) external whenExecutable {
        require(_creatorFees[address(_token)][creator] >= claimAmount, "Commission: insufficient funds to claim");

        _creatorFees[address(_token)][creator] -= claimAmount;
        _latestTokenAmount[address(_token)] -= claimAmount;

        _token.safeTransfer(creator, claimAmount);

        emit Claimed(creator, address(_token), claimAmount, 0, _creatorFees[address(_token)][creator]);
    }

    /// @notice Allows an executor to claim tokens from the contract, transferring a portion to the creator and burning the rest
    /// @param creator The address of the creator who will receive a portion of the claimed tokens
    /// @param claimTokenAddress The address of the token being claimed
    /// @param claimAmount The amount of tokens to be transferred to the creator
    /// @param burnAmount The amount of tokens to be burned
    function claim(
        address creator,
        address claimTokenAddress,
        uint256 claimAmount,
        uint256 burnAmount
    ) external whenExecutable {
        require(
            _creatorFees[claimTokenAddress][creator] >= claimAmount + burnAmount,
            "Commission: insufficient funds to claim and burn"
        );

        _creatorFees[claimTokenAddress][creator] -= claimAmount + burnAmount;
        _latestTokenAmount[claimTokenAddress] -= claimAmount + burnAmount;

        IERC20(claimTokenAddress).safeTransfer(creator, claimAmount);
        if (burnAmount != 0) {
            ERC20Burnable(claimTokenAddress).burn(burnAmount);
        }

        emit Claimed(creator, claimTokenAddress, claimAmount, burnAmount, _creatorFees[claimTokenAddress][creator]);
    }

    /// @notice Updates the contract state after tokens are deposited by a creator
    /// @notice The function should execute whenever an ERC-20 commission is transferred to the contract
    /// @param creator The address of the creator who deposited the tokens
    /// @param amount The amount of tokens deposited
    function afterDeposited(address creator, uint256 amount) external {
        require(
            amount <= _token.balanceOf(address(this)) - _latestTokenAmount[address(_token)],
            "Commission: insufficient balance"
        );
        _creatorFees[address(_token)][creator] += amount;
        _latestTokenAmount[address(_token)] += amount;

        emit Deposited(creator, address(_token), amount, _creatorFees[address(_token)][creator]);
    }

    /// @notice Updates the contract state after tokens are deposited by a creator
    /// @notice The function should execute whenever an ERC-20 commission is transferred to the contract
    /// @param creator The address of the creator who deposited the tokens
    /// @param tokenForCommission The address for commission
    /// @param amount The amount of tokens deposited
    function afterDeposited(address creator, address tokenForCommission, uint256 amount) external {
        require(
            amount <= IERC20(tokenForCommission).balanceOf(address(this)) - _latestTokenAmount[tokenForCommission],
            "Commission: insufficient balance"
        );
        _creatorFees[tokenForCommission][creator] += amount;
        _latestTokenAmount[tokenForCommission] += amount;

        emit Deposited(creator, tokenForCommission, amount, _creatorFees[tokenForCommission][creator]);
    }

    /// @notice Set the defult token address
    /// @param newToken_ Address to ERC20 token
    function setToken(IERC20 newToken_) external virtual onlyOwner validAddress(address(newToken_)) {
        emit SetToken(_token, newToken_);
        _token = newToken_;
    }

    /// @notice Get the fees received
    /// @param creator A address of creator to get
    /// @return amount A amount of fees received
    function creatorFee(address creator) external view returns (uint256 amount) {
        return _creatorFees[address(_token)][creator];
    }

    /// @notice Get the fees received
    /// @param creator A address of creator to get
    /// @param tokenAddress A address of token to get
    /// @return amount A amount of fees received
    function creatorFee(address creator, address tokenAddress) external view returns (uint256 amount) {
        return _creatorFees[tokenAddress][creator];
    }

    /// @notice Get the token address
    /// @return IERC20 A address of token
    function token() external view returns (IERC20) {
        return _token;
    }

    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
