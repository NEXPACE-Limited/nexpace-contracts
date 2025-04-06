import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createClaimTree } from "../lib/merkleTree/merkleTree";
import nxErrors from "../lib/nx-errors";

const timestamp = Math.floor(Date.now() / 1000);
const daedline = timestamp + 100000;

describe("NXPCClaim Contract", () => {
  const deployFixture = async () => {
    const [owner, executor, user] = await ethers.getSigners();
    const NXPCClaim = await ethers.getContractFactory("NXPCClaim");
    const nxpcClaim = await NXPCClaim.deploy();

    await nxpcClaim.deployed();
    await nxpcClaim.connect(owner).grantExecutor(executor.address);

    const NonReceivableContract = await ethers.getContractFactory("MockLinkToken");
    const nonReceivableContract = await NonReceivableContract.deploy();
    const nonReceivableContractAddr = nonReceivableContract.address;

    const dummyAddr = user.address.slice(0, 41).toLowerCase();
    const addrs = Array.from({ length: 9 }, (_, i) => dummyAddr + (i + 1));
    addrs.push(nonReceivableContractAddr);
    const amounts = Array.from({ length: 10 }, (_) => ethers.utils.parseEther("1").toBigInt());
    const claimTree = createClaimTree(addrs, amounts);

    return {
      nxpcClaim,
      owner,
      executor,
      user,
      dummyAddr,
      claimTree,
      nonReceivableContractAddr,
    };
  };

  const initializeFixture = async () => {
    const { owner, nxpcClaim, claimTree } = await loadFixture(deployFixture);

    await nxpcClaim.setReward(claimTree.merkleRoot, daedline);
    await owner.sendTransaction({ to: nxpcClaim.address, value: ethers.utils.parseEther("10") });
  };

  describe("Happy case", async () => {
    it("claim", async () => {
      const { nxpcClaim, executor, dummyAddr, claimTree } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      const user = dummyAddr + "1";
      const amount = ethers.utils.parseEther("1").toBigInt();

      await expect(nxpcClaim.connect(executor).claim(user, amount, claimTree.proof[0])).to.emit(nxpcClaim, "Claim");
    });
    it("extend deadline", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.extendDeadline(timestamp + 500000)).to.emit(nxpcClaim, "ExtendDeadline");
    });
    it("after deadline", async () => {
      const { nxpcClaim, executor } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await ethers.provider.send("evm_mine", [timestamp + 100001]);
      await expect(nxpcClaim.afterDeadline(executor.address)).to.emit(nxpcClaim, "Close");
    });
    it("emergency withdraw", async () => {
      const { nxpcClaim, owner } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await nxpcClaim.pause();
      await expect(nxpcClaim.emergencyWithdraw(owner.address)).to.emit(nxpcClaim, "Close");
    });
  });
  describe("Fail case - set reward", async () => {
    it("not executor", async () => {
      const { nxpcClaim, user, claimTree } = await loadFixture(deployFixture);

      await expect(nxpcClaim.connect(user).setReward(claimTree.merkleRoot, daedline)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("already set", async () => {
      const { nxpcClaim, claimTree } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.setReward(claimTree.merkleRoot, daedline)).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
    it("wrong deadline", async () => {
      const { nxpcClaim, claimTree } = await loadFixture(deployFixture);

      await expect(nxpcClaim.setReward(claimTree.merkleRoot, 0)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });
    it("invalid merkle root", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      const wrongBytes = "0x0000000000000000000000000000000000000000000000000000000000000000";
      await expect(nxpcClaim.setReward(wrongBytes, daedline)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });
  });
  describe("Fail case - claim", async () => {
    it("not executor", async () => {
      const { nxpcClaim, user, dummyAddr, claimTree } = await loadFixture(deployFixture);
      const claimer = dummyAddr + 1;
      const amount = ethers.utils.parseEther("1").toBigInt();
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.connect(user).claim(claimer, amount, claimTree.proof[0])).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
    it("already claimed", async () => {
      const { nxpcClaim, dummyAddr, claimTree } = await loadFixture(deployFixture);
      const claimer = dummyAddr + 1;
      const amount = ethers.utils.parseEther("1").toBigInt();
      await loadFixture(initializeFixture);
      await nxpcClaim.claim(claimer, amount, claimTree.proof[0]);

      await expect(nxpcClaim.claim(claimer, amount, claimTree.proof[0])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
    it("timeout", async () => {
      const { nxpcClaim, dummyAddr, claimTree } = await loadFixture(deployFixture);
      const claimer = dummyAddr + 1;
      const amount = ethers.utils.parseEther("1").toBigInt();
      await loadFixture(initializeFixture);

      await ethers.provider.send("evm_mine", [timestamp + 100001]);
      await expect(nxpcClaim.claim(claimer, amount, claimTree.proof[0])).to.be.revertedWith(nxErrors.NXPCClaim.timeout);
    });
    it("wrong proof", async () => {
      const { nxpcClaim, dummyAddr, claimTree } = await loadFixture(deployFixture);
      const claimer = dummyAddr + 1;
      const amount = ethers.utils.parseEther("1").toBigInt();
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.claim(claimer, amount, claimTree.proof[1])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
    it("transfer failed", async () => {
      const { nxpcClaim, claimTree, nonReceivableContractAddr } = await loadFixture(deployFixture);
      const amount = ethers.utils.parseEther("1").toBigInt();
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.claim(nonReceivableContractAddr, amount, claimTree.proof[9])).to.be.revertedWith(
        nxErrors.NXPCClaim.transferFailed
      );
    });
  });
  describe("Fail case - extend deadline", async () => {
    it("not executor", async () => {
      const { nxpcClaim, user } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.connect(user).extendDeadline(1000)).to.be.revertedWith(nxErrors.executorForbidden);
    });
    it("wrong value", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.extendDeadline(1000)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });
    it("timeout", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await ethers.provider.send("evm_mine", [timestamp + 100001]);
      await expect(nxpcClaim.extendDeadline(timestamp + 10000000)).to.be.revertedWith(nxErrors.NXPCClaim.timeout);
    });
  });
  describe("Fail case - after deadline", async () => {
    it("not onwer", async () => {
      const { nxpcClaim, user } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await ethers.provider.send("evm_mine", [timestamp + 100001]);
      await expect(nxpcClaim.connect(user).afterDeadline(user.address)).to.be.revertedWith(nxErrors.ownerForbidden);
    });
    it("wrong address", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(nxpcClaim.afterDeadline(zeroAddress)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });
    it("not reached deadline", async () => {
      const { nxpcClaim, executor } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.afterDeadline(executor.address)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });
    it("transfer failed", async () => {
      const { nxpcClaim, nonReceivableContractAddr } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await ethers.provider.send("evm_mine", [timestamp + 100001]);
      await expect(nxpcClaim.afterDeadline(nonReceivableContractAddr)).to.be.revertedWith(
        nxErrors.NXPCClaim.transferFailed
      );
    });
  });
  describe("Fail case - emergency withdraw", async () => {
    it("not owner", async () => {
      const { nxpcClaim, executor } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.connect(executor).emergencyWithdraw(executor.address)).to.be.revertedWith(
        nxErrors.ownerForbidden
      );
    });
    it("not paused", async () => {
      const { nxpcClaim, executor } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await expect(nxpcClaim.emergencyWithdraw(executor.address)).to.be.revertedWith(nxErrors.Pausable.notPaused);
    });
    it("wrong address", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);
      await nxpcClaim.pause();

      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(nxpcClaim.emergencyWithdraw(zeroAddress)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });
    it("transfer failed", async () => {
      const { nxpcClaim, nonReceivableContractAddr } = await loadFixture(deployFixture);
      await loadFixture(initializeFixture);

      await nxpcClaim.pause();
      await expect(nxpcClaim.emergencyWithdraw(nonReceivableContractAddr)).to.be.revertedWith(
        nxErrors.NXPCClaim.transferFailed
      );
    });
  });
});
