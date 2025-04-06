import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import nxErrors from "../lib/nx-errors";

describe("Commission Contract", () => {
  // Fixtures
  async function deployFixture() {
    const [commissionOwner, ercOwner, nexonCommissionWallet, takebackWallet, ad1, ad2] = await ethers.getSigners();

    // Deploy
    const Erc20 = await ethers.getContractFactory("ERC20PresetFixedSupply");
    const erc20 = await Erc20.deploy("TEST", "TEST", 100_000_000n, await ercOwner.getAddress());
    await erc20.deployed();
    const NewErc20 = await ethers.getContractFactory("ERC20PresetFixedSupply");
    const newErc20 = await NewErc20.deploy("NEW", "NEW", 100_000_000n, await ercOwner.getAddress());
    await newErc20.deployed();

    const Commission = await ethers.getContractFactory("Commission");
    const commission = await Commission.deploy(ad1.address, erc20.address);
    await commission.connect(commissionOwner).deployed();

    // Pre-allowed
    await erc20.connect(ercOwner).transfer(await ad1.getAddress(), 100_000_000n);

    return {
      commission,
      erc20,
      newErc20,
      commissionOwner,
      ercOwner,
      nexonCommissionWallet,
      takebackWallet,
      ad1,
      ad2,
    };
  }

  describe("constructor", function () {
    it("should be reverted when deploy with zero address", async function () {
      const Commission = await ethers.getContractFactory("Commission");
      await expect(Commission.deploy(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.Commission.validAddress
      );
    });
  });

  describe("check onlyOwner", async () => {
    it("claim", async () => {
      const { commission, ad1 } = await loadFixture(deployFixture);
      await expect(
        commission.connect(ad1)["claim(address,uint256)"](await ad1.getAddress(), 100_000n)
      ).to.be.revertedWith("NextOwnable/executorForbidden: account is neither the owner nor an executor");
    });
    it("claim2", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      await expect(
        commission
          .connect(ad1)
          ["claim(address,address,uint256,uint256)"](await ad1.getAddress(), erc20.address, 100_000n, 100_000)
      ).to.be.revertedWith("NextOwnable/executorForbidden: account is neither the owner nor an executor");
    });

    it("fail - Insufficient fund", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);

      await expect(commission["claim(address,uint256)"](await ad1.getAddress(), 100_000_000n)).to.be.revertedWith(
        nxErrors.Commission.insufficientFund
      );

      await expect(
        commission["claim(address,address,uint256,uint256)"](
          await ad1.getAddress(),
          erc20.address,
          100_000_000n,
          100_000n
        )
      ).to.be.revertedWith(nxErrors.Commission.insufficientFund);
    });
  });

  describe("Commission Contract - getter", async () => {
    it("getter - commission percentage", async () => {
      const { commission, erc20 } = await loadFixture(deployFixture);

      expect(await commission.token()).to.equal(erc20.address);
    });
  });

  describe("afterDeposited", async () => {
    it("success", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);

      await expect(commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 100_000n))
        .to.be.emit(commission, "Deposited")
        .withArgs(await ad1.getAddress(), erc20.address, 100_000n, 100_000n);
    });
    it("success2", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);

      await expect(
        commission["afterDeposited(address,address,uint256)"](await ad1.getAddress(), erc20.address, 100_000n)
      )
        .to.be.emit(commission, "Deposited")
        .withArgs(await ad1.getAddress(), erc20.address, 100_000n, 100_000n);
    });
    it("fail - not enough balance", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);

      await expect(commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 100_001n)).to.be.revertedWith(
        nxErrors.Commission.insufficientBalance
      );
    });
    it("fail - not enough balance2", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);

      await expect(
        commission["afterDeposited(address,address,uint256)"](await ad1.getAddress(), erc20.address, 100_001n)
      ).to.be.revertedWith(nxErrors.Commission.insufficientBalance);
    });
  });

  describe("creatorFee", async () => {
    it("success", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      expect(await commission["creatorFee(address)"](await ad1.getAddress())).to.equal(0n);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);
      await commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 100_000n);

      expect(await commission["creatorFee(address)"](await ad1.getAddress())).to.equal(100_000n);
    });
    it("success2", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      expect(await commission["creatorFee(address,address)"](await ad1.getAddress(), erc20.address)).to.equal(0n);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);
      await commission["afterDeposited(address,address,uint256)"](await ad1.getAddress(), erc20.address, 100_000n);

      expect(await commission["creatorFee(address,address)"](await ad1.getAddress(), erc20.address)).to.equal(100_000n);
    });
    it("success - multiple deposit", async () => {
      const { commission, erc20, ad1 } = await loadFixture(deployFixture);
      expect(await commission["creatorFee(address)"](await ad1.getAddress())).to.equal(0n);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);
      await commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 50_000n);
      expect(await commission["creatorFee(address)"](await ad1.getAddress())).to.equal(50_000n);
      await commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 50_000n);
      expect(await commission["creatorFee(address)"](await ad1.getAddress())).to.equal(100_000n);

      await erc20.connect(ad1).transfer(commission.address, 300_000n);
      await commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 300_000n);
      expect(await commission["creatorFee(address)"](await ad1.getAddress())).to.equal(400_000n);
    });
  });

  describe("Commission Contract - claim", async () => {
    it("claim commission", async () => {
      const { commission, erc20, commissionOwner, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);
      await commission["afterDeposited(address,uint256)"](await ad1.getAddress(), 100_000n);

      await expect(commission.connect(commissionOwner)["claim(address,uint256)"](await ad1.getAddress(), 10_000n))
        .to.emit(commission, "Claimed")
        .withArgs(await ad1.getAddress(), erc20.address, 10_000n, 0, 90_000n);
    });
    it("claim commission2", async () => {
      const { commission, erc20, commissionOwner, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);
      await commission["afterDeposited(address,address,uint256)"](await ad1.getAddress(), erc20.address, 100_000n);

      await expect(
        commission
          .connect(commissionOwner)
          ["claim(address,address,uint256,uint256)"](await ad1.getAddress(), erc20.address, 10_000n, 10_000n)
      )
        .to.emit(commission, "Claimed")
        .withArgs(await ad1.getAddress(), erc20.address, 10_000n, 10_000n, 80_000n);
    });
    it("claim commission3", async () => {
      const { commission, erc20, commissionOwner, ad1 } = await loadFixture(deployFixture);
      await erc20.connect(ad1).transfer(commission.address, 100_000n);
      await commission["afterDeposited(address,address,uint256)"](await ad1.getAddress(), erc20.address, 100_000n);

      await expect(
        commission
          .connect(commissionOwner)
          ["claim(address,address,uint256,uint256)"](await ad1.getAddress(), erc20.address, 10_000n, 0n)
      )
        .to.emit(commission, "Claimed")
        .withArgs(await ad1.getAddress(), erc20.address, 10_000n, 0n, 90_000n);
    });
  });

  describe("Commission Contract - set default token", async () => {
    it("set new token address", async () => {
      const { commission, newErc20, commissionOwner } = await loadFixture(deployFixture);
      await commission.connect(commissionOwner).setToken(newErc20.address);
      expect(await commission.token()).to.equal(newErc20.address);
    });
    it("fail - Not owner", async () => {
      const { commission, newErc20, ad1 } = await loadFixture(deployFixture);
      await expect(commission.connect(ad1).setToken(newErc20.address)).to.be.revertedWith(nxErrors.ownerForbidden);
    });
    it("fail - Invalid token address", async () => {
      const { commission, commissionOwner } = await loadFixture(deployFixture);
      await expect(commission.connect(commissionOwner).setToken(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.Commission.validAddress
      );
    });
  });
});
