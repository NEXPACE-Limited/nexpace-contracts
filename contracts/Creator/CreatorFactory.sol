// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MinProxy } from "@projecta/min-proxy/contracts/MinProxy.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { DAppRewardAllocationWallet } from "./DAppRewardAllocationWallet/DAppRewardAllocationWallet.sol";
import { ItemIssuance } from "../ItemIssuance/ItemIssuance.sol";
import { ICreatorFactory } from "./interfaces/ICreatorFactory.sol";
import { CreatorWallet } from "./CreatorWallet/CreatorWallet.sol";

/// @title CreatorFactory - Manage creators and DApps wallets
/// @dev Main feature
///      - Creator and DApp creation and modification
///      - Reward(ERC20) distribution to each Creator
contract CreatorFactory is ICreatorFactory, ERC2771Context, NextOwnablePausable {
    using SafeERC20 for IERC20;

    /// @notice An trust forwarder address
    address private immutable _trustedForwarder;

    /// @notice An address of the CreatorBeacon contract
    address public immutable creatorBeacon;

    /// @notice An address of the ItemIssuance contract
    ItemIssuance public immutable itemIssuance;

    /// @notice An address to set as owner when creating a dApp
    address private _dAppOwner;

    /// @notice Array of creator information
    Creator[] private _creators;

    /// @notice Mapping of creator address to creator id
    mapping(address => uint32) private _creatorId; // [creator address] = creator id

    /// @notice Array of dApp information
    DApp[] private _dApps;

    /// @notice Mapping of dApp address to dApp id
    mapping(address => uint32) private _dAppId; // [dApp address] = dApp id

    /// @notice Check if the Creator with the given id exists
    modifier whenCreatorExists(uint32 id) {
        require(1 <= id && id <= _creators.length, "CreatorFactory/invalidCreatorId: given a non-existent id");
        _;
    }

    /// @notice Check if the DApp with the given id exists
    modifier whenDAppExists(uint32 id) {
        require(1 <= id && id <= _dApps.length, "CreatorFactory/invalidDAppId: given a non-existent id");
        _;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "CreatorFactory/validAddress: couldn't be zero address");
        _;
    }

    constructor(
        address trustedForwarder,
        address dAppOwner_,
        address creatorBeacon_,
        ItemIssuance itemIssuance_
    )
        validAddress(trustedForwarder)
        validAddress(dAppOwner_)
        validAddress(creatorBeacon_)
        validAddress(address(itemIssuance_))
        ERC2771Context(trustedForwarder)
    {
        _trustedForwarder = trustedForwarder;
        _dAppOwner = dAppOwner_;
        creatorBeacon = creatorBeacon_;
        itemIssuance = itemIssuance_;
    }

    receive() external payable {}

    /// @notice Create a new creator wallet
    /// @param name Name of the creator
    /// @param owners Array of owner addresses
    /// @param threshold Number of signatures required to execute a transaction
    function addCreator(string calldata name, address[] memory owners, uint256 threshold) external whenExecutable {
        address account = MinProxy.createBeaconProxy(creatorBeacon);
        CreatorWallet(payable(account)).initialize(owners, threshold);
        _creators.push(Creator({ name: name, account: account }));
        _creatorId[address(account)] = uint32(_creators.length);

        emit CreatorAdded(uint32(_creators.length), name, account);
    }

    /// @notice Allocate reward(NXPC, ERC20s) to a creator
    /// @param creatorAddress_ Creator address to receive the token
    /// @param nxpcAmount Amount of NXPC to allocate
    /// @param tokens Array of ERC20 token addresses to allocate
    /// @param amounts Array of ERC20 token amounts to allocate
    function allocateReward(
        address payable creatorAddress_,
        uint256 nxpcAmount,
        IERC20[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyOwner {
        _allocateReward(creatorAddress_, nxpcAmount, tokens, amounts);
    }

    /// @notice Batch function of allocateReward
    /// @param rewards Array of Reward struct
    function allocateRewardBatch(Reward[] calldata rewards) external onlyOwner {
        uint256 rewardsLength = rewards.length;
        for (uint256 i; i < rewardsLength; ) {
            _allocateReward(rewards[i].creatorAddress, rewards[i].nxpcAmount, rewards[i].tokens, rewards[i].amounts);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Create a new DApp wallet
    /// @param creatorId_ Creator id to create a dApp
    /// @param name Name of the dApp
    /// @param executor Address of the executor
    function addDApp(
        uint32 creatorId_,
        string calldata name,
        address executor
    ) external whenExecutable whenCreatorExists(creatorId_) {
        DAppRewardAllocationWallet dApp_ = new DAppRewardAllocationWallet(_trustedForwarder);
        dApp_.grantExecutor(executor);
        dApp_.transferOwnership(_dAppOwner);
        _dApps.push(DApp({ creatorId: creatorId_, isActive: true, name: name, account: address(dApp_) }));
        _dAppId[address(dApp_)] = uint32(_dApps.length);

        emit DAppAdded(uint32(_dApps.length), name, address(dApp_));
    }

    /// @notice Set name of a creator
    /// @param id Creator id to set name
    /// @param newName New name of the creator
    function setCreatorName(uint32 id, string calldata newName) external whenExecutable {
        emit CreatorNameChanged(id, _creators[id - 1].name, newName);
        _creators[id - 1].name = newName;
    }

    /// @notice Set name of a dApp
    /// @param id DApp id to set name
    /// @param newName New name of the dApp
    function setDAppName(uint32 id, string calldata newName) external whenExecutable {
        emit DAppNameChanged(id, _dApps[id - 1].name, newName);
        _dApps[id - 1].name = newName;
    }

    /// @notice Set DApp owner
    /// @param newDAppOwner New DApp owner address
    function setDAppOwner(address newDAppOwner) external onlyOwner {
        emit DAppOwnerChanged(_dAppOwner, newDAppOwner);
        _dAppOwner = newDAppOwner;
    }

    /// @notice Set DApp activation
    /// @param id DApp id to set activation
    /// @param isActive New activation status of the dApp
    function setDAppActivation(uint32 id, bool isActive) external whenExecutable whenDAppExists(id) {
        _dApps[id - 1].isActive = isActive;
        emit DAppActivationChanged(id, isActive);
    }

    /// @notice Set creator of dApp
    /// @param dAppId_ dApp id to set creator
    /// @param creatorId_ Creator id to set creator of dApp
    function setCreatorOfDApp(
        uint32 dAppId_,
        uint32 creatorId_
    ) external whenExecutable whenCreatorExists(creatorId_) whenDAppExists(dAppId_) {
        _dApps[dAppId_ - 1].creatorId = creatorId_;
        emit CreatorOfDAppChanged(dAppId_, creatorId_);
    }

    /// @notice Get dApp owner
    /// @return address Address of dApp owner
    function dAppOwner() external view returns (address) {
        return _dAppOwner;
    }

    /// @notice Get creator address by dApp address
    /// @param dAppAddress_ dApp address to get creator address
    /// @return address Address of dApp's creator
    function creatorAddressOfDApp(address dAppAddress_) external view returns (address) {
        return creatorAddress(creatorIdOfDApp(dAppAddress_));
    }

    /// @notice Get creator address by dApp id
    /// @param dAppId_ dApp id to get creator address
    /// @return address Address of dApp's creator
    function creatorAddressOfDApp(uint32 dAppId_) external view returns (address) {
        return creatorAddress(creatorIdOfDApp(dAppId_));
    }

    /// @notice Get creator name by creator address
    /// @param creatorAddress_ Creator address to get creator name
    /// @return string Name of creator
    function creatorName(address creatorAddress_) external view returns (string memory) {
        return creatorName(creatorId(creatorAddress_));
    }

    /// @notice Get dApp address by dApp id
    /// @param dAppId_ dApp id to get dApp address
    /// @return address Address of dapp
    function dAppAddress(uint32 dAppId_) external view whenDAppExists(dAppId_) returns (address) {
        return _dApps[dAppId_ - 1].account;
    }

    /// @notice Get dApp name by dApp address
    /// @param dAppAddress_ dApp address to get dApp name
    /// @return string Name of dApp
    function dAppName(address dAppAddress_) external view returns (string memory) {
        return dAppName(dAppId(dAppAddress_));
    }

    /// @notice Get connection status between creator and dApp by creator id and dApp address
    /// @param creatorId_ Creator id to check connection status
    /// @param dAppAddress_ dApp address to check connection status
    /// @return bool State of connection creator with dApp
    function isConnected(uint32 creatorId_, address dAppAddress_) external view returns (bool) {
        return isConnected(creatorId_, _dAppId[dAppAddress_]);
    }

    /// @notice Get connection status between creator and dApp by creator address and dApp id
    /// @param creatorAddress_ Creator address to check connection status
    /// @param dAppId_ dApp id to check connection status
    /// @return bool State of connection creator with dApp
    function isConnected(address creatorAddress_, uint32 dAppId_) external view returns (bool) {
        return isConnected(_creatorId[creatorAddress_], dAppId_);
    }

    /// @notice Get connection status between creator and dApp by creator address and dApp address
    /// @param creatorAddress_ Creator address to check connection status
    /// @param dAppAddress_ dApp address to check connection status
    /// @return bool State of connection creator with dApp
    function isConnected(address creatorAddress_, address dAppAddress_) external view returns (bool) {
        return isConnected(_creatorId[creatorAddress_], _dAppId[dAppAddress_]);
    }

    //// @notice Checks if a dApp is active
    /// @param dAppId_ The ID of the dApp to check
    /// @return bool Boolean indicating whether the specified DApp is active or not
    function isActiveDApp(uint32 dAppId_) public view returns (bool) {
        return _dApps[dAppId_ - 1].isActive;
    }

    /// @notice Get creator address by creator id
    /// @param creatorId_ Creator id to get creator address
    /// @return address Address of creator
    function creatorAddress(uint32 creatorId_) public view whenCreatorExists(creatorId_) returns (address) {
        return _creators[creatorId_ - 1].account;
    }

    /// @notice Get creatorId by creatorAddress
    /// @param creatorAddress_ Creator address to get creator id
    /// @return creatorId_ Creator Id of creator
    function creatorId(address creatorAddress_) public view returns (uint32 creatorId_) {
        creatorId_ = _creatorId[creatorAddress_];
        require(creatorId_ != 0, "CreatorFactory/invalidCreatorAddress: given a non-existent address");
    }

    /// @notice Get creator name by creatorId
    /// @param creatorId_ Creator id to get creator name
    /// @return string Name of creator
    function creatorName(uint32 creatorId_) public view whenCreatorExists(creatorId_) returns (string memory) {
        return _creators[creatorId_ - 1].name;
    }

    /// @notice Get dApp id by dApp address
    /// @param dAppAddress_ dApp address to get dApp id
    /// @return dAppId_ Id of dApp
    function dAppId(address dAppAddress_) public view returns (uint32 dAppId_) {
        dAppId_ = _dAppId[dAppAddress_];
        require(dAppId_ != 0, "CreatorFactory/invalidDAppAddress: given a non-existent address");
    }

    /// @notice Get dApp name by dApp id
    /// @param dAppId_ dApp id to get dApp name
    /// @return string Name of dApp
    function dAppName(uint32 dAppId_) public view whenDAppExists(dAppId_) returns (string memory) {
        return _dApps[dAppId_ - 1].name;
    }

    /// @notice Get creator id by dApp address
    /// @param dAppAddress_ dApp address to get creator id
    /// @return uint32 Creator id of dApp
    function creatorIdOfDApp(address dAppAddress_) public view returns (uint32) {
        return creatorIdOfDApp(dAppId(dAppAddress_));
    }

    /// @notice Get creator id by dApp id
    /// @param dAppId_ dApp id to get creator id
    /// @return uint32 Creator id of dApp
    function creatorIdOfDApp(uint32 dAppId_) public view whenDAppExists(dAppId_) returns (uint32) {
        return _dApps[dAppId_ - 1].creatorId;
    }

    /// @notice Get connection status between creator and dApp by creator id and dApp id
    /// @param creatorId_ Creator id to check connection status
    /// @param dAppId_ dApp id to check connection status
    /// @return bool State of connection creator with dApp
    function isConnected(uint32 creatorId_, uint32 dAppId_) public view returns (bool) {
        if (0 == creatorId_ || creatorId_ > _creators.length) return false;
        if (0 == dAppId_ || dAppId_ > _dApps.length) return false;
        return creatorId_ == _dApps[dAppId_ - 1].creatorId;
    }

    function _allocateReward(
        address payable creatorAddress_,
        uint256 nxpcAmount,
        IERC20[] calldata tokens,
        uint256[] calldata amounts
    ) internal whenCreatorExists(creatorId(creatorAddress_)) {
        uint256 tokensLength = tokens.length;
        require(tokensLength == amounts.length, "CreatorFactory/invalidLength: given arrays have different lengths");
        if (nxpcAmount > 0) {
            (bool success, ) = creatorAddress_.call{ value: nxpcAmount }("");
            require(success, "CreatorFactory/invalidAmount: failed to allocate NXPC");
            emit NXPCRewardAllocated(creatorAddress_, nxpcAmount);
        }
        for (uint256 i; i < tokensLength; ) {
            tokens[i].safeTransfer(creatorAddress_, amounts[i]);
            emit ERC20RewardAllocated(creatorAddress_, tokens[i], amounts[i]);
            unchecked {
                i++;
            }
        }
    }

    /* trivial overrides */
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
