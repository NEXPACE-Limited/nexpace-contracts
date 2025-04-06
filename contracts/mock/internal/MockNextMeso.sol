// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Pausable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { ApproveControlled } from "@projecta/util-contracts/contracts/approve/ApproveControlled.sol";
import { ApproveController } from "@projecta/util-contracts/contracts/approve/ApproveController.sol";
import { ERC20ApproveControlled } from "@projecta/util-contracts/contracts/approve/token/ERC20ApproveControlled.sol";

contract MockNextMeso is
    ERC2771Context,
    ERC20("NextMeso", "NESO"),
    NextOwnablePausable,
    ERC20Pausable,
    ERC20ApproveControlled
{
    receive() external payable {
        deposit();
    }

    uint256 public immutable exchangeRate;

    constructor(
        address trustedForwarder,
        ApproveController controller_,
        uint256 exchangeRate_
    ) ERC2771Context(trustedForwarder) ApproveControlled(controller_) {
        exchangeRate = exchangeRate_;
    }

    event Deposit(address indexed to, uint256 amount, uint256 value);
    event Withdrawal(address indexed from, uint256 amount, uint256 value);
    event RetrievedNeso(address from, address to, uint256 amount, string reason);

    function withdraw(uint256 amount) external {
        require(amount >= exchangeRate, "NextMeso/wrongAmount: minimum amount is over 100,000");
        uint256 modulo = amount % exchangeRate;
        uint256 quotient = amount - modulo;
        uint256 exchangeValue = quotient / exchangeRate;
        _burn(_msgSender(), quotient);
        (bool success, ) = _msgSender().call{ value: exchangeValue }("");
        require(success, "NextMeso/transferFailed: failed to transfer NXPC");
        emit Withdrawal(_msgSender(), quotient, exchangeValue);
    }

    function retrieveNeso(address from, address to, uint256 amount, string memory reason) external onlyOwner {
        _transfer(from, to, amount);
        emit RetrievedNeso(from, to, amount, reason);
    }

    function balanceOfBatch(address[] memory accounts) external view returns (uint256[] memory) {
        uint256 accountsLength = accounts.length;
        uint256[] memory batchBalances = new uint256[](accountsLength);

        for (uint256 i; i < accountsLength; ++i) {
            batchBalances[i] = balanceOf(accounts[i]);
        }

        return batchBalances;
    }

    function deposit() public payable {
        require(msg.value != 0, "NextMeso/wrongValue: there is no value in message");
        uint256 amount = msg.value * exchangeRate;
        _mint(_msgSender(), amount);
        emit Deposit(_msgSender(), amount, msg.value);
    }

    /* trivial overrides */

    function allowance(
        address owner_,
        address spender
    ) public view override(ERC20, ERC20ApproveControlled) returns (uint256) {
        return ERC20ApproveControlled.allowance(owner_, spender);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Pausable) {
        ERC20Pausable._beforeTokenTransfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal override(ERC20, ERC20ApproveControlled) {
        ERC20ApproveControlled._approve(owner, spender, amount);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
