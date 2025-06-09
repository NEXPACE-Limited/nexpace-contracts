import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createClaimTree } from "../lib/merkleTree/merkleTree";
import nxErrors from "../lib/nx-errors";
import { ERC20BridgeToken } from "../../typechain-types";

const zeroByte = ethers.constants.HashZero;
const timestamp = Math.floor(Date.now() / 1000);
const deadline = timestamp + 100000;

function bytes32ToAddress(bytes32String: string): string {
  if (!ethers.utils.isHexString(bytes32String, 32)) {
    throw new Error("Invalid bytes32 string");
  }
  // 마지막 20바이트만 잘라내기
  const addressHex = "0x" + bytes32String.slice(26);
  // checksum address로 변환
  return ethers.utils.getAddress(addressHex);
}

describe("NXPCClaim Contract", () => {
  const deployFixture = async () => {
    const [owner, executor, user, MockForwarder] = await ethers.getSigners();

    const ERC20BridgeToken = await ethers.getContractFactory("ERC20BridgeToken");
    const erc20BridgeToken = await ERC20BridgeToken.deploy(MockForwarder.address, owner.address);
    await erc20BridgeToken.deployed();

    const Proxy = await ethers.getContractFactory("MockMinProxy");
    const proxy = await Proxy.deploy();
    await proxy.deployed();
    const receipt = await (await proxy.createNXPC(erc20BridgeToken.address)).wait();
    if (receipt.events === undefined) {
      throw new Error("No events found");
    }

    const nxpcAddress = bytes32ToAddress(receipt.events[0].topics[2]);
    const NXPC = await ethers.getContractFactory("ERC20BridgeToken");
    const nxpc = NXPC.attach(nxpcAddress) as ERC20BridgeToken;

    await nxpc.initialize("NXPC", "NXPC", 18, owner.address);

    const NXPCClaim = await ethers.getContractFactory("NXPCClaimERC20");
    const nxpcClaim = await NXPCClaim.deploy(nxpc.address);

    await nxpcClaim.deployed();
    await nxpcClaim.connect(owner).grantExecutor(executor.address);

    const dummyAddr = user.address.slice(0, 41).toLowerCase();
    const addrs = Array.from({ length: 9 }, (_, i) => dummyAddr + (i + 1));
    addrs.push(user.address);
    const amounts = Array.from({ length: 9 }, (_) => ethers.utils.parseEther("1").toBigInt());
    amounts.push(ethers.utils.parseEther("1").toBigInt());
    const claimTree = createClaimTree(addrs, amounts);

    return {
      nxpcClaim,
      owner,
      executor,
      user,
      dummyAddr,
      claimTree,
      nxpc,
    };
  };

  const setRewardWithoutNXPCFixture = async () => {
    const { owner, user, nxpcClaim, claimTree, nxpc } = await loadFixture(deployFixture);

    await nxpcClaim.setReward(claimTree.merkleRoot, deadline);

    return { nxpcClaim, owner, user, nxpc, claimTree };
  };

  const setRewardFixture = async () => {
    const { owner, user, executor, nxpcClaim, claimTree, nxpc } = await loadFixture(deployFixture);

    await nxpcClaim.setReward(claimTree.merkleRoot, deadline);
    await nxpc.mint(owner.address, ethers.utils.parseEther("10"));
    await nxpc.connect(owner).transfer(nxpcClaim.address, ethers.utils.parseEther("10"));

    return { nxpcClaim, owner, executor, user, nxpc, claimTree };
  };

  describe("setReward", async () => {
    // 정상 동작 (executor, owner)
    it("set reward - success", async () => {
      const { nxpcClaim, claimTree } = await loadFixture(deployFixture);
      await expect(nxpcClaim.setReward(claimTree.merkleRoot, deadline)).to.emit(nxpcClaim, "SetReward");
    });

    // executor가 아닌 경우 - 실패
    it("set reward by non executor - fail", async () => {
      const { nxpcClaim, user, claimTree } = await loadFixture(deployFixture);
      await expect(nxpcClaim.connect(user).setReward(claimTree.merkleRoot, deadline)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    // 머클 루트가 0인 경우 - 실패
    it("set reward with zero markle root - fail", async () => {
      const { nxpcClaim } = await loadFixture(deployFixture);
      await expect(nxpcClaim.setReward(zeroByte, deadline)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });

    // 입력된 deadline이 0인 경우 - 실패
    it("set reward with zero deadline - fail", async () => {
      const { nxpcClaim, claimTree } = await loadFixture(deployFixture);
      await expect(nxpcClaim.setReward(claimTree.merkleRoot, 0)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });

    // 다시 보상을 등록하려는 경우 - 실패
    it("set reward again - fail", async () => {
      const { nxpcClaim, claimTree } = await loadFixture(deployFixture);
      await expect(nxpcClaim.setReward(claimTree.merkleRoot, deadline)).to.emit(nxpcClaim, "SetReward");

      await expect(nxpcClaim.setReward(claimTree.merkleRoot, deadline)).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
  });

  describe("claim", async () => {
    // 정상동작
    it("claim - success", async () => {
      const { nxpcClaim, user, claimTree } = await loadFixture(setRewardFixture);
      const amount = ethers.utils.parseEther("1");
      await expect(nxpcClaim.connect(user).claim(user.address, amount, claimTree.proof[9])).to.emit(nxpcClaim, "Claim");
    });

    // 이미 클레임한 경우 - 실패
    it("already claim - fail", async () => {
      const { nxpcClaim, user, claimTree } = await loadFixture(setRewardFixture);
      const amount = ethers.utils.parseEther("1");
      await expect(nxpcClaim.connect(user).claim(user.address, amount, claimTree.proof[9])).to.emit(nxpcClaim, "Claim");

      await expect(nxpcClaim.connect(user).claim(user.address, amount, claimTree.proof[9])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });

    // 데드라인 지난 경우 - 실패
    it("deadline is gone - fail", async () => {
      const { nxpcClaim, user, claimTree } = await loadFixture(setRewardFixture);
      const amount = ethers.utils.parseEther("1");
      await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 100]);
      await ethers.provider.send("evm_mine", []);

      await expect(nxpcClaim.connect(user).claim(user.address, amount, claimTree.proof[9])).to.be.revertedWith(
        nxErrors.NXPCClaim.timeout
      );
    });

    // user, amount, proof 이상한 데이터인 경우 - 실패
    it("wrong data or proof - fail", async () => {
      const { nxpcClaim, owner, user, claimTree } = await loadFixture(setRewardFixture);
      const amount = ethers.utils.parseEther("1");
      const wrongAmount = ethers.utils.parseEther("2");

      // user가 다름
      await expect(nxpcClaim.connect(user).claim(owner.address, amount, claimTree.proof[9])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );

      // amount가 다름
      await expect(nxpcClaim.connect(user).claim(user.address, wrongAmount, claimTree.proof[9])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );

      // proof가 다름
      await expect(nxpcClaim.connect(user).claim(user.address, amount, claimTree.proof[8])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });

    // 컨트랙트에 돈 없을 경우 - 실패
    it("no NXPC in contract - success", async () => {
      const { nxpcClaim, user, claimTree } = await loadFixture(setRewardWithoutNXPCFixture);
      const amount = ethers.utils.parseEther("1");
      await expect(nxpcClaim.connect(user).claim(user.address, amount, claimTree.proof[9])).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
  });

  describe("extendDeadline", async () => {
    // 정상 동작 (executor, owner)
    it("extend deadline - success", async () => {
      const { nxpcClaim } = await loadFixture(setRewardFixture);
      const newDeadline = deadline + 100000;
      await expect(nxpcClaim.extendDeadline(newDeadline)).to.emit(nxpcClaim, "ExtendDeadline");
      const newDeadlineFromContract = await nxpcClaim.deadline();
      expect(newDeadlineFromContract).to.equal(newDeadline);
    });

    // 호출 지갑이 executor가 아닌 경우 - 실패
    it("extend deadline by non executor - fail", async () => {
      const { nxpcClaim, user } = await loadFixture(setRewardFixture);
      await expect(nxpcClaim.connect(user).extendDeadline(deadline + 100000)).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });

    // 새로운 deadline이 기존 deadline보다 작은 경우 - 실패
    it("extend deadline with smaller value - fail", async () => {
      const { nxpcClaim } = await loadFixture(setRewardFixture);
      await expect(nxpcClaim.extendDeadline(deadline - 100000)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });

    // 기존 deadline이 이미 지난 경우 - 실패
    it("extend deadline with past deadline - fail", async () => {
      const { nxpcClaim } = await loadFixture(setRewardFixture);
      await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 100]);
      await ethers.provider.send("evm_mine", []);
      await expect(nxpcClaim.extendDeadline(deadline + 100000)).to.be.revertedWith(nxErrors.NXPCClaim.timeout);
    });
  });

  describe("afterDeadline", async () => {
    // 정상 동작 (owner)
    it("after deadline - success", async () => {
      const { nxpcClaim, executor } = await loadFixture(setRewardFixture);
      await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 100]);
      await ethers.provider.send("evm_mine", []);
      await expect(nxpcClaim.afterDeadline(executor.address)).to.emit(nxpcClaim, "Close");
    });

    // 호출 지갑이 owner가 아닌 경우 - 실패
    it("after deadline by non owner - fail", async () => {
      const { nxpcClaim, user } = await loadFixture(setRewardFixture);
      await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 100]);
      await ethers.provider.send("evm_mine", []);
      await expect(nxpcClaim.connect(user).afterDeadline(user.address)).to.be.revertedWith(nxErrors.ownerForbidden);
    });

    // 아직 deadline이 지나지 않은 경우 - 실패
    it("after deadline before deadline - fail", async () => {
      const { nxpcClaim, executor } = await loadFixture(setRewardFixture);
      await expect(nxpcClaim.afterDeadline(executor.address)).to.be.revertedWith(nxErrors.NXPCClaim.invalidRequest);
    });

    // 잘못된 주소를 입력한 경우 - 실패
    it("after deadline with wrong address - fail", async () => {
      const { nxpcClaim } = await loadFixture(setRewardFixture);
      await expect(nxpcClaim.afterDeadline(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
  });

  describe("emergencyWithdraw", async () => {
    // 정상 동작 (owner)
    it("emergency withdraw - success", async () => {
      const { nxpcClaim, owner } = await loadFixture(setRewardFixture);
      await nxpcClaim.pause();
      await expect(nxpcClaim.emergencyWithdraw(owner.address)).to.emit(nxpcClaim, "Close");
    });

    // pause가 되어있지 않은 경우 - 실패
    it("emergency withdraw when not paused - fail", async () => {
      const { nxpcClaim, owner } = await loadFixture(setRewardFixture);
      await expect(nxpcClaim.emergencyWithdraw(owner.address)).to.be.revertedWith(nxErrors.Pausable.notPaused);
    });

    // 호출 지갑이 owner가 아닌 경우 - 실패
    it("emergency withdraw by non owner - fail", async () => {
      const { nxpcClaim, user } = await loadFixture(setRewardFixture);
      await nxpcClaim.pause();
      await expect(nxpcClaim.connect(user).emergencyWithdraw(user.address)).to.be.revertedWith(nxErrors.ownerForbidden);
    });

    // 잘못된 주소로 보냈을 경우 - 실패
    it("emergency withdraw with wrong address - fail", async () => {
      const { nxpcClaim } = await loadFixture(setRewardFixture);
      await nxpcClaim.pause();
      await expect(nxpcClaim.emergencyWithdraw(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.NXPCClaim.invalidRequest
      );
    });
  });
});
