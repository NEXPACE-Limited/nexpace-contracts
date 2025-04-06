// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC1155BridgeToken } from "./Interfaces/IERC1155BridgeToken.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { ERC1155Pausable } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import { NextOwnablePausable } from "@projecta/util-contracts/contracts/access/NextOwnablePausable.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract ERC1155BridgeToken is
    IERC1155BridgeToken,
    ERC2771Context,
    ERC1155,
    ERC1155Pausable,
    NextOwnablePausable,
    Initializable
{
    using Strings for uint256;

    address private _bridgeContract;
    string private _defaultBaseURI;

    mapping(uint256 => string) private _tokenBaseURIs;

    modifier onlyBridge() {
        require(msg.sender == _bridgeContract, "BridgeToken/unauthorized: unauthorized");
        _;
    }

    constructor(address trustedForwarder, address admin_) ERC2771Context(trustedForwarder) ERC1155("") {
        _transferOwnership(admin_);
        _disableInitializers();
    }

    function initialize(string memory defaultBaseURI_, address initOwner_) external initializer {
        _defaultBaseURI = defaultBaseURI_;
        _bridgeContract = _msgSender();
        _transferOwnership(initOwner_);
    }

    function setDefaultURI(string memory newURI) external whenExecutable {
        emit DefaultBaseURIChanged(_defaultBaseURI, newURI);
        _defaultBaseURI = newURI;
    }

    function setTokenURI(string memory newURI, uint256 id) external whenExecutable {
        emit TokenBaseURIChanged(id, _tokenBaseURIs[id], newURI);
        _tokenBaseURIs[id] = newURI;
    }

    function mintBatch(
        address account,
        uint256[] memory tokenIds,
        uint256[] memory values,
        bytes memory data
    ) external onlyBridge {
        _mintBatch(account, tokenIds, values, data);
    }

    function burnBatch(address account, uint256[] memory tokenIds, uint256[] memory values) external onlyBridge {
        _burnBatch(account, tokenIds, values);
    }

    function retrieve(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        string memory reason
    ) external onlyOwner {
        _safeTransferFrom(from, to, tokenId, amount, "");
        emit RetrievedERC1155(from, to, tokenId, amount, reason);
    }

    function retrieveBatch(
        address from,
        address to,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        string memory reason
    ) external onlyOwner {
        _safeBatchTransferFrom(from, to, tokenIds, amounts, "");
        emit RetrievedBatchERC1155(from, to, tokenIds, amounts, reason);
    }

    function setBridgeContract(address newBridge) external onlyOwner {
        address previousBridge = _bridgeContract;
        _bridgeContract = newBridge;
        emit BridgeContractChanged(previousBridge, _bridgeContract);
    }

    function getBridgeContract() external view returns (address) {
        return _bridgeContract;
    }

    function uri(uint256 id) public view override returns (string memory) {
        string memory _uri = bytes(_tokenBaseURIs[id]).length > 0 ? _tokenBaseURIs[id] : _defaultBaseURI;
        return string(abi.encodePacked(_uri, id.toString(), ".json"));
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override(ERC1155, ERC1155Pausable) {
        ERC1155Pausable._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
