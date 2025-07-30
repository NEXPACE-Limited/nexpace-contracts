import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { contributionReward } from "../lib/contributionReward/contributionReward";
import { increase, increaseTo } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import nxErrors from "../lib/nx-errors";

describe("ContributionRewardDistributor Contract", () => {
  const deployFixture = async () => {
    const [owner, executor, contributionRewardWallet, forwarder] = await ethers.getSigners();
    const ContributionRewardDistributor = await ethers.getContractFactory("ContributionRewardDistributor");
    const contributionRewardDistributor = await ContributionRewardDistributor.connect(owner).deploy(
      forwarder.address,
      contributionRewardWallet.address,
      0
    );
    const reward = contributionReward();

    await contributionRewardDistributor.deployed();
    await contributionRewardDistributor.grantExecutor(executor.address);

    await setBalance(contributionRewardDistributor.address, 800000000000000000000000000n);
    await increaseTo(await contributionRewardDistributor.BASE_TIMESTAMP());

    return {
      contributionRewardDistributor,
      contributionRewardWallet,
      reward,
    };
  };

  describe("Deployment", async () => {
    it("Initial value", async () => {
      const [owner, executor, contributionRewardWallet] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);

      expect(await contributionRewardDistributor.BASE_TIMESTAMP()).to.equal(1747252800n);
      expect(await contributionRewardDistributor.WEEK()).to.equal(86400n * 7n);
      expect(await contributionRewardDistributor.TAYLOR_DECIMAL()).to.equal(1000000000000000000n);
      expect(await contributionRewardDistributor.RESULT_DECIMAL()).to.equal(1000n);
      expect(await contributionRewardDistributor.contributionRewardWallet()).to.equal(contributionRewardWallet.address);
      expect(await contributionRewardDistributor.owner()).to.equal(owner.address);
      expect(await contributionRewardDistributor.isExecutor(executor.address)).to.equal(true);
      expect(await contributionRewardDistributor.transferAmount(0n)).to.equal(0n);
    });

    it("Already Distributed Reward check", async () => {
      const [owner, , contributionRewardWallet, forwarder] = await ethers.getSigners();
      const baseTimestramp = 1747252800n;
      const week = 86400n * 7n;
      const alreadyDistributed = 3n;

      await increaseTo(baseTimestramp + alreadyDistributed * week + 86400n);

      const ContributionRewardDistributor = await ethers.getContractFactory("ContributionRewardDistributor");

      await expect(
        ContributionRewardDistributor.connect(owner).deploy(
          forwarder.address,
          contributionRewardWallet.address,
          alreadyDistributed + 1n
        )
      ).to.be.revertedWith(nxErrors.ContributionRewardDistributor.invalidDate);

      const contributionRewardDistributor = await ContributionRewardDistributor.connect(owner).deploy(
        forwarder.address,
        contributionRewardWallet.address,
        alreadyDistributed
      );

      await contributionRewardDistributor.deployed();
      await setBalance(contributionRewardDistributor.address, 800000000000000000000000000n);

      expect(await contributionRewardDistributor.isDistributed(1n)).to.equal(true);
      expect(await contributionRewardDistributor.isDistributed(2n)).to.equal(true);
      expect(await contributionRewardDistributor.isDistributed(3n)).to.equal(true);
      expect(await contributionRewardDistributor.isDistributed(4n)).to.equal(false);

      const contributionRewardDistributorBalance = await ethers.provider.getBalance(
        contributionRewardDistributor.address
      );
      const contributionRewardWalletBalance = await ethers.provider.getBalance(contributionRewardWallet.address);

      await increase(week);
      await contributionRewardDistributor.connect(owner).distribute(4n);

      expect(await ethers.provider.getBalance(contributionRewardDistributor.address)).to.equal(
        contributionRewardDistributorBalance.sub(await contributionRewardDistributor.transferAmount(4n))
      );
      expect(await ethers.provider.getBalance(contributionRewardWallet.address)).to.equal(
        contributionRewardWalletBalance.add(await contributionRewardDistributor.transferAmount(4n))
      );
    });
  });

  // describe("Precision check", async () => {
  //   it("weekly transfer amount check", async () => {
  //     const { contributionRewardDistributor, reward } = await loadFixture(deployFixture);

  //     let isError = false;

  //     for (let i = 0; i < reward.length; i++) {
  //       const transfeNXPCAmount = await contributionRewardDistributor.transferAmount(i + 1);

  //       if (transfeNXPCAmount.div("1000000000000000000").toNumber() !== reward[i][1]) {
  //         console.log(
  //           `일일 보상량 다름, n == ${i + 1}, orig = ${transfeNXPCAmount
  //             .div("1000000000000000000")
  //             .toNumber()}, calc = ${reward[i][1]}`
  //         );
  //         isError = true;
  //       }
  //     }

  //     expect(isError).to.equal(false);
  //   });

  //   it("cumulative transfer amount check", async () => {
  //     const { contributionRewardDistributor } = await loadFixture(deployFixture);
  //     const reward = contributionReward();
  //     let isError = false;

  //     for (let i = 0; i < reward.length; i++) {
  //       const cumulativeNXPCAmount = await contributionRewardDistributor.cumulativeAmount(i + 1);

  //       if (cumulativeNXPCAmount.div("1000000000000000000").toNumber() !== reward[i][2]) {
  //         console.log(
  //           `누적 보상량 다름, n == ${i + 1}, orig = ${cumulativeNXPCAmount
  //             .div("1000000000000000000")
  //             .toNumber()}, calc = ${reward[i][2]}`
  //         );
  //         isError = true;
  //       }
  //     }

  //     expect(isError).to.equal(false);
  //   });
  // });

  describe("Contribution reward", async () => {
    it("Week 1-5", async () => {
      const [, executor, contributionRewardWallet] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);

      for (let i = 1; i <= 5; i++) {
        const contributionRewardDistributorBalance = await ethers.provider.getBalance(
          contributionRewardDistributor.address
        );
        const contributionRewardWalletBalance = await ethers.provider.getBalance(contributionRewardWallet.address);

        await increase(await contributionRewardDistributor.WEEK());
        await contributionRewardDistributor.connect(executor).distribute(i);

        expect(await ethers.provider.getBalance(contributionRewardDistributor.address)).to.equal(
          contributionRewardDistributorBalance.sub(await contributionRewardDistributor.transferAmount(i))
        );
        expect(await ethers.provider.getBalance(contributionRewardWallet.address)).to.equal(
          contributionRewardWalletBalance.add(await contributionRewardDistributor.transferAmount(i))
        );
      }
    });

    it("Reverts when attempting to distribute NXPC when caller is not an owner/executor", async () => {
      const [, , user] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);

      await increase(await contributionRewardDistributor.WEEK());
      await expect(contributionRewardDistributor.connect(user).distribute(1)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });

    it("Reverts when attempting to distribute NXPC when already distributed", async () => {
      const [, executor] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);

      await increase(await contributionRewardDistributor.WEEK());
      await contributionRewardDistributor.connect(executor).distribute(1);
      await expect(contributionRewardDistributor.connect(executor).distribute(1)).to.be.revertedWith(
        nxErrors.ContributionRewardDistributor.alreadyDistributed
      );
    });

    it("Reverts when attempting to distribute NXPC when using invalid week", async () => {
      const [, executor] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);

      await expect(contributionRewardDistributor.connect(executor).distribute(0)).to.be.revertedWith(
        nxErrors.ContributionRewardDistributor.invalidWeek
      );
    });

    it("Reverts when attempting to distribute NXPC when distribution date not reached", async () => {
      const [, executor] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);

      await expect(contributionRewardDistributor.connect(executor).distribute(1)).to.be.revertedWith(
        nxErrors.ContributionRewardDistributor.invalidDate
      );
    });

    it("Reverts when attempting to distribute NXPC when internal transfer failed", async () => {
      const [owner, executor] = await ethers.getSigners();
      const { contributionRewardDistributor } = await loadFixture(deployFixture);
      const MockContract = await ethers.getContractFactory("MockEquip");
      const mockContract = await MockContract.connect(owner).deploy();

      await contributionRewardDistributor.connect(owner).setContributionRewardWallet(mockContract.address);
      await increase(await contributionRewardDistributor.WEEK());
      await expect(contributionRewardDistributor.connect(executor).distribute(1)).to.be.revertedWith(
        nxErrors.ContributionRewardDistributor.transferFailed
      );
    });
  });

  describe("NextOwnable", async () => {
    describe("setContributionRewardWallet function", async () => {
      it("Succeed when calling `setContributionRewardWallet` function by owner", async () => {
        const [owner, , , contributionRewardWallet] = await ethers.getSigners();
        const { contributionRewardDistributor } = await loadFixture(deployFixture);

        await contributionRewardDistributor
          .connect(owner)
          .setContributionRewardWallet(contributionRewardWallet.address);

        expect(await contributionRewardDistributor.contributionRewardWallet()).to.equal(
          contributionRewardWallet.address
        );
      });

      it("Reverts when attempting to set contributionRewardWallet when caller is not an owner", async () => {
        const [owner] = await ethers.getSigners();
        const { contributionRewardDistributor } = await loadFixture(deployFixture);

        await expect(
          contributionRewardDistributor
            .connect(owner)
            .setContributionRewardWallet("0x0000000000000000000000000000000000000000")
        ).to.be.revertedWith(nxErrors.ContributionRewardDistributor.invalidAddress);
      });

      it("Reverts when attempting to set contributionRewardWallet when caller is not an owner", async () => {
        const [, executor, , contributionRewardWallet] = await ethers.getSigners();
        const { contributionRewardDistributor } = await loadFixture(deployFixture);

        await expect(
          contributionRewardDistributor.connect(executor).setContributionRewardWallet(contributionRewardWallet.address)
        ).to.be.revertedWith(nxErrors.Ownable.notOwner);
      });
    });

    describe("emergencyWithdraw function", async () => {
      it("Succeed when calling `emergencyWithdraw` function by owner/executor", async () => {
        const [owner, executor] = await ethers.getSigners();
        const { contributionRewardDistributor } = await loadFixture(deployFixture);
        const executorBalance = await ethers.provider.getBalance(executor.address);
        const amount = 800000000000000000000000000n;

        await contributionRewardDistributor.connect(owner).emergencyWithdraw(executor.address, amount);

        expect(await ethers.provider.getBalance(executor.address)).to.equal(executorBalance.add(amount));
      });

      it("Reverts when attempting to withdraw NXPC when caller is not an owner", async () => {
        const [, executor] = await ethers.getSigners();
        const { contributionRewardDistributor } = await loadFixture(deployFixture);
        const amount = 800000000000000000000000000n;

        await expect(
          contributionRewardDistributor.connect(executor).emergencyWithdraw(executor.address, amount)
        ).to.be.revertedWith(nxErrors.Ownable.notOwner);
      });

      it("Reverts when attempting to withdraw NXPC when transfer failed", async () => {
        const [owner] = await ethers.getSigners();
        const { contributionRewardDistributor } = await loadFixture(deployFixture);
        const amount = 800000000000000000000000000n;
        const MockContract = await ethers.getContractFactory("MockEquip");
        const mockContract = await MockContract.connect(owner).deploy();

        await expect(
          contributionRewardDistributor.connect(owner).emergencyWithdraw(mockContract.address, amount)
        ).to.be.revertedWith(nxErrors.ContributionRewardDistributor.transferFailed);
      });
    });
  });
});
