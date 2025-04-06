// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IERC721BridgeToken {
    event RetrievedERC721(address from, address to, uint256 tokenId, string reason);
    event BridgeContractChanged(address previousBridge, address newBridge);

    function initialize(
        string memory tokenName_,
        string memory tokenSymbol_,
        string memory defaultBaseURI_,
        address initOwner_
    ) external;

    function mintBatch(address account, uint256[] calldata tokenIds) external;

    function burnBatch(uint256[] calldata tokenIds) external;
}
