// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IERC1155BridgeToken {
    event RetrievedERC1155(address from, address to, uint256 tokenId, uint256 amount, string reason);
    event RetrievedBatchERC1155(address from, address to, uint256[] tokenIds, uint256[] amounts, string reason);
    event BridgeContractChanged(address previousBridge, address newBridge);
    event DefaultBaseURIChanged(string previousURI, string newURI);
    event TokenBaseURIChanged(uint256 indexed id, string previousURI, string newURI);

    function initialize(string memory defaultBaseURI_, address initOwner_) external;

    function mintBatch(address account, uint256[] memory tokenIds, uint256[] memory values, bytes memory data) external;

    function burnBatch(address account, uint256[] memory tokenIds, uint256[] memory values) external;
}
