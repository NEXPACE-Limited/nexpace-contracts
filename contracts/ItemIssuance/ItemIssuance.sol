// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { INXPCAmountManager } from "../Interfaces/INXPCAmountManager.sol";

/// @title ItemIssuance - A contract to issue items
/// @dev Main features
///      - All ERC721 of Nexpace are created through this contract.
///      - Items are periodically added to the item pool of each Universe.
///      - Users can request item issuance by selecting the desired universe,
///        and when requesting, they must burn NXPC according to the ratio.
contract ItemIssuance is ERC2771Context, NextOwnablePausable {
    /* solhint-disable var-name-mixedcase */

    enum Status {
        REQUESTED,
        CONFIRMED,
        REJECTED
    }

    struct Universe {
        string name;
        uint256 poolAmount;
    }

    struct Request {
        uint256 universe;
        uint256 id;
        address requester;
        uint256 itemAmount;
        uint256 basketAmount;
        uint256 nxpcAmount;
        Status status;
    }

    /// @notice NXPCAmountManager contract address
    INXPCAmountManager public immutable NXPCAmountManager;

    address public blackhole;
    /* solhint-enable var-name-mixedcase */

    /// @notice Information of universes
    Universe[] private universes;

    /// @notice Information of requests
    mapping(uint256 => Request) public requests;

    /// @notice A universe number of Item721 Contract
    mapping(address => uint256) public universeOfItem721;

    /// @notice Number of requests
    uint256 private requestLength;

    /// @notice Emitted when a new universe is created
    /// @param universe An id of universe
    /// @param name A name of universe
    event UniverseCreated(uint256 indexed universe, string indexed name);

    /// @notice Emitted when record results of adding ERC721 items to the item pool
    /// @param universe An id of universe
    /// @param amount Amount of item
    event ItemAdded(uint256 indexed universe, uint256 amount);

    /// @notice Emitted when ERC721 items requested from item pool
    /// @param universe An id of universe
    /// @param id An id of request
    /// @param requester Address of requester
    /// @param itemAmount Amount of item
    /// @param nxpcAmount Amount of NXPC
    event ItemRequested(
        uint256 indexed universe,
        uint256 indexed id,
        address requester,
        uint256 itemAmount,
        uint256 basketAmount,
        uint256 nxpcAmount
    );

    /// @notice Emitted when request confirmed
    /// @param universe An id of universe
    /// @param id An id of request
    event RequestConfirmed(uint256 indexed universe, uint256 indexed id);

    /// @notice Emitted when request rejected
    /// @param universe An id of universe
    /// @param id An id of request
    event RequestRejected(uint256 indexed universe, uint256 indexed id);

    /// @notice Emitted when request rejected
    /// @param previousBlackhole Address of previous blackhole
    /// @param newBlackhole Address of new blackhole
    event SetBlackhole(address previousBlackhole, address indexed newBlackhole);

    /// @notice Emitted when a item721 contract is registered
    /// @param universe A id of universe
    /// @param item721Contract A address of ERC721 contract
    event Item721ContractRegistered(uint256 indexed universe, address indexed item721Contract);

    /// @notice Emitted when a item721 contract is unregistered
    /// @param item721Contract A address of ERC721 contract
    event Item721ContractUnregistered(address indexed item721Contract);

    /// @notice Emitted when the base amount of 721 items is added
    /// @param universe A id of universe
    /// @param tokenAddress A address of ERC721 contract
    /// @param itemId A id of ERC721 items
    /// @param newLimitSupply A new base amount of ERC721 items in the item pool after adding
    event ItemBaseAmountAdded(
        uint256 indexed universe,
        address indexed tokenAddress,
        uint256 indexed itemId,
        uint256 newLimitSupply
    );

    /// @notice Check if the universe exists
    /// @param universe An id of universe
    modifier whenUniverseExists(uint256 universe) {
        require(1 <= universe && universe <= universes.length, "ItemIssuance/invalidUniverse: nonexistent universe");
        _;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "ItemIssuance/invalidAddress: couldn't be zero address");
        _;
    }

    /* solhint-disable var-name-mixedcase */

    constructor(
        address trustedForwarder,
        address _blackhole,
        address _NXPCAmountManager
    )
        ERC2771Context(trustedForwarder)
        validAddress(trustedForwarder)
        validAddress(_blackhole)
        validAddress(_NXPCAmountManager)
    {
        blackhole = _blackhole;
        NXPCAmountManager = INXPCAmountManager(_NXPCAmountManager);
    }

    /* solhint-enable var-name-mixedcase */
    /* trivial overrides */

    /// @notice Create a new universe
    /// @param name A name of universe
    function createUniverse(string calldata name) external onlyOwner {
        require(bytes(name).length > 0, "ItemIssuance/invalidRequest: length of name must be bigger than 0");
        universes.push(Universe({ name: name, poolAmount: 0 }));
        emit UniverseCreated(universes.length, name);
    }

    /// @notice Add item to pool
    /// @param universe An id of universe
    /// @param amount Amount of item
    function addItem(uint256 universe, uint256 amount) external whenUniverseExists(universe) whenExecutable {
        universes[universe - 1].poolAmount += amount;

        emit ItemAdded(universe, amount);
    }

    /// @notice Request an item by sending NXPC
    /// @param universe An id of universe
    /// @param itemAmount Amount of item
    /// @param basketAmount Amount of basket
    function requestItemIssuance(
        uint256 universe,
        uint256 itemAmount,
        uint256 basketAmount
    ) external payable whenUniverseExists(universe) {
        uint256 nxpcAmount = msg.value;
        address requester = _msgSender();

        require(universes[universe - 1].poolAmount >= itemAmount, "ItemIssuance/invalidAmount: too large amount");
        require(nxpcAmount > 0, "ItemIssuance/invalidAmount: zero value is not allowed");

        requestLength++;

        requests[requestLength] = Request({
            universe: universe,
            id: requestLength,
            requester: requester,
            itemAmount: itemAmount,
            basketAmount: basketAmount,
            nxpcAmount: nxpcAmount,
            status: Status.REQUESTED
        });

        emit ItemRequested(universe, requestLength, requester, itemAmount, basketAmount, nxpcAmount);
    }

    /// @notice After checking the request, approve or reject it
    /// @param universe An id of universe
    /// @param requestId An id of request
    /// @param isConfirmed Confirmed or rejected
    function confirmRequest(
        uint256 universe,
        uint256 requestId,
        bool isConfirmed
    ) external whenUniverseExists(universe) whenExecutable {
        Request storage request = requests[requestId];

        require(request.status == Status.REQUESTED, "ItemIssuance/invalidStatus: already confirmed");
        require(request.universe == universe, "ItemIssuance/invalidRequest: universe id doesn't match");

        address target;

        if (isConfirmed) {
            request.status = Status.CONFIRMED;
            target = blackhole;

            INXPCAmountManager(NXPCAmountManager).addBurnedAmount(request.nxpcAmount);
            universes[universe - 1].poolAmount -= request.itemAmount;

            emit RequestConfirmed(universe, requestId);
        } else {
            request.status = Status.REJECTED;
            target = request.requester;

            emit RequestRejected(universe, requestId);
        }

        Address.sendValue(payable(target), request.nxpcAmount);
    }

    /// @notice Sets a new blackhole address.
    /// @param newBlackhole The new blackhole address.
    function setBlackhole(address newBlackhole) external onlyOwner validAddress(newBlackhole) {
        emit SetBlackhole(blackhole, newBlackhole);
        blackhole = newBlackhole;
    }

    /// @notice Register a item721 contract
    /// @param universe A id of universe
    /// @param item721Contract A address of ERC721 contract
    function registerItem721Contract(
        uint256 universe,
        address item721Contract
    ) external whenUniverseExists(universe) validAddress(item721Contract) onlyOwner {
        _registerItem721Contract(universe, item721Contract);
    }

    /// @notice Unregister a item721 contract
    /// @param item721Contract A address of ERC721 contract
    function unregisterItem721Contract(address item721Contract) external onlyOwner {
        _unregisterItem721Contract(item721Contract);
    }

    /// @notice Increases the base amount of an item within the specified universe for ERC721 tokens
    /// @param itemId The ID of the item to increase the base amount for
    /// @param newLimitSupply The amount to add to the base amount of the item
    function addItem721BaseAmount(
        uint256 itemId,
        uint256 newLimitSupply
    ) external whenUniverseExists(universeOfItem721[_msgSender()]) {
        emit ItemBaseAmountAdded(universeOfItem721[_msgSender()], _msgSender(), itemId, newLimitSupply);
    }

    /// @notice Returns
    /// @param universe An id of universe
    /// @param amount Amount of item
    function expectAmount(uint256 universe, uint256 amount) public view whenUniverseExists(universe) returns (uint256) {
        uint256 itemAmount = universes[universe - 1].poolAmount;

        require(amount <= itemAmount, "ItemIssuance/invalidAmount: too large amount");

        return Math.ceilDiv(NXPCAmountManager.totalSupply() * amount, itemAmount);
    }

    /// @notice Returns the required NXPC amounts
    /// @param universe An id of universe
    function itemPoolAmount(uint256 universe) external view whenUniverseExists(universe) returns (uint256) {
        return universes[universe - 1].poolAmount;
    }

    /// @notice Retrieve the name of a specific universe
    /// @param universe The identifier of the universe to retrieve the name for
    /// @return string The name of the specified universe
    function universeName(uint256 universe) external view whenUniverseExists(universe) returns (string memory) {
        return universes[universe - 1].name;
    }

    /// @notice Register a item721 contract
    /// @param universe A id of universe
    /// @param item721Contract A address of ERC721 contract
    function _registerItem721Contract(uint256 universe, address item721Contract) internal {
        require(universeOfItem721[item721Contract] == 0, "ItemIssuance/invalidAddress: already registered");
        universeOfItem721[item721Contract] = universe;

        emit Item721ContractRegistered(universe, item721Contract);
    }

    /// @notice Unregister a item721 contract
    /// @param item721Contract A address of ERC721 contract
    function _unregisterItem721Contract(address item721Contract) internal {
        require(universeOfItem721[item721Contract] != 0, "ItemIssuance/invalidAddress: not registered");
        delete universeOfItem721[item721Contract];

        emit Item721ContractUnregistered(item721Contract);
    }

    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
