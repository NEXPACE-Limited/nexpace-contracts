// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { IEquip } from "../Interfaces/IEquip.sol";
import { INXPCAmountManager } from "../Interfaces/INXPCAmountManager.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";

/// @title NXPCDistributor
/// @notice NXPCDistributor contract is a contract that crowdsources a specific set of NFTs and pays NXPC
/// to participants in proportion to their participation stake when NFT collection is completed.
contract NXPCDistributor is ERC2771Context, NextOwnablePausable {
    /// @notice Equip contract address
    IEquip public immutable equip;

    /* solhint-disable var-name-mixedcase */
    /// @notice NXPCAmountManager contract address
    INXPCAmountManager public immutable NXPCAmountManager;
    /* solhint-enable var-name-mixedcase */

    address private _vault;

    /// @notice Current status
    bool private _isStarted;

    /// @notice Current round number
    uint256 private _currentRound;

    /// @notice Basket merkle root: keccak256(keccak256(round || itemId || slotLength))
    mapping(uint256 => bytes32) private _basketMerkleRoot;

    /// @notice Reward merkle root: keccak256(keccak256(round || address || NXPCAmount))
    mapping(uint256 => bytes32) private _rewardMerkleRoot;

    /// @notice Total basket length of round
    mapping(uint256 => uint256) private _basketLength;

    /// @notice Current length of basket
    mapping(uint256 => uint256) private _currentBasketLength;

    /// @notice Claimable status of round
    mapping(uint256 => bool) private _isClaimable;

    /// @notice Claimed status of leaf
    mapping(bytes32 => bool) private _isClaimed;

    /// @notice Current length of slot
    mapping(uint256 => mapping(uint64 => uint256)) private _currentSlotLength;

    /// @notice Current status of slot
    mapping(uint256 => mapping(uint64 => bool)) private _isFullSlot;

    /// @notice Current depositor of NFT
    mapping(uint256 => mapping(uint256 => address)) private _currentDepositor;

    event SetBasket(uint256 indexed round, bytes32 indexed merkleRoot);
    event SetReward(uint256 indexed round, bytes32 indexed merkleRoot);
    event SetVault(address indexed previousVault, address indexed newVault);
    event Start(uint256 indexed round);
    event End(uint256 indexed round);
    event Deposit(uint256 indexed round, uint256 tokenId, uint64 itemId, address indexed user);
    event Withdraw(uint256 indexed round, uint256 tokenId, uint64 itemId, address indexed user);
    event Claim(uint256 indexed round, uint256 value, address indexed user);
    event BasketIsFull(uint256 indexed round);

    modifier validAddress(address addr) {
        require(addr != address(0), "NXPCDistributor/invalidAddress: couldn't be zero address");
        _;
    }

    /* solhint-disable var-name-mixedcase */
    /// @dev Need CAs for deploy this contract
    /// @param trustedForwarder Forwarder contract address
    /// @param equip_ Equip contract address
    constructor(
        address trustedForwarder,
        address equip_,
        address NXPCAmountManager_,
        address vault_
    )
        ERC2771Context(trustedForwarder)
        validAddress(trustedForwarder)
        validAddress(equip_)
        validAddress(NXPCAmountManager_)
        validAddress(vault_)
    {
        equip = IEquip(equip_);
        NXPCAmountManager = INXPCAmountManager(NXPCAmountManager_);
        _currentRound = 1;
        _vault = vault_;
    }

    /* solhint-enable var-name-mixedcase */

    /// @notice Set new merkle root and basket length of `round`
    /// @param round Number of current round or future round
    /// @param length Basket length of `round`
    /// @param merkleRoot Merkle root of basket tree
    function setBasket(uint256 round, uint256 length, bytes32 merkleRoot) external whenExecutable {
        require(
            currentRound() <= round,
            "NXPCDistributor/invalidRound: round must be greater than or equal to current round"
        );

        _setBasket(round, length, merkleRoot);
    }

    /// @notice Set new merkle root of `round`
    /// @param round Number of ended round
    /// @param merkleRoot Merkle root of reward tree
    function setReward(uint256 round, bytes32 merkleRoot) external payable whenExecutable {
        require(currentRound() > round, "NXPCDistributor/invalidRound: round must be ended");

        NXPCAmountManager.addMintedAmount(msg.value);

        _setReward(round, merkleRoot);
    }

    /// @notice Set new vault address
    /// @param newVault CA of new vault
    function setVault(address newVault) external onlyOwner validAddress(newVault) {
        require(!isStarted(), "NXPCDistributor/invalidRound: round must be ended");

        _setVault(newVault);
    }

    /// @notice Starts current round
    function start() external whenExecutable {
        _start();
    }

    /// @notice Ends current round
    function end() external whenExecutable {
        require(
            currentBasketLength(currentRound()) == basketLength(currentRound()),
            "NXPCDistributor/invalidBasket: basket isn't full"
        );

        _end();
    }

    /// @notice Ends current round
    /// @dev Must use this function for emergency cases
    function emergencyEnd() external whenExecutable {
        _end();
    }

    /// @notice Deposits `tokenId` from `user` and proves basket by `proof`
    /// @param tokenId Token id for deposit
    /// @param user EOA of depositor
    /// @param slotLength Number of current slot's limit
    /// @param proof Merkle proof of basket tree
    function deposit(
        uint256 tokenId,
        address user,
        uint256 slotLength,
        bytes32[] calldata proof
    ) external whenExecutable validAddress(user) {
        require(isStarted(), "NXPCDistributor/alreadyEnded: round must be started");

        uint64 itemId = equip.tokenItemId(tokenId);

        require(
            MerkleProof.verifyCalldata(
                proof,
                basketMerkleRoot(currentRound()),
                keccak256(bytes.concat(keccak256(abi.encode(currentRound(), itemId, slotLength))))
            ),
            "NXPCDistributor/invalidProof: basket merkle root is different"
        );

        _deposit(currentRound(), tokenId, user, slotLength);
    }

    /// @notice Batch version of {deposit}
    /// @param tokenIds Token ids array for deposit
    /// @param user EOA of depositor
    /// @param slotLength Number array of current slots' limit
    /// @param proof Merkle proof array of basket tree
    function batchDeposit(
        uint256[] calldata tokenIds,
        address user,
        uint256[] calldata slotLength,
        bytes32[][] calldata proof
    ) external whenExecutable validAddress(user) {
        require(isStarted(), "NXPCDistributor/alreadyEnded: round must be started");
        uint256 slotsLength = slotLength.length;
        require(
            tokenIds.length == slotsLength,
            "NXPCDistributor/invalidInputLength: all input arrays must have the same length"
        );
        require(
            proof.length == slotsLength,
            "NXPCDistributor/invalidInputLength: all input arrays must have the same length"
        );

        for (uint256 i; i < slotsLength; ) {
            uint64 itemId = equip.tokenItemId(tokenIds[i]);

            require(
                MerkleProof.verifyCalldata(
                    proof[i],
                    basketMerkleRoot(currentRound()),
                    keccak256(bytes.concat(keccak256(abi.encode(currentRound(), itemId, slotLength[i]))))
                ),
                "NXPCDistributor/invalidProof: basket merkle root is different"
            );

            _deposit(currentRound(), tokenIds[i], user, slotLength[i]);

            unchecked {
                i++;
            }
        }
    }

    /// @notice Withdraws `tokenId` to `user`
    /// @param tokenId Token id for withdraw
    /// @param user EOA of depositor
    function withdraw(uint256 tokenId, address user) external whenExecutable {
        require(isStarted(), "NXPCDistributor/alreadyEnded: round must be started");
        require(
            currentDepositor(currentRound(), tokenId) == user,
            "NXPCDistributor/invalidDepositor: user is not a depositor"
        );

        _withdraw(currentRound(), tokenId, user);
    }

    /// @notice Batch version of {withdraw}
    /// @param tokenIds Token ids array for withdraw
    /// @param user EOA of depositor
    function batchWithdraw(uint256[] calldata tokenIds, address user) external whenExecutable {
        require(isStarted(), "NXPCDistributor/alreadyEnded: round must be started");

        uint256 tokenIdsLength = tokenIds.length;
        for (uint256 i; i < tokenIdsLength; ) {
            require(
                currentDepositor(currentRound(), tokenIds[i]) == user,
                "NXPCDistributor/invalidDepositor: user is not a depositor"
            );

            _withdraw(currentRound(), tokenIds[i], user);

            unchecked {
                i++;
            }
        }
    }

    /// @notice Send `amount` NXPC to `user` and proves reward by `proof`
    /// @param round Number of round
    /// @param user EOA of user
    /// @param amount Amount of NXPC reward
    /// @param proof Merkle proof of reward tree
    function claim(uint256 round, address user, uint256 amount, bytes32[] calldata proof) external whenExecutable {
        require(isClaimable(round), "NXPCDistributor/notClaimable: reward has not been registered");
        require(
            MerkleProof.verifyCalldata(
                proof,
                rewardMerkleRoot(round),
                keccak256(bytes.concat(keccak256(abi.encode(round, user, amount))))
            ),
            "NXPCDistributor/invalidProof: reward merkle root is different"
        );

        _claim(round, user, amount);
    }

    /// @notice Returns number of current round
    /// @return uint256
    function currentRound() public view returns (uint256) {
        return _currentRound;
    }

    /// @notice Returns current status
    /// @return bool
    function isStarted() public view returns (bool) {
        return _isStarted;
    }

    /// @notice Returns vault contract address
    /// @return address
    function vault() public view returns (address) {
        return _vault;
    }

    /// @notice Returns basket merkle root of `round`
    /// @param round Number of round
    /// @return bytes32
    function basketMerkleRoot(uint256 round) public view returns (bytes32) {
        return _basketMerkleRoot[round];
    }

    /// @notice Returns reward merkle root of `round`
    /// @param round Number of round
    /// @return bytes32
    function rewardMerkleRoot(uint256 round) public view returns (bytes32) {
        return _rewardMerkleRoot[round];
    }

    /// @notice Returns basket length of `round`
    /// @param round Number of round
    /// @return uint256
    function basketLength(uint256 round) public view returns (uint256) {
        return _basketLength[round];
    }

    /// @notice Returns number of full slot of `round`
    /// @param round Number of round
    /// @return uint256
    function currentBasketLength(uint256 round) public view returns (uint256) {
        return _currentBasketLength[round];
    }

    /// @notice Returns claimable status of `round`
    /// @param round Number of round
    /// @return bool
    function isClaimable(uint256 round) public view returns (bool) {
        return _isClaimable[round];
    }

    /// @notice Returns claimed status of `leaf`
    /// @param leaf Merkle leaf of reward tree
    /// @return bool
    function isClaimed(bytes32 leaf) public view returns (bool) {
        return _isClaimed[leaf];
    }

    /// @notice Returns current slot length of `itemId`
    /// @param round Number of round
    /// @param itemId Item id of equip
    /// @return uint256
    function currentSlotLength(uint256 round, uint64 itemId) public view returns (uint256) {
        return _currentSlotLength[round][itemId];
    }

    /// @notice Returns true if `itemId` slot is full
    /// @param round Number of round
    /// @param itemId Item id of equip
    /// @return bool
    function isFullSlot(uint256 round, uint64 itemId) public view returns (bool) {
        return _isFullSlot[round][itemId];
    }

    /// @notice Returns depositor of `tokenId`
    /// @param round Number of round
    /// @param tokenId Token id of equip
    /// @return address
    function currentDepositor(uint256 round, uint256 tokenId) public view returns (address) {
        return _currentDepositor[round][tokenId];
    }

    /* solhint-enable func-name-mixedcase */
    /* trivial overrides */

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    /// @dev See {setBasket} function
    function _setBasket(uint256 round, uint256 length, bytes32 merkleRoot) private {
        require(length > 0, "NXPCDistributor/invalidLength: length must be bigger than 0");
        require(merkleRoot != 0, "NXPCDistributor/invalidMerkleRoot: merkle root must not be zero bytes");

        _basketLength[round] = length;
        _basketMerkleRoot[round] = merkleRoot;

        emit SetBasket(round, merkleRoot);
    }

    /// @dev See {setReward} function
    function _setReward(uint256 round, bytes32 merkleRoot) private {
        require(merkleRoot != 0, "NXPCDistributor/invalidMerkleRoot: merkle root must not be zero bytes");

        _rewardMerkleRoot[round] = merkleRoot;
        _isClaimable[round] = true;

        emit SetReward(round, merkleRoot);
    }

    /// @dev See {setVault} function
    function _setVault(address newVault) private {
        emit SetVault(_vault, newVault);
        _vault = newVault;
    }

    /// @dev See {start} function
    function _start() private {
        require(
            basketMerkleRoot(currentRound()) != 0,
            "NXPCDistributor/invalidMerkleRoot: basket merkle root has not been set"
        );
        require(!isStarted(), "NXPCDistributor/alreadyStarted: round must be ended");

        emit Start(currentRound());

        _isStarted = true;
    }

    /// @dev See {end} function
    function _end() private {
        require(isStarted(), "NXPCDistributor/alreadyEnded: round must be started");

        emit End(currentRound());

        unchecked {
            _currentRound++;
        }
        _isStarted = false;
    }

    /// @dev See {deposit} function
    function _deposit(uint256 round, uint256 tokenId, address user, uint256 slotLength) private {
        uint64 itemId = equip.tokenItemId(tokenId);

        require(!isFullSlot(currentRound(), itemId), "NXPCDistributor/invalidSlot: current item's slot is full");
        unchecked {
            _currentSlotLength[round][itemId]++;
        }
        _currentDepositor[round][tokenId] = user;

        if (currentSlotLength(round, itemId) == slotLength) {
            _isFullSlot[round][itemId] = true;
            _addCurrentBasketLength(round);
        }

        //slither-disable-next-line arbitrary-send-erc20
        equip.transferFrom(user, vault(), tokenId);

        emit Deposit(round, tokenId, itemId, user);
    }

    /// @dev See {withdraw} function
    function _withdraw(uint256 round, uint256 tokenId, address user) private {
        uint64 itemId = equip.tokenItemId(tokenId);

        _currentSlotLength[round][itemId]--;

        delete _currentDepositor[round][tokenId];

        if (isFullSlot(round, itemId)) {
            _isFullSlot[round][itemId] = false;
            _subCurrentBasketLength(round);
        }

        equip.transferFrom(vault(), user, tokenId);

        emit Withdraw(round, tokenId, itemId, user);
    }

    /// @dev See {claim} function
    function _claim(uint256 round, address user, uint256 amount) private {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(round, user, amount))));

        require(!isClaimed(leaf), "NXPCDistributor/alreadyClaimed: merkle leaf is already used");

        _isClaimed[leaf] = true;

        //slither-disable-next-line arbitrary-send-eth
        (bool success, ) = user.call{ value: amount }("");

        require(success, "NXPCDistributor/transferFailed: NXPC transfer failed");

        emit Claim(round, amount, user);
    }

    /// @dev See {deposit} function
    function _addCurrentBasketLength(uint256 round) private {
        unchecked {
            _currentBasketLength[round]++;
        }

        if (currentBasketLength(round) == basketLength(round)) {
            emit BasketIsFull(round);
        }
    }

    /// @dev See {withdraw} function
    function _subCurrentBasketLength(uint256 round) private {
        _currentBasketLength[round]--;
    }
}
