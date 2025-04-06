import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createBasket, createReward } from "../lib/merkleTree/merkleTree";
import nxErrors from "../lib/nx-errors";

describe("NXPCDistributor Contract", () => {
  const dummyAddress = "0x0200000000000000000000000000000000000000";
  const deployFixture = async () => {
    const [owner, executor, forwarder, user, vault] = await ethers.getSigners();
    const MockEquip = await ethers.getContractFactory("MockEquip");
    const mockEquip = await MockEquip.connect(owner).deploy();
    const NXPCAmountManager = await ethers.getContractFactory("NXPCAmountManager");
    const nxpcAmountManager = await NXPCAmountManager.deploy(dummyAddress);
    const NXPCDistributor = await ethers.getContractFactory("NXPCDistributor");
    const nxpcDistributor = await NXPCDistributor.connect(owner).deploy(
      forwarder.address,
      mockEquip.address,
      nxpcAmountManager.address,
      vault.address
    );
    const tokenIds = Array.from({ length: 100 }, (_, i) => BigInt(i));

    await nxpcDistributor.deployed();
    await nxpcDistributor.connect(owner).grantExecutor(executor.address);
    await mockEquip.deployed();
    await mockEquip.connect(user).setApprovalForAll(nxpcDistributor.address, true);
    await mockEquip.connect(vault).setApprovalForAll(nxpcDistributor.address, true);
    await nxpcAmountManager.setMintAllowlist(nxpcDistributor.address, true);

    // Fake burned amount for test
    await nxpcAmountManager.setBurnAllowlist(owner.address, true);
    await nxpcAmountManager.addBurnedAmount(1000000000000000000n);
    await nxpcAmountManager.setBurnAllowlist(owner.address, false);

    await Promise.all(
      tokenIds.map(async (e) => {
        await mockEquip.connect(owner).mint(user.address, e, e);
      })
    );

    await mockEquip.connect(owner).mint(user.address, 0, 101);

    return {
      mockEquip,
      nxpcDistributor,
      nxpcAmountManager,
    };
  };

  describe("Deployment", async () => {
    it("Initial value", async () => {
      const [owner, executor, forwarder] = await ethers.getSigners();
      const { nxpcDistributor, mockEquip } = await loadFixture(deployFixture);

      expect(await nxpcDistributor.currentRound()).to.equal(1n);
      expect(await nxpcDistributor.isStarted()).to.equal(false);
      expect(await nxpcDistributor.equip()).to.equal(mockEquip.address);
      expect(await nxpcDistributor.owner()).to.equal(owner.address);
      expect(await nxpcDistributor.isExecutor(executor.address)).to.equal(true);
      expect(await nxpcDistributor.isTrustedForwarder(forwarder.address)).to.equal(true);
    });
  });

  describe("Pre-round", async () => {
    const validNumber = 1n;
    const invalidNumber = 0n;
    const validMerkleRoot = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const invalidMerkleRoot = "0x0000000000000000000000000000000000000000000000000000000000000000";

    describe("setBasket function", async () => {
      it("Succeed when calling `setBasket` function by owner/executor", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(nxpcDistributor.connect(executor).setBasket(validNumber, validNumber, validMerkleRoot)).to.be.emit(
          nxpcDistributor,
          "SetBasket"
        );
      });

      it("Reverts on calls to set basket with past-round number", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(
          nxpcDistributor.connect(executor).setBasket(invalidNumber, validNumber, validMerkleRoot)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidRound);
      });

      it("Reverts on calls to set basket with zero length", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(
          nxpcDistributor.connect(executor).setBasket(validNumber, invalidNumber, validMerkleRoot)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidLength);
      });

      it("Reverts on calls to set basket with zero bytes merkle root", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(
          nxpcDistributor.connect(executor).setBasket(validNumber, validNumber, invalidMerkleRoot)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidMerkleRoot);
      });

      it("Reverts when attempting to set basket when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(
          nxpcDistributor.connect(user).setBasket(validNumber, validNumber, validMerkleRoot)
        ).to.be.revertedWith(nxErrors.NextOwnable.executorForbidden);
      });
    });

    describe("start function", async () => {
      const setBasketFixture = async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await nxpcDistributor.connect(executor).setBasket(validNumber, validNumber, validMerkleRoot);
      };

      it("Succeed when calling `start` function by owner/executor", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(setBasketFixture);
        await expect(nxpcDistributor.connect(executor).start()).to.be.emit(nxpcDistributor, "Start");
      });

      it("Reverts on calls to start round when current status is true", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(setBasketFixture);
        await nxpcDistributor.connect(executor).start();

        expect(await nxpcDistributor.isStarted()).to.equal(true);
        await expect(nxpcDistributor.connect(executor).start()).to.be.revertedWith(
          nxErrors.NXPCDistributor.alreadyStarted
        );
      });

      it("Reverts on calls to start round when current merkle root is zero bytes", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(nxpcDistributor.connect(executor).start()).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidMerkleRoot
        );
      });

      it("Reverts when attempting to start round when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(setBasketFixture);
        await expect(nxpcDistributor.connect(user).start()).to.be.revertedWith(nxErrors.NextOwnable.executorForbidden);
      });
    });

    describe("setVault function", async () => {
      it("Succeed when calling `setVault` function by owner", async () => {
        const [owner, , , , vault, newVault] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        expect(await nxpcDistributor.vault()).to.equal(vault.address);

        await nxpcDistributor.connect(owner).setVault(newVault.address);

        expect(await nxpcDistributor.vault()).to.equal(newVault.address);
      });

      it("Reverts on calls to set vault when current status is true", async () => {
        const [owner, , , , , newVault] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await nxpcDistributor.setBasket(1n, 1n, validMerkleRoot);
        await nxpcDistributor.start();
        await expect(nxpcDistributor.connect(owner).setVault(newVault.address)).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidRound
        );
      });

      it("Reverts when attempting to set vault when caller is not an owner", async () => {
        const [, executor, , , , newVault] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(nxpcDistributor.connect(executor).setVault(newVault.address)).to.be.revertedWith(
          nxErrors.Ownable.notOwner
        );
      });

      it("Reverts when attempting to set vault when value is zero address", async () => {
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(nxpcDistributor.setVault(ethers.constants.AddressZero)).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidAddress
        );
      });
    });
  });

  describe("Creation-round", async () => {
    const startFixture = async () => {
      const [, executor] = await ethers.getSigners();
      const { nxpcDistributor } = await loadFixture(deployFixture);
      const tokenId = 0;
      const invalidTokenId = 101;
      const slot = Array.from({ length: 4 }, (_) => 1n);
      const tree = createBasket(1n, slot);

      await nxpcDistributor.connect(executor).setBasket(1n, 4n, tree.merkleRoot);
      await nxpcDistributor.connect(executor).start();

      return { tokenId, slot, tree, invalidTokenId };
    };

    describe("deposit / end function", async () => {
      it("Succeed when calling `deposit` function by owner/executor", async () => {
        const [, executor, , user, vault] = await ethers.getSigners();
        const { nxpcDistributor, mockEquip } = await loadFixture(deployFixture);
        const { tokenId, slot, tree } = await loadFixture(startFixture);

        expect(await mockEquip.ownerOf(tokenId)).to.equal(user.address);

        await expect(
          nxpcDistributor.connect(executor).deposit(tokenId, user.address, slot[tokenId], tree.proof[tokenId])
        ).to.be.emit(nxpcDistributor, "Deposit");

        expect(await mockEquip.ownerOf(tokenId)).to.equal(vault.address);
      });

      it("Succeed when calling `batchDeposit` function by owner/executor", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));

        await expect(
          nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, tree.proof)
        ).to.be.emit(nxpcDistributor, "BasketIsFull");
      });

      it("Successfully end round when basket is full", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);

        await Promise.all(
          slot
            .slice(0, 3)
            .map(async (_, i) => nxpcDistributor.connect(executor).deposit(i, user.address, slot[i], tree.proof[i]))
        );

        await expect(nxpcDistributor.connect(executor).deposit(3, user.address, slot[3], tree.proof[3])).to.be.emit(
          nxpcDistributor,
          "BasketIsFull"
        );

        await expect(nxpcDistributor.connect(executor).end()).to.be.emit(nxpcDistributor, "End");
      });

      it("Reverts on calls to deposit NFT when current status is false", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree } = await loadFixture(startFixture);

        await nxpcDistributor.connect(executor).emergencyEnd();
        await expect(
          nxpcDistributor.connect(executor).deposit(tokenId, user.address, slot[tokenId], tree.proof[tokenId])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.alreadyEnded);
      });

      it("Reverts on calls to deposit NFT when current slot is full", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree, invalidTokenId } = await loadFixture(startFixture);

        await nxpcDistributor.connect(executor).deposit(tokenId, user.address, slot[tokenId], tree.proof[tokenId]);
        await expect(
          nxpcDistributor.connect(executor).deposit(invalidTokenId, user.address, slot[tokenId], tree.proof[tokenId])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidSlot);
      });

      it("Reverts on calls to deposit NFTs when current slot is full", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree, invalidTokenId } = await loadFixture(startFixture);

        await expect(
          nxpcDistributor
            .connect(executor)
            .batchDeposit([tokenId, invalidTokenId], user.address, slot.slice(0, 2), [
              tree.proof[tokenId],
              tree.proof[tokenId],
            ])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidSlot);
      });

      it("Reverts on calls to deposit NFTs when current status is false", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));
        await nxpcDistributor.connect(executor).emergencyEnd();
        await expect(
          nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, tree.proof)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.alreadyEnded);
      });

      it("Reverts on calls to deposit NFT with invalid merkle proof", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree } = await loadFixture(startFixture);

        await expect(
          nxpcDistributor.connect(executor).deposit(tokenId, user.address, slot[tokenId], tree.proof[tokenId + 1])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidProof);
      });

      it("Reverts on calls to deposit NFTs with invalid merkle proof", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot } = await loadFixture(startFixture);
        const invalidLeaf = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const tokenIds = slot.map((_, i) => BigInt(i));
        const proof = slot.map((_) => [invalidLeaf]);

        await expect(
          nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, proof)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidProof);
      });

      it("Reverts on calls to deposit NFTs with invalid array length", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));

        await expect(
          nxpcDistributor.connect(executor).batchDeposit(tokenIds.slice(1), user.address, slot, tree.proof)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidInputLength);

        await expect(
          nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, tree.proof.slice(1))
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidInputLength);
      });

      it("Reverts when attempting to deposit NFT when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree } = await loadFixture(startFixture);

        await expect(
          nxpcDistributor.connect(user).deposit(tokenId, user.address, slot[tokenId], tree.proof[tokenId])
        ).to.be.revertedWith(nxErrors.NextOwnable.executorForbidden);
      });

      it("Reverts when attempting to deposit NFTs when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));

        await expect(
          nxpcDistributor.connect(user).batchDeposit(tokenIds, user.address, slot, tree.proof)
        ).to.be.revertedWith(nxErrors.NextOwnable.executorForbidden);
      });

      it("Reverts when attempting to deposit NFT when deposit to zero address", async () => {
        const [, , ,] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree } = await loadFixture(startFixture);

        await expect(
          nxpcDistributor.deposit(tokenId, ethers.constants.AddressZero, slot[tokenId], tree.proof[tokenId])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidAddress);
      });

      it("Reverts when attempting to deposit NFTs when deposit to zero address", async () => {
        const [, , ,] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));

        await expect(
          nxpcDistributor.batchDeposit(tokenIds, ethers.constants.AddressZero, slot, tree.proof)
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidAddress);
      });
    });

    describe("withdraw function", async () => {
      const depositFixture = async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId, slot, tree } = await loadFixture(startFixture);

        await nxpcDistributor.connect(executor).deposit(tokenId, user.address, slot[tokenId], tree.proof[tokenId]);

        return { tokenId };
      };

      it("Succeed when calling `withdraw` function by owner/executor", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor, mockEquip } = await loadFixture(deployFixture);
        const { tokenId } = await loadFixture(depositFixture);

        await expect(nxpcDistributor.connect(executor).withdraw(tokenId, user.address)).to.be.emit(
          nxpcDistributor,
          "Withdraw"
        );

        expect(await mockEquip.ownerOf(tokenId)).to.equal(user.address);
      });

      it("Reverts on calls to withdraw NFT when current status is false", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId } = await loadFixture(depositFixture);

        await nxpcDistributor.connect(executor).emergencyEnd();
        await expect(nxpcDistributor.connect(executor).withdraw(tokenId, user.address)).to.be.revertedWith(
          nxErrors.NXPCDistributor.alreadyEnded
        );
      });

      it("Reverts on calls to withdraw NFT with invalid depositor", async () => {
        const [, executor, , , invalidUser] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId } = await loadFixture(depositFixture);

        await expect(nxpcDistributor.connect(executor).withdraw(tokenId, invalidUser.address)).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidDepositor
        );
      });

      it("Reverts when attempting to withdraw NFT when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenId } = await loadFixture(depositFixture);

        await expect(nxpcDistributor.connect(user).withdraw(tokenId, user.address)).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });
    });

    describe("batchWithdraw function", async () => {
      const depositFixture = async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i)).slice(1);

        await nxpcDistributor
          .connect(executor)
          .batchDeposit(tokenIds, user.address, slot.slice(1), tree.proof.slice(1));

        return { tokenIds };
      };

      it("Succeed when calling `batchWithdraw` function by owner/executor", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenIds } = await loadFixture(depositFixture);

        await expect(nxpcDistributor.connect(executor).batchWithdraw(tokenIds, user.address)).to.be.emit(
          nxpcDistributor,
          "Withdraw"
        );
      });

      it("Reverts on calls to withdraw NFT when current status is false", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenIds } = await loadFixture(depositFixture);

        await nxpcDistributor.connect(executor).emergencyEnd();
        await expect(nxpcDistributor.connect(executor).batchWithdraw(tokenIds, user.address)).to.be.revertedWith(
          nxErrors.NXPCDistributor.alreadyEnded
        );
      });

      it("Reverts on calls to withdraw NFT with invalid depositor", async () => {
        const [, executor, , , invalidUser] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenIds } = await loadFixture(depositFixture);

        await expect(nxpcDistributor.connect(executor).batchWithdraw(tokenIds, invalidUser.address)).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidDepositor
        );
      });

      it("Reverts when attempting to withdraw NFT when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tokenIds } = await loadFixture(depositFixture);

        await expect(nxpcDistributor.connect(user).batchWithdraw(tokenIds, user.address)).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });
    });

    describe("end function", async () => {
      it("Succeed when calling `end` function by owner/executor", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));

        await nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, tree.proof);
        await expect(nxpcDistributor.connect(executor).end()).to.be.emit(nxpcDistributor, "End");
      });

      it("Reverts when attempting to end when basket is not full", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(startFixture);
        await expect(nxpcDistributor.connect(executor).end()).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidBasket
        );
      });

      it("Reverts when attempting to end when caller is not an owner/executor", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { slot, tree } = await loadFixture(startFixture);
        const tokenIds = slot.map((_, i) => BigInt(i));

        await nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, tree.proof);
        await expect(nxpcDistributor.connect(user).end()).to.be.revertedWith(nxErrors.NextOwnable.executorForbidden);
      });

      it("Reverts on calls to end when current status is false", async () => {
        const [, executor, ,] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(nxpcDistributor.connect(executor).end()).to.be.revertedWith(nxErrors.NXPCDistributor.alreadyEnded);
      });
    });

    describe("emergencyEnd function", async () => {
      it("Succeed when calling `end` function by owner/executor", async () => {
        const [, executor, ,] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(startFixture);
        await expect(nxpcDistributor.connect(executor).emergencyEnd()).to.be.emit(nxpcDistributor, "End");
      });

      it("Reverts when attempting to end when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(startFixture);
        await expect(nxpcDistributor.connect(user).emergencyEnd()).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });

      it("Reverts on calls to end when current status is false", async () => {
        const [, executor, ,] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await expect(nxpcDistributor.connect(executor).emergencyEnd()).to.be.revertedWith(
          nxErrors.NXPCDistributor.alreadyEnded
        );
      });
    });
  });

  describe("Post-round", async () => {
    const endFixture = async () => {
      const [, executor, , user] = await ethers.getSigners();
      const { nxpcDistributor, mockEquip } = await loadFixture(deployFixture);
      const slot = Array.from({ length: 4 }, (_) => 1n);
      const basketTree = createBasket(1n, slot);
      const tokenIds = slot.map((_, i) => BigInt(i));

      await nxpcDistributor.connect(executor).setBasket(1n, 4n, basketTree.merkleRoot);
      await nxpcDistributor.connect(executor).start();
      await nxpcDistributor.connect(executor).batchDeposit(tokenIds, user.address, slot, basketTree.proof);
      await nxpcDistributor.connect(executor).end();

      const reward = Array.from({ length: 4 }, (_, i) => BigInt(i + 1));
      const tree = createReward(
        1n,
        Array.from({ length: 4 }, (_, i) => (i !== 3 ? user.address : mockEquip.address)),
        reward
      );

      return {
        tree,
      };
    };

    describe("setReward function", async () => {
      const validRound = 1n;
      const invalidRound = 2n;
      const invalidMerkleRoot = "0x0000000000000000000000000000000000000000000000000000000000000000";

      it("Succeed when calling `setReward` function by owner/executor", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree } = await loadFixture(endFixture);

        await expect(nxpcDistributor.connect(executor).setReward(validRound, tree.merkleRoot)).to.be.emit(
          nxpcDistributor,
          "SetReward"
        );
      });

      it("Reverts on calls to set reward with future-round number", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree } = await loadFixture(endFixture);

        await expect(nxpcDistributor.connect(executor).setReward(invalidRound, tree.merkleRoot)).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidRound
        );
      });

      it("Reverts on calls to set reward with zero bytes merkle root", async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);

        await loadFixture(endFixture);
        await expect(nxpcDistributor.connect(executor).setReward(validRound, invalidMerkleRoot)).to.be.revertedWith(
          nxErrors.NXPCDistributor.invalidMerkleRoot
        );
      });

      it("Reverts when attempting to set reward when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree } = await loadFixture(endFixture);

        await expect(nxpcDistributor.connect(user).setReward(validRound, tree.merkleRoot)).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });
    });

    describe("claim function", async () => {
      const setRewardFixture = async () => {
        const [, executor] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree } = await loadFixture(endFixture);
        const round = 1n;

        await nxpcDistributor.connect(executor).setReward(round, tree.merkleRoot, {
          value: 10n,
        });

        return { tree, round };
      };

      it("Succeed when calling `claim` function by owner/executor", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree, round } = await loadFixture(setRewardFixture);
        const userBalance = await ethers.provider.getBalance(user.address);

        await expect(nxpcDistributor.connect(executor).claim(round, user.address, 1n, tree.proof[0])).to.be.emit(
          nxpcDistributor,
          "Claim"
        );

        expect(await ethers.provider.getBalance(user.address)).to.equal(userBalance.add(1n));
      });

      it("Reverts on calls to claim reward when round isn't claimable", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree } = await loadFixture(endFixture);
        const round = 1n;

        await expect(
          nxpcDistributor.connect(executor).claim(round, user.address, 1n, tree.proof[0])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.notClaimable);
      });

      it("Reverts on calls to claim reward when leaf already claimed", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree, round } = await loadFixture(setRewardFixture);

        await nxpcDistributor.connect(executor).claim(round, user.address, 1n, tree.proof[0]);
        await expect(
          nxpcDistributor.connect(executor).claim(round, user.address, 1n, tree.proof[0])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.alreadyClaimed);
      });

      it("Reverts on calls to claim reward when transfer failed", async () => {
        const [, executor, ,] = await ethers.getSigners();
        const { nxpcDistributor, mockEquip } = await loadFixture(deployFixture);
        const { tree, round } = await loadFixture(setRewardFixture);

        await expect(
          nxpcDistributor.connect(executor).claim(round, mockEquip.address, 4n, tree.proof[3])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.transferFailed);
      });

      it("Reverts on calls to claim reward with invalid merkle proof", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree, round } = await loadFixture(setRewardFixture);

        await expect(
          nxpcDistributor.connect(executor).claim(round, user.address, 1n, tree.proof[1])
        ).to.be.revertedWith(nxErrors.NXPCDistributor.invalidProof);
      });

      it("Reverts when attempting to claim reward when caller is not an owner/executor", async () => {
        const [, , , user] = await ethers.getSigners();
        const { nxpcDistributor } = await loadFixture(deployFixture);
        const { tree, round } = await loadFixture(setRewardFixture);

        await expect(nxpcDistributor.connect(user).claim(round, user.address, 1n, tree.proof[0])).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });
    });
  });

  describe("Additional test cases", async () => {
    describe("4x4 basket, 2 items per slot", async () => {
      const startFixture = async () => {
        const [owner, executor, forwarder, user, vault] = await ethers.getSigners();
        const MockEquip = await ethers.getContractFactory("MockEquip");
        const mockEquip = await MockEquip.connect(owner).deploy();
        const NXPCAmountManager = await ethers.getContractFactory("NXPCAmountManager");
        const nxpcAmountManager = await NXPCAmountManager.deploy(dummyAddress);
        const NXPCDistributor = await ethers.getContractFactory("NXPCDistributor");
        const nxpcDistributor = await NXPCDistributor.connect(owner).deploy(
          forwarder.address,
          mockEquip.address,
          nxpcAmountManager.address,
          vault.address
        );
        const tokenIds = Array.from({ length: 32 }, (_, i) => BigInt(i));

        await nxpcDistributor.deployed();
        await nxpcDistributor.connect(owner).grantExecutor(executor.address);
        await mockEquip.deployed();
        await mockEquip.connect(user).setApprovalForAll(nxpcDistributor.address, true);
        await mockEquip.connect(vault).setApprovalForAll(nxpcDistributor.address, true);
        await Promise.all(
          tokenIds.map(async (e) => {
            await mockEquip.connect(owner).mint(user.address, e / 2n, e);
          })
        );
        await nxpcAmountManager.setMintAllowlist(nxpcDistributor.address, true);

        // Fake burned amount for test
        await nxpcAmountManager.setBurnAllowlist(owner.address, true);
        await nxpcAmountManager.addBurnedAmount(1000000000000000000n);
        await nxpcAmountManager.setBurnAllowlist(owner.address, false);

        const round = 1n;
        const slot = Array.from({ length: 16 }, (_) => 2n);
        const tree = createBasket(round, slot);

        await nxpcDistributor.connect(executor).setBasket(round, BigInt(slot.length), tree.merkleRoot);
        await nxpcDistributor.connect(executor).start();

        return { round, nxpcDistributor, slot, tree };
      };

      it("Deposit & Withdraw flow", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { round, nxpcDistributor, slot, tree } = await loadFixture(startFixture);

        await nxpcDistributor.connect(executor).deposit(0, user.address, slot[0], tree.proof[0]);

        expect(await nxpcDistributor.currentBasketLength(round)).to.equal(0n);

        await nxpcDistributor.connect(executor).deposit(1, user.address, slot[1], tree.proof[0]);

        expect(await nxpcDistributor.currentBasketLength(round)).to.equal(1n);

        await nxpcDistributor.connect(executor).withdraw(0, user.address);

        expect(await nxpcDistributor.currentBasketLength(round)).to.equal(0n);

        await nxpcDistributor.connect(executor).withdraw(1, user.address);
      });

      it("Full basket flow", async () => {
        const [, executor, , user] = await ethers.getSigners();
        const { nxpcDistributor, slot, tree } = await loadFixture(startFixture);
        const even = Array.from({ length: 16 }, (_, i) => i * 2);
        const odd = Array.from({ length: 16 }, (_, i) => i * 2 + 1);

        await nxpcDistributor.connect(executor).batchDeposit(even, user.address, slot, tree.proof);
        await expect(nxpcDistributor.connect(executor).batchDeposit(odd, user.address, slot, tree.proof)).to.be.emit(
          nxpcDistributor,
          "BasketIsFull"
        );
      });
    });
  });
});
