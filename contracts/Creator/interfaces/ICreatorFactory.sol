// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ItemIssuance } from "../../ItemIssuance/ItemIssuance.sol";

/// @title ICreatorFactory - Interface of CreatorFactory
interface ICreatorFactory {
    struct Creator {
        string name;
        address account;
    }
    struct DApp {
        uint32 creatorId;
        bool isActive;
        address account;
        string name;
    }
    struct Reward {
        address payable creatorAddress;
        uint256 nxpcAmount;
        IERC20[] tokens;
        uint256[] amounts;
    }

    event CreatorAdded(uint32 id, string name, address account);
    event CreatorNameChanged(uint32 id, string previousName, string newName);
    event CreatorOfDAppChanged(uint32 dAppId_, uint32 creatorId_);
    event DAppAdded(uint32 id, string name, address account);
    event DAppNameChanged(uint32 id, string previousName, string newName);
    event DAppOwnerChanged(address previousDAppOwner, address newDAppOwner);
    event DAppActivationChanged(uint32 id, bool newIsActive);
    event NXPCRewardAllocated(address indexed account, uint256 amount);
    event ERC20RewardAllocated(address indexed account, IERC20 indexed token, uint256 amount);

    function addCreator(string calldata name, address[] memory owners, uint256 threshold) external;

    function addDApp(uint32 creatorId_, string calldata name, address executor) external;

    function setCreatorName(uint32 id, string calldata newName) external;

    function setDAppName(uint32 id, string calldata newName) external;

    function setDAppOwner(address newDAppOwner) external;

    function setDAppActivation(uint32 id, bool isActive) external;

    function setCreatorOfDApp(uint32 dAppId_, uint32 creatorId_) external;

    function isActiveDApp(uint32 dAppId_) external view returns (bool);

    function dAppOwner() external view returns (address);

    function creatorAddress(uint32 creatorId_) external view returns (address);

    function creatorAddressOfDApp(address dAppAddress_) external view returns (address);

    function creatorAddressOfDApp(uint32 dAppId_) external view returns (address);

    function creatorId(address creatorAddress_) external view returns (uint32);

    function creatorIdOfDApp(address dAppAddress_) external view returns (uint32);

    function creatorIdOfDApp(uint32 dAppId_) external view returns (uint32);

    function creatorName(address creatorAddress_) external view returns (string memory);

    function creatorName(uint32 creatorId_) external view returns (string memory);

    function dAppAddress(uint32 dAppId_) external view returns (address);

    function dAppId(address dAppAddress_) external view returns (uint32);

    function dAppName(address dAppAddress_) external view returns (string memory);

    function dAppName(uint32 dAppId_) external view returns (string memory);

    function creatorBeacon() external view returns (address);

    function itemIssuance() external view returns (ItemIssuance);

    function isConnected(uint32 creatorId_, uint32 dAppId_) external view returns (bool);

    function isConnected(uint32 creatorId_, address dAppAddress_) external view returns (bool);

    function isConnected(address crestorAddress_, uint32 dAppId_) external view returns (bool);

    function isConnected(address crestorAddress_, address dAppAddress_) external view returns (bool);
}
