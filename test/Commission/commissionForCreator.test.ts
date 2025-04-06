import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import nxErrors from "../lib/nx-errors";

describe("Commission For Creator Contract", () => {
  // Fixtures
  async function deployFixture() {
    const [commissionOwner, ercOwner, creator, nexonCommissionWallet, takebackWallet, creatorWallet, ad1, ad2] =
      await ethers.getSigners();

    const Erc20 = await ethers.getContractFactory("ERC20PresetFixedSupply");
    const erc20 = await Erc20.deploy("TEST", "TEST", 100_000_000n, await ercOwner.getAddress());
    await erc20.deployed();
    const NewErc20 = await ethers.getContractFactory("ERC20PresetFixedSupply");
    const newErc20 = await NewErc20.deploy("NEW", "NEW", 100_000_000n, await ercOwner.getAddress());
    await newErc20.deployed();

    // Deploy
    const Commission = await ethers.getContractFactory("Commission");
    const commission = await Commission.deploy(ad1.address, erc20.address);
    await commission.connect(commissionOwner).deployed();

    const CreatorContract = await ethers.getContractFactory("MockCreator", creator);
    const creatorContract = await CreatorContract.deploy(commission.address, erc20.address);
    await creatorContract.deployed();

    // Pre-allowed
    await erc20.connect(ercOwner).transfer(await ad1.getAddress(), 100_000_000n);
    await erc20.connect(ad1).approve(creatorContract.address, 100_000_000n);

    return {
      commission,
      CreatorContract,
      creatorContract,
      erc20,
      newErc20,
      commissionOwner,
      ercOwner,
      creator,
      nexonCommissionWallet,
      creatorWallet,
      takebackWallet,
      ad1,
      ad2,
    };
  }

  describe("commission", async () => {
    it("send contents commission", async () => {
      const { creatorContract, creator, creatorWallet, erc20, ad1 } = await loadFixture(deployFixture);
      const commissionAmount = 50000;

      await expect(
        creatorContract.connect(creator).contents({
          commissionFrom: await ad1.getAddress(),
          commissionTo: await creatorWallet.getAddress(),
          commissionAmount,
          dAppId: 0,
          reason: "TEST",
        })
      )
        .to.emit(creatorContract, "SendCommission")
        .withArgs(await ad1.getAddress(), await creatorWallet.getAddress(), erc20.address, commissionAmount, 0, "TEST");
    });
    it("send contents commission2", async () => {
      const { creatorContract, creator, creatorWallet, erc20, ad1 } = await loadFixture(deployFixture);
      const commissionAmount = 50000;

      await expect(
        creatorContract.connect(creator).contentsWithOtherToken(
          {
            commissionFrom: await ad1.getAddress(),
            commissionTo: await creatorWallet.getAddress(),
            commissionAmount,
            dAppId: 0,
            reason: "TEST",
          },
          erc20.address
        )
      )
        .to.emit(creatorContract, "SendCommission")
        .withArgs(await ad1.getAddress(), await creatorWallet.getAddress(), erc20.address, commissionAmount, 0, "TEST");
    });

    it("send 0 contents commission", async () => {
      const { creatorContract, creator, creatorWallet, ad1 } = await loadFixture(deployFixture);
      const commissionAmount = 0n;

      await expect(
        creatorContract.connect(creator).contents({
          commissionFrom: await ad1.getAddress(),
          commissionTo: await creatorWallet.getAddress(),
          commissionAmount,
          dAppId: 0,
          reason: "TEST",
        })
      );
    });
    it("send 0 contents commission2", async () => {
      const { creatorContract, creator, creatorWallet, erc20, ad1 } = await loadFixture(deployFixture);
      const commissionAmount = 0n;

      await expect(
        creatorContract.connect(creator).contentsWithOtherToken(
          {
            commissionFrom: await ad1.getAddress(),
            commissionTo: await creatorWallet.getAddress(),
            commissionAmount,
            dAppId: 0,
            reason: "TEST",
          },
          erc20.address
        )
      );
    });
  });

  describe("Commission Contract - getter, setter", async () => {
    it("setter - new token", async () => {
      const { CreatorContract, commission } = await loadFixture(deployFixture);
      await expect(CreatorContract.deploy(commission.address, ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.CommissionForCreator.invalidRequest
      );
    });
    it("setter - commission contract", async () => {
      const { creatorContract, creator, commission, ad1 } = await loadFixture(deployFixture);
      await expect(creatorContract.connect(creator).setCommission(await ad1.getAddress()))
        .to.emit(creatorContract, "SetCommission")
        .withArgs(commission.address, await ad1.getAddress());
      expect(await creatorContract.commission()).to.be.equal(await ad1.getAddress());
    });
    it("setter - commission contract(revert when called zero address)", async () => {
      const { creatorContract, creator } = await loadFixture(deployFixture);
      await expect(creatorContract.connect(creator).setCommission(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.CommissionForCreator.invalidRequest
      );
    });
    it("getter - token", async () => {
      const { creatorContract, erc20 } = await loadFixture(deployFixture);
      expect(await creatorContract.token()).to.be.equal(erc20.address);
    });
  });

  describe("check onlyOwner", async () => {
    it("setCommission", async () => {
      const { creatorContract, ad1 } = await loadFixture(deployFixture);

      await expect(creatorContract.connect(ad1).setCommission(await ad1.getAddress())).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });
  describe("Commission Contract - set default token", async () => {
    it("set new token address", async () => {
      const { creatorContract, newErc20, creator } = await loadFixture(deployFixture);
      await creatorContract.connect(creator).setToken(newErc20.address);
      expect(await creatorContract.token()).to.equal(newErc20.address);
    });
    it("fail - Not owner", async () => {
      const { creatorContract, newErc20, ad1 } = await loadFixture(deployFixture);
      await expect(creatorContract.connect(ad1).setToken(newErc20.address)).to.be.revertedWith(nxErrors.ownerForbidden);
    });
    it("fail - Invalid token address", async () => {
      const { creatorContract, creator } = await loadFixture(deployFixture);
      await expect(creatorContract.connect(creator).setToken(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.CommissionForCreator.invalidRequest
      );
    });
  });
});
