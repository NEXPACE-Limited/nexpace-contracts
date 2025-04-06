// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Commission } from "./Commission.sol";

/// @title CommissionForCreator - A contract for sending fees.
/// @dev Main feature
///      - commssion: Address to receive the commission
///      - token: Token that be paid as fees
contract CommissionForCreator is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Commission parameters
    /// @param commissionFrom A address of sender
    /// @param commissionTo A address of receiver(Commission contract)
    /// @param dAppId A id of dApp
    /// @param commissionAmount A amount of fees to send
    /// @param reason A reason for sending fees
    struct CommissionParams {
        address commissionFrom;
        address commissionTo;
        uint32 dAppId;
        uint256 commissionAmount;
        string reason;
    }

    /// @notice A address of Commission contract
    address private _commission;

    /// @notice A address of token that be paid as fees
    IERC20 private _token;

    /// @notice Emitted when the commission is sent
    /// @param commissionFrom A address of sender
    /// @param commissionTo A address of receiver(Commission contract)
    /// @param token A token address of paid
    /// @param amount A amount of fees to send
    /// @param dAppId A id of dApp
    /// @param reason A reason for sending fees
    event SendCommission(
        address indexed commissionFrom,
        address indexed commissionTo,
        address token,
        uint256 amount,
        uint32 indexed dAppId,
        string reason
    );

    /// @notice Emitted when the commission address is set
    /// @param prevCommission A address of previous commission
    /// @param newCommission A address of new commission
    event SetCommission(address indexed prevCommission, address indexed newCommission);

    /// @notice Emitted when the defult token address is set
    /// @param prevToken A address of previous erc20 token
    /// @param newToken A address of new erc20 token
    event SetToken(IERC20 indexed prevToken, IERC20 indexed newToken);

    modifier onlyValidCommission(address commission_) {
        require(
            commission_ != address(0),
            "CommissionForCreator/invalidRequest: address zero is not a valid commission"
        );
        _;
    }

    modifier onlyValidToken(IERC20 token_) {
        require(token_ != IERC20(address(0)), "CommissionForCreator/invalidRequest: address zero is not a valid token");
        _;
    }

    constructor(address commission_, IERC20 token_) onlyValidCommission(commission_) onlyValidToken(token_) {
        _commission = commission_;
        _token = token_;
    }

    /// @notice Set the commission address
    /// @param newCommission_ Address to get commission
    function setCommission(address newCommission_) external virtual onlyOwner onlyValidCommission(newCommission_) {
        _setCommission(newCommission_);
    }

    /// @notice Set the defult token address
    /// @param newToken_ Address to ERC20 token
    function setToken(IERC20 newToken_) external virtual onlyOwner onlyValidToken(newToken_) {
        emit SetToken(_token, newToken_);
        _token = newToken_;
    }

    /// @notice Get the commission address
    /// @return address Address to get commission
    function commission() external view returns (address) {
        return _commission;
    }

    /// @notice Get the token address
    function token() external view returns (IERC20) {
        return _token;
    }

    /**
     * @notice Collects fees for content usage in the dApp.
     * @param params The parameters for processing the commission
     *      - commissionFrom: The address from which the commission is transferred.
     *      - commissionTo: The address to which the commission is assigned.
     *      - commissionAmount: The amount of ERC-20 tokens to be transferred as commission.
     *      - dAppId: The identifier of the dApp associated with the commission.
     *      - reason: The reason or purpose of the commission.
     */
    function _sendCommission(CommissionParams memory params) internal {
        if (params.commissionAmount != 0) {
            _token.safeTransferFrom(params.commissionFrom, _commission, params.commissionAmount);
            Commission(_commission).afterDeposited(params.commissionTo, params.commissionAmount);
            emit SendCommission(
                params.commissionFrom,
                params.commissionTo,
                address(_token),
                params.commissionAmount,
                params.dAppId,
                params.reason
            );
        }
    }

    function _sendCommission(CommissionParams memory params, address tokenForCommission) internal {
        if (params.commissionAmount != 0) {
            IERC20(tokenForCommission).safeTransferFrom(params.commissionFrom, _commission, params.commissionAmount);
            Commission(_commission).afterDeposited(params.commissionTo, tokenForCommission, params.commissionAmount);
            emit SendCommission(
                params.commissionFrom,
                params.commissionTo,
                tokenForCommission,
                params.commissionAmount,
                params.dAppId,
                params.reason
            );
        }
    }

    /// @notice Set the commission address
    function _setCommission(address newCommission_) internal {
        emit SetCommission(_commission, newCommission_);
        _commission = newCommission_;
    }
}
