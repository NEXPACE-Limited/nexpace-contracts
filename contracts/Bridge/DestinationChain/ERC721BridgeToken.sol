// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC721BridgeToken } from "./Interfaces/IERC721BridgeToken.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC721, Strings } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Pausable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract ERC721BridgeToken is
    IERC721BridgeToken,
    ERC2771Context,
    ERC721,
    ERC721Pausable,
    NextOwnablePausable,
    Initializable
{
    using Strings for uint256;
    string private _name;
    string private _symbol;
    address private _bridgeContract;
    string private _defaultBaseURI;

    modifier onlyBridge() {
        require(msg.sender == _bridgeContract, "BridgeToken/unauthorized: unauthorized");
        _;
    }

    constructor(address trustedForwarder, address admin_) ERC2771Context(trustedForwarder) ERC721("", "") {
        _transferOwnership(admin_);
        _disableInitializers();
    }

    function initialize(
        string memory tokenName_,
        string memory tokenSymbol_,
        string memory defaultBaseURI_,
        address initOwner_
    ) external initializer {
        _name = tokenName_;
        _symbol = tokenSymbol_;
        _defaultBaseURI = defaultBaseURI_;
        _bridgeContract = _msgSender();
        _transferOwnership(initOwner_);
    }

    function mintBatch(address account, uint256[] calldata tokenIds) external onlyBridge {
        uint256 tokenIdsLength = tokenIds.length;
        for (uint256 i; i < tokenIdsLength; ) {
            _mint(account, tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    function burnBatch(uint256[] calldata tokenIds) external onlyBridge {
        uint256 tokenIdsLength = tokenIds.length;
        for (uint256 i; i < tokenIdsLength; ) {
            _burn(tokenIds[i]);
            unchecked {
                i++;
            }
        }
    }

    function retrieve(address from, address to, uint256 tokenId, string memory reason) external onlyOwner {
        _transfer(from, to, tokenId);
        emit RetrievedERC721(from, to, tokenId, reason);
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

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);
        return string(abi.encodePacked(_defaultBaseURI, tokenId.toString(), ".json"));
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Pausable) {
        ERC721Pausable._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
