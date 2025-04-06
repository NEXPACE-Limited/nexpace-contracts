import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import nxErrors from "../lib/nx-errors";

describe("ItemIssuance", function () {
  async function fixture() {
    const [owner, executor, alice] = await ethers.getSigners();

    const Probability = await ethers.getContractFactory("ERC1155Probability", owner);
    const probability = await Probability.deploy(ethers.constants.AddressZero);

    const ERC1155 = await ethers.getContractFactory("ERC1155");
    const erc1155 = await ERC1155.deploy("");

    await probability.grantExecutor(executor.getAddress());

    const weights = [
      { tokenId: 1, weight: 100, universe: 1 },
      { tokenId: 2, weight: 394, universe: 1 },
      { tokenId: 3, weight: 1182, universe: 1 },
      { tokenId: 4, weight: 593, universe: 1 },
    ];

    return {
      owner,
      executor,
      alice,
      probability,
      erc1155,
      weights,
    };
  }

  describe("setWeight", function () {
    it("success", async function () {
      const { probability, erc1155 } = await loadFixture(fixture);
      await expect(probability.setWeight(erc1155.address, 1, 10, 1))
        .to.be.emit(probability, "WeightUpdated")
        .withArgs(erc1155.address, 1, 0, 10, 10, 1);
      await expect(probability.setWeight(erc1155.address, 1, 30, 1))
        .to.be.emit(probability, "WeightUpdated")
        .withArgs(erc1155.address, 1, 10, 30, 30, 1);
      await expect(probability.setWeight(erc1155.address, 2, 100, 1))
        .to.be.emit(probability, "WeightUpdated")
        .withArgs(erc1155.address, 2, 0, 100, 130, 1);
    });
    it("should be reverted when not called by the executor or owner", async function () {
      const { probability, erc1155, alice } = await loadFixture(fixture);
      await expect(probability.connect(alice).setWeight(erc1155.address, 1, 10, 1)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
  });
  describe("setBatchWeight", function () {
    it("success", async function () {
      const { probability, erc1155, weights } = await loadFixture(fixture);
      await probability.setBatchWeight(erc1155.address, weights);
    });
    it("should be reverted when not called by the executor or owner", async function () {
      const { probability, erc1155, alice, weights } = await loadFixture(fixture);
      await expect(probability.connect(alice).setBatchWeight(erc1155.address, weights)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
  });
  describe("view function", function () {
    it("weight / totalWeight", async function () {
      const { probability, erc1155, weights } = await loadFixture(fixture);
      let sumWeight = 0;

      for (const { tokenId, weight, universe } of weights) {
        await probability.setWeight(erc1155.address, tokenId, weight, universe);
        sumWeight += weight;
      }
      for (const { tokenId, weight } of weights) {
        expect(await probability.weight(erc1155.address, tokenId)).to.equal(weight);
      }
      expect(await probability.totalWeight(erc1155.address)).to.equal(sumWeight);
    });
    it("weight / totalWeight", async function () {
      const { probability, erc1155, weights } = await loadFixture(fixture);
      let sumWeight = 0;

      for (const { weight } of weights) {
        sumWeight += weight;
      }
      await probability.setBatchWeight(erc1155.address, weights);
      for (const { tokenId, weight } of weights) {
        expect(await probability.weight(erc1155.address, tokenId)).to.equal(weight);
      }
      expect(await probability.totalWeight(erc1155.address)).to.equal(sumWeight);
    });
  });
});
