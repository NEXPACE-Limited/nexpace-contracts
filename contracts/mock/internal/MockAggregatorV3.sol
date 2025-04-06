// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/* solhint-disable no-global-import */
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3 is AggregatorV3Interface {
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    uint8 public immutable decimals;
    bytes32 public immutable descriptionBytes32;
    uint256 public immutable version;

    mapping(uint80 => RoundData) private roundData;
    uint80 private latestRoundId;

    constructor(uint8 _decimals, string memory _description, uint256 _version) {
        bytes memory bytesVal = bytes(_description);
        require(bytesVal.length <= 32, "description too long");
        decimals = _decimals;
        bytes32 bytes32Val;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            bytes32Val := mload(add(bytesVal, 32))
        }
        descriptionBytes32 = bytes32Val;
        version = _version;
    }

    function setRoundData(
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external {
        roundData[roundId] = RoundData({
            roundId: roundId,
            answer: answer,
            startedAt: startedAt,
            updatedAt: updatedAt,
            answeredInRound: answeredInRound
        });
    }

    function setLatestRoundId(uint80 _roundId) external {
        latestRoundId = _roundId;
    }

    function getRoundData(
        uint80 _roundId
    )
        public
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        RoundData storage s = roundData[_roundId];
        roundId = s.roundId;
        require(roundId == _roundId, "No data present");
        answer = s.answer;
        startedAt = s.startedAt;
        updatedAt = s.updatedAt;
        answeredInRound = s.answeredInRound;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return getRoundData(latestRoundId);
    }

    error DescriptionTest(bytes32, uint256, string);

    function description() external view returns (string memory) {
        bytes32 bytes32Val = descriptionBytes32;
        bytes memory bytesVal = new bytes(32); // allocate with max length
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(add(bytesVal, 0x20), bytes32Val) // copy string contents
        }
        uint256 len = 0;

        for (;;) {
            if (bytes32Val == bytes32(0)) break;
            bytes32Val <<= 8;
            len++;
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(bytesVal, len) // set length
        }
        return string(bytesVal);
    }
}
