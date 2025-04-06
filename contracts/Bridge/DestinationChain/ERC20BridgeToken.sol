// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC20BridgeToken } from "./Interfaces/IERC20BridgeToken.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC20, ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ERC20Pausable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract ERC20BridgeToken is
    IERC20BridgeToken,
    ERC2771Context,
    ERC20Burnable,
    ERC20Pausable,
    NextOwnablePausable,
    Initializable
{
    string private _name;
    string private _symbol;
    uint8 private _decimals;
    address private _bridgeContract;

    modifier onlyBridge() {
        require(msg.sender == _bridgeContract, "BridgeToken/unauthorized: unauthorized");
        _;
    }

    constructor(address trustedForwarder, address admin_) ERC2771Context(trustedForwarder) ERC20("", "") {
        _transferOwnership(admin_);
        _disableInitializers();
    }

    function initialize(
        string memory tokenName_,
        string memory tokenSymbol_,
        uint8 decimals_,
        address initOwner_
    ) external initializer {
        _name = tokenName_;
        _symbol = tokenSymbol_;
        _decimals = decimals_;
        _bridgeContract = _msgSender();
        _transferOwnership(initOwner_);
    }

    function mint(address account, uint256 amount) external onlyBridge {
        _mint(account, amount);
    }

    function retrieve(address from, address to, uint256 amount, string memory reason) external onlyOwner {
        _transfer(from, to, amount);
        emit RetrievedERC20(from, to, amount, reason);
    }

    function setBridgeContract(address newBridge) external onlyOwner {
        address previousBridge = _bridgeContract;
        _bridgeContract = newBridge;
        emit BridgeContractChanged(previousBridge, _bridgeContract);
    }

    function getBridgeContract() external view returns (address) {
        return _bridgeContract;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function burnFrom(address account, uint256 amount) public override(ERC20Burnable, IERC20BridgeToken) onlyBridge {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        ERC20Pausable._beforeTokenTransfer(from, to, amount);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
