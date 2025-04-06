module.exports = {
  silent: true,
  skipFiles: [
    "utils/VRF/VRFRequesterBase.sol",
    "mock",
    "Bridge/libs",
    "ItemIssuance/ERC1155Probability.sol",
  ],
  mocha: {
    reporter: "dot",
  },
};
