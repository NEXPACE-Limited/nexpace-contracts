// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IERC20BridgeToken {
    event RetrievedERC20(address from, address to, uint256 amount, string reason);
    event BridgeContractChanged(address previousBridge, address newBridge);

    function initialize(
        string memory tokenName_,
        string memory tokenSymbol_,
        uint8 decimals_,
        address initOwner_
    ) external;

    function mint(address account, uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;
}
