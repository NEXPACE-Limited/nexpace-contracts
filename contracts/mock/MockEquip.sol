// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ItemIssuance } from "../ItemIssuance/ItemIssuance.sol";

contract MockEquip is ERC721 {
    struct Token {
        uint64 itemId;
        uint64 number;
    }

    mapping(uint256 => Token) private _tokens;

    constructor() ERC721("MockEquip", "ME") {}

    function tokenItemId(uint256 tokenId) external view returns (uint64) {
        return _tokens[tokenId].itemId;
    }

    function mint(address to, uint64 itemId, uint256 tokenId) external {
        _tokens[tokenId] = Token(itemId, 0);

        _mint(to, tokenId);
    }

    function batchMint(address to, uint64[] calldata itemIds, uint256[] calldata tokenIds) external {
        for (uint256 i = 0; i < itemIds.length; ) {
            _tokens[tokenIds[i]] = Token(itemIds[i], 0);
            _mint(to, tokenIds[i]);

            unchecked {
                i++;
            }
        }
    }

    function setLimitSupply(ItemIssuance itemIssuance, uint256 itemId, uint256 newLimitSupply) external {
        itemIssuance.addItem721BaseAmount(itemId, newLimitSupply);
    }
}
