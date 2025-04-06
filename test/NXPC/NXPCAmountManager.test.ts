import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import nxErrors from "../lib/nx-errors";

describe("NXPCAmountManager Contract", () => {
  const deployFixture = async () => {
    const dummyAddress = "0x0200000000000000000000000000000000000000";
    const [owner, burnAllowlisted, , mintAllowlisted] = await ethers.getSigners();

    const NXPCAmountManager = await ethers.getContractFactory("NXPCAmountManager");
    const nxpcAmountManager = await NXPCAmountManager.deploy(dummyAddress);

    await nxpcAmountManager.connect(owner).setBurnAllowlist(burnAllowlisted.address, true);
    await nxpcAmountManager.connect(owner).setMintAllowlist(mintAllowlisted.address, true);

    return {
      nxpcAmountManager,
    };
  };

  describe("Deployment", async () => {
    it("Initial value", async () => {
      const [, burnAllowlisted, notAllowlisted, mintAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      expect(await nxpcAmountManager.totalSupply()).to.equal(1000000000000000000000000000n);
      expect(await nxpcAmountManager.MAX_SUPPLY()).to.equal(1000000000000000000000000000n);
      expect(await nxpcAmountManager.accumulatedBurnedAmount()).to.equal(0n);
      expect(await nxpcAmountManager.accumulatedMintedAmount()).to.equal(0n);
      expect(await nxpcAmountManager.isBurnAllowlisted(burnAllowlisted.address)).to.equal(true);
      expect(await nxpcAmountManager.isBurnAllowlisted(notAllowlisted.address)).to.equal(false);
      expect(await nxpcAmountManager.isMintAllowlisted(mintAllowlisted.address)).to.equal(true);
      expect(await nxpcAmountManager.isMintAllowlisted(notAllowlisted.address)).to.equal(false);
    });
  });

  describe("setAllowlist function", async () => {
    it("Succeed when calling `setAllowlist` function by owner", async () => {
      const [owner, , , , additionalAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      expect(await nxpcAmountManager.isBurnAllowlisted(additionalAllowlisted.address)).to.equal(false);

      await nxpcAmountManager.connect(owner).setBurnAllowlist(additionalAllowlisted.address, true);

      expect(await nxpcAmountManager.isBurnAllowlisted(additionalAllowlisted.address)).to.equal(true);

      expect(await nxpcAmountManager.isMintAllowlisted(additionalAllowlisted.address)).to.equal(false);

      await nxpcAmountManager.connect(owner).setMintAllowlist(additionalAllowlisted.address, true);

      expect(await nxpcAmountManager.isMintAllowlisted(additionalAllowlisted.address)).to.equal(true);
    });

    it("Reverts when attempting to set allowlist when caller is not an owner", async () => {
      const [, , , user] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await expect(nxpcAmountManager.connect(user).setBurnAllowlist(user.address, true)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(nxpcAmountManager.connect(user).setMintAllowlist(user.address, true)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
  });

  describe("addBurnedAmount function", async () => {
    it("Succeed when calling `addBurnedAmount` function by allowlisted address", async () => {
      const [, burnAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      const totalSupply = await nxpcAmountManager.totalSupply();
      const accumulatedBurnedAmount = await nxpcAmountManager.accumulatedBurnedAmount();

      await nxpcAmountManager.connect(burnAllowlisted).addBurnedAmount(1n);

      expect(await nxpcAmountManager.totalSupply()).to.equal(totalSupply.sub(1n));
      expect(await nxpcAmountManager.accumulatedBurnedAmount()).to.equal(accumulatedBurnedAmount.add(1n));
    });

    it("Reverts when attempting to add burned amount when caller is not an allowlisted address", async () => {
      const [, , notAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await expect(nxpcAmountManager.connect(notAllowlisted).addBurnedAmount(1n)).to.be.revertedWith(
        nxErrors.NXPCAmountManager.notAllowlisted
      );
    });

    it("Reverts when attempting to add burned amount when contract is paused", async () => {
      const [, burnAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await nxpcAmountManager.pause();
      await expect(nxpcAmountManager.connect(burnAllowlisted).addBurnedAmount(1n)).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });

  describe("addMintedAmount function", async () => {
    it("Succeed when calling `addMintedAmount` function by allowlisted address", async () => {
      const [, burnAllowlisted, , mintAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await nxpcAmountManager.connect(burnAllowlisted).addBurnedAmount(10n);

      const totalSupply = await nxpcAmountManager.totalSupply();
      const accumulatedMintedAmount = await nxpcAmountManager.accumulatedMintedAmount();

      await nxpcAmountManager.connect(mintAllowlisted).addMintedAmount(1n);

      expect(await nxpcAmountManager.totalSupply()).to.equal(totalSupply.add(1n));
      expect(await nxpcAmountManager.accumulatedMintedAmount()).to.equal(accumulatedMintedAmount.add(1n));
    });

    it("Reverts on calls when the accumulated minted amount exceeds the burned amount", async () => {
      const [, , , mintAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await expect(nxpcAmountManager.connect(mintAllowlisted).addMintedAmount(1n)).to.be.revertedWith(
        nxErrors.NXPCAmountManager.invalidAmount
      );
    });

    it("Reverts when attempting to add minted amount when caller is not an allowlisted address", async () => {
      const [, , notAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await expect(nxpcAmountManager.connect(notAllowlisted).addMintedAmount(1n)).to.be.revertedWith(
        nxErrors.NXPCAmountManager.notAllowlisted
      );
    });

    it("Reverts when attempting to add minted amount when contract is paused", async () => {
      const [, , , mintAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      await nxpcAmountManager.pause();
      await expect(nxpcAmountManager.connect(mintAllowlisted).addMintedAmount(1n)).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });

  describe("additional test cases", async () => {
    it("Returns correct total supply", async () => {
      const [, burnAllowlisted, , mintAllowlisted] = await ethers.getSigners();
      const { nxpcAmountManager } = await loadFixture(deployFixture);

      const totalSupply = await nxpcAmountManager.totalSupply();

      await nxpcAmountManager.connect(burnAllowlisted).addBurnedAmount(100n);

      expect(await nxpcAmountManager.totalSupply()).to.be.equal(totalSupply.sub(100n));

      await nxpcAmountManager.connect(mintAllowlisted).addMintedAmount(50n);

      expect(await nxpcAmountManager.totalSupply()).to.be.equal(totalSupply.sub(50n));
    });
  });
});
