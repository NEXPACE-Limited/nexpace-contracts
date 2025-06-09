// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { MinProxy } from "@projecta/min-proxy/contracts/MinProxy.sol";

contract MockMinProxy {
    event Deployed(address indexed impl, address indexed proxy);

    function createNXPC(address impl) external returns (address) {
        address nxpcAddress = MinProxy.createProxy(impl);
        emit Deployed(impl, address(nxpcAddress));
        return nxpcAddress;
    }
}
