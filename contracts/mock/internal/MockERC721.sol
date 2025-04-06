// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC721 is ERC721, Ownable {
    constructor() ERC721("MyToken", "MTK") {}

    function setLimitSupply(uint256 itemId, uint256 limitSupply) public {
        require(limitSupply <= type(uint96).max, "MockERC721: limitSupply exceeds uint96");
    }

    function safeMint(address to, uint256 tokenId) public onlyOwner {
        _safeMint(to, tokenId);
    }
}
