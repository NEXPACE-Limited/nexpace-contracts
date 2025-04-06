// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { SelfCallUpgradeable } from "@projecta/multisig-contracts/contracts/common/SelfCallUpgradeable.sol";
import { ItemIssuance } from "../../ItemIssuance/ItemIssuance.sol";
import { ICreatorFactory } from "../interfaces/ICreatorFactory.sol";
import { INextMeso } from "../interfaces/INextMeso.sol";
import { CreatorTokenControllerUpgradeable } from "../utils/CreatorTokenControllerUpgradeable.sol";

/// @title CreatorWalletLogicUpgradeable - A contract that defines the functions that CreatorWallet can call
/// @dev Main feature
///      - allocate various assets (ERC20, ERC721, ERC1155) to DAppWallet or withdraw them externally
///      - send a request to ItemIssuance to issue an item
///      - Upgradeable: The administrator can add functions that the creator can use.
contract CreatorWalletLogicUpgradeable is Initializable, SelfCallUpgradeable, CreatorTokenControllerUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice MSU currency
    INextMeso public immutable nextMeso;

    /// @notice CreatorFactory contract
    ICreatorFactory public immutable creatorFactory;

    /// @notice Emitted when the creator allocates items(ERC721, ERC1155) to the dApp
    /// @param dAppId A id of dApp
    /// @param hashedData A hashed data of items(Due to the large size of the data, it is stored as a hash value)
    event ItemsAllocated(uint32 dAppId, bytes hashedData);

    /// @dev Check if dAppId is owned by this creator
    /// @param dAppId A id of dApp
    modifier onlyOwnedDApp(uint32 dAppId) {
        require(
            creatorFactory.creatorIdOfDApp(dAppId) == creatorId(),
            "CreatorWalletLogicUpgradeable/forbidden: The dApp is not owned by the creator"
        );
        require(
            creatorFactory.isActiveDApp(dAppId),
            "CreatorWalletLogicUpgradeable/inactiveDApp: given an inactive id"
        );
        _;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "CreatorWalletLogicUpgradeable/validAddress: couldn't be zero address");
        _;
    }

    /// @dev Set the values of {creatorFactory}.
    constructor(
        INextMeso nextMeso_,
        ICreatorFactory creatorFactory_
    ) validAddress(address(nextMeso_)) validAddress(address(creatorFactory_)) {
        nextMeso = nextMeso_;
        creatorFactory = creatorFactory_;
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __CreatorWalletLogic_init() internal onlyInitializing {
        __CreatorWalletLogic_init_unchained();
        __CreatorTokenController_init_unchained();
        __SelfCall_init();
    }

    /* solhint-disable-next-line func-name-mixedcase */
    function __CreatorWalletLogic_init_unchained() internal onlyInitializing {}

    /// @notice Allocate ERC20 tokens to creator-owned dapp accounts
    /// @param token A address of ERC20 token
    /// @param dAppId A id of dApp
    /// @param amount A amount of ERC20 token
    function allocateERC20(IERC20 token, uint32 dAppId, uint256 amount) external isSelfCall onlyOwnedDApp(dAppId) {
        _allocateERC20(token, creatorFactory.dAppAddress(dAppId), amount);
    }

    /// @notice Allocate ERC20 tokens to creator-owned dapp accounts
    /// @param token A address of ERC20 token
    /// @param dAppAddress A address of dApp
    /// @param amount A amount of ERC20 token
    function allocateERC20(
        IERC20 token,
        address dAppAddress,
        uint256 amount
    ) external override isSelfCall onlyOwnedDApp(creatorFactory.dAppId(dAppAddress)) {
        _allocateERC20(token, creatorFactory.dAppAddress(creatorFactory.dAppId(dAppAddress)), amount);
    }

    /// @notice Records the allocation of items with their hashed data to creator-owned dapp accounts
    /// @param dAppId A id of dApp
    /// @param hashedData A hashed data of items
    function allocateItems(uint32 dAppId, bytes memory hashedData) external isSelfCall onlyOwnedDApp(dAppId) {
        emit ItemsAllocated(dAppId, hashedData);
    }

    /// @notice Withdraw ERC20 tokens to external accounts
    /// @param token A address of ERC20 token
    /// @param account A address of account of recipient
    /// @param amount A amount of ERC20 token
    function withdrawERC20(IERC20 token, address account, uint256 amount) external override isSelfCall {
        _withdrawERC20(token, account, amount);
    }

    /// @notice Transfer native token to any address
    /// @param to A address of recipient
    /// @param amount Value to send
    function transferNXPC(address to, uint256 amount) external isSelfCall {
        (bool success, ) = to.call{ value: amount }("");
        require(success, "CreatorWalletLogicUpgradeable/invalidAmount: failed to transfer NXPC");
    }

    /// @notice Exchange nextMeso to NXPC
    /// @param amount Value to send
    function convertNesoToNXPC(uint256 amount) external isSelfCall {
        nextMeso.withdraw(amount);
    }

    /// @notice Transfer ERC721 token to any address
    /// @param token A address of ERC721 token
    /// @param to A address of recipient
    /// @param tokenId A id of ERC721 token
    function transferERC721(address token, address to, uint256 tokenId) external isSelfCall {
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
    }

    /// @notice Batch function of {tansferERC721}
    function batchTransferERC721(
        address token,
        address[] calldata to,
        uint256[] calldata tokenIds
    ) external isSelfCall {
        require(
            to.length == tokenIds.length,
            "CreatorWalletLogicUpgradeable/invalidLength: length of to and tokenIds must be same"
        );
        uint256 toLength = to.length;
        for (uint256 i; i < toLength; i++) {
            IERC721(token).safeTransferFrom(address(this), to[i], tokenIds[i]);
        }
    }

    /// @notice Transfer ERC1155 token to any address
    /// @param token A address of ERC1155 token
    /// @param to A address of recipient
    /// @param id A id of ERC1155 token
    /// @param amount A amount of ERC1155 token
    function transferERC1155(address token, address to, uint256 id, uint256 amount) external isSelfCall {
        IERC1155(token).safeTransferFrom(address(this), to, id, amount, "");
    }

    /// @notice Batch function of {transferERC1155}
    function batchTransferERC1155(
        address token,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external isSelfCall {
        IERC1155(token).safeBatchTransferFrom(address(this), to, ids, amounts, "");
    }

    /// @notice Request to issue an item
    /// @param universe A id of universe
    /// @param itemAmount A amount of item to issue
    /// @param basketAmount A amount of basket
    function requestItemIssuance(uint24 universe, uint96 itemAmount, uint256 basketAmount) external isSelfCall {
        ItemIssuance itemIssuance = creatorFactory.itemIssuance();
        uint256 requireNXPC = itemIssuance.expectAmount(universe, itemAmount);
        itemIssuance.requestItemIssuance{ value: requireNXPC }(universe, itemAmount, basketAmount);
    }

    /// @notice Get the creator id of this contract
    function creatorId() public view returns (uint32) {
        return creatorFactory.creatorId(address(this));
    }

    uint256[50] private __gap;
}
