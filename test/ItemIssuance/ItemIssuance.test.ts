import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";
import { expectAmount } from "../lib/contracthelper/util/fission";
import nxErrors from "../lib/nx-errors";

const universeName = "MapleStory Universe";
const universeId = 1;
const thousand = 1000;
const oneBasket = 1;
const billion = parseEther("1000000000");
const invalidAddress = "0x0000000000000000000000000000000000000000";

enum RequestStatus {
  REQUESTED,
  CONFIRMED,
  REJECTED,
}

describe("ItemIssuance Contract", () => {
  const dummyAddress = "0x0200000000000000000000000000000000000000";
  const deployFixture = async () => {
    const [owner, executor, forwarder, blackhole] = await ethers.getSigners();

    const NXPCAmountManager = await ethers.getContractFactory("NXPCAmountManager");
    const nxpcAmountManager = await NXPCAmountManager.deploy(dummyAddress);
    const ItemIssuance = await ethers.getContractFactory("ItemIssuance");
    const itemIssuance = await ItemIssuance.deploy(forwarder.address, blackhole.address, nxpcAmountManager.address);
    const MockEquip = await ethers.getContractFactory("MockEquip");
    const mockEquip = await MockEquip.deploy();

    await itemIssuance.deployed();
    await itemIssuance.connect(owner).grantExecutor(executor.address);
    await nxpcAmountManager.deployed();
    await nxpcAmountManager.setBurnAllowlist(itemIssuance.address, true);
    await itemIssuance.createUniverse(universeName);
    await mockEquip.deployed();
    await itemIssuance.registerItem721Contract(universeId, mockEquip.address);

    return {
      nxpcAmountManager,
      itemIssuance,
      mockEquip,
    };
  };

  describe("Deployment", async () => {
    it("Initial value", async () => {
      const [, executor, forwarder] = await ethers.getSigners();
      const { itemIssuance } = await loadFixture(deployFixture);

      expect(await itemIssuance.isExecutor(executor.address)).to.equal(true);
      expect(await itemIssuance.isTrustedForwarder(forwarder.address)).to.equal(true);
      expect(await itemIssuance.universeName(universeId)).to.equal(universeName);
      expect(await itemIssuance.itemPoolAmount(universeId)).to.equal(0);
    });

    describe("Item 721 Register", async () => {
      it("Succeed when register / unregister item contract by owner", async () => {
        const { itemIssuance, mockEquip } = await loadFixture(deployFixture);

        expect(await itemIssuance.universeOfItem721(mockEquip.address)).to.equal(universeId);

        await expect(itemIssuance.unregisterItem721Contract(mockEquip.address)).to.be.emit(
          itemIssuance,
          "Item721ContractUnregistered"
        );

        expect(await itemIssuance.universeOfItem721(mockEquip.address)).to.equal(0);

        await expect(itemIssuance.registerItem721Contract(universeId, mockEquip.address)).to.be.emit(
          itemIssuance,
          "Item721ContractRegistered"
        );

        expect(await itemIssuance.universeOfItem721(mockEquip.address)).to.equal(universeId);
      });

      it("Succeed when add item base by item contract", async () => {
        const { itemIssuance, mockEquip } = await loadFixture(deployFixture);

        await expect(mockEquip.setLimitSupply(itemIssuance.address, thousand, thousand)).to.be.emit(
          itemIssuance,
          "ItemBaseAmountAdded"
        );
      });

      it("Reverts when attempting to register item contract when universeId is not exist", async () => {
        const { itemIssuance, mockEquip } = await loadFixture(deployFixture);

        await expect(itemIssuance.registerItem721Contract(universeId + 1, mockEquip.address)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidUniverse
        );
      });

      it("Reverts when attempting to register item contract when invalid item contract address", async () => {
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.registerItem721Contract(universeId, invalidAddress)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidAddress
        );
      });

      it("Reverts when attempting to register / unregister item contract when caller is not an owner", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance, mockEquip } = await loadFixture(deployFixture);

        await expect(itemIssuance.connect(user).unregisterItem721Contract(mockEquip.address)).to.be.revertedWith(
          nxErrors.Ownable.notOwner
        );

        await expect(
          itemIssuance.connect(user).registerItem721Contract(universeId, mockEquip.address)
        ).to.be.revertedWith(nxErrors.Ownable.notOwner);
      });

      it("Reverts when attempting to register / unregister item contract when already registered / unregistered", async () => {
        const { itemIssuance, mockEquip } = await loadFixture(deployFixture);

        await expect(itemIssuance.registerItem721Contract(universeId, mockEquip.address)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidAddress
        );

        await itemIssuance.unregisterItem721Contract(mockEquip.address);

        await expect(itemIssuance.unregisterItem721Contract(mockEquip.address)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidAddress
        );
      });

      it("Reverts when attempting to add item base when caller is not an item contract", async () => {
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.addItem721BaseAmount(thousand, thousand)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidUniverse
        );
      });
    });
  });

  describe("ItemIssuance Cycle", async () => {
    const addItemFixture = async () => {
      const [, executor] = await ethers.getSigners();
      const { itemIssuance, mockEquip } = await loadFixture(deployFixture);

      await itemIssuance.connect(executor).addItem(universeId, billion);

      return {
        itemIssuance,
        mockEquip,
      };
    };

    const requestItemIssuanceFixture = async () => {
      const [, , , , user] = await ethers.getSigners();
      const { itemIssuance } = await loadFixture(addItemFixture);

      await itemIssuance.connect(user).requestItemIssuance(universeId, thousand, oneBasket, {
        value: expectAmount(thousand, await itemIssuance.itemPoolAmount(universeId)),
      });

      const request = await itemIssuance.requests(1);

      return {
        itemIssuance,
        request,
      };
    };

    describe("createUniverse function", async () => {
      it("Succeed when calling `createUniverse` function by owner", async () => {
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.createUniverse(universeName)).to.be.emit(itemIssuance, "UniverseCreated");
      });

      it("Reverts when attempting to create universe when invalid universe name", async () => {
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.createUniverse("")).to.be.revertedWith(nxErrors.ItemIssuance.invalidRequest);
      });

      it("Reverts when attempting to create universe when caller is not an owner", async () => {
        const [, executor] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.connect(executor).createUniverse(universeName)).to.be.revertedWith(
          nxErrors.Ownable.notOwner
        );
      });
    });

    describe("addItem function", async () => {
      it("Succeed when calling `addItem` function by executor", async () => {
        const [, executor] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(deployFixture);

        await itemIssuance.connect(executor).addItem(universeId, billion);

        expect(await itemIssuance.itemPoolAmount(universeId)).to.equal(billion);
        expect(await itemIssuance.expectAmount(universeId, thousand)).to.equal(
          expectAmount(thousand, await itemIssuance.itemPoolAmount(universeId))
        );
      });

      it("Reverts when attempting to add items when universe doesn't exist", async () => {
        const [, executor] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.connect(executor).addItem(universeId + 1, billion)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidUniverse
        );
      });

      it("Reverts when attempting to add items when caller is not an executor", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.connect(user).addItem(universeId, billion)).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });
    });

    describe("requestItemIssuance function", async () => {
      it("Succeed when calling `requestItemIssuance` function by user with a valid request", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(addItemFixture);
        const amount = 1000;

        await expect(
          itemIssuance.connect(user).requestItemIssuance(universeId, amount, oneBasket, {
            value: expectAmount(amount, await itemIssuance.itemPoolAmount(universeId)),
          })
        ).to.be.emit(itemIssuance, "ItemRequested");

        const request = await itemIssuance.requests(1);

        expect(request.status).to.equal(RequestStatus.REQUESTED);
      });

      it("Reverts when attempting to request items when universe doesn't exist", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(addItemFixture);
        const amount = 1000;

        await expect(itemIssuance.expectAmount(universeId + 1, amount)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidUniverse
        );
        await expect(
          itemIssuance.connect(user).requestItemIssuance(universeId + 1, amount, oneBasket, {
            value: expectAmount(amount, await itemIssuance.itemPoolAmount(universeId)),
          })
        ).to.be.revertedWith(nxErrors.ItemIssuance.invalidUniverse);
      });

      it("Reverts when attempting to request items with large amount items", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(addItemFixture);
        const largeAmount = billion.add(1);

        await setBalance(user.address, 2000000000n * 10n ** 18n);
        await expect(itemIssuance.expectAmount(universeId, largeAmount)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidAmount
        );
        await expect(
          itemIssuance.connect(user).requestItemIssuance(universeId, largeAmount, oneBasket, {
            value: expectAmount(largeAmount, await itemIssuance.itemPoolAmount(universeId)),
          })
        ).to.be.revertedWith(nxErrors.ItemIssuance.invalidAmount);
      });

      it("Reverts when attempting to request items with zero value", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(addItemFixture);
        const amount = 1000;

        await expect(
          itemIssuance.connect(user).requestItemIssuance(universeId, amount, oneBasket, {
            value: 0,
          })
        ).to.be.revertedWith(nxErrors.ItemIssuance.invalidAmount);
      });
    });

    describe("confirmItem function", async () => {
      it("Succeed when calling `confirmItem` function by executor with a valid request", async () => {
        const [, executor, , blackhole] = await ethers.getSigners();
        const { itemIssuance, request } = await loadFixture(requestItemIssuanceFixture);
        const prevBlackholeBalance = await blackhole.getBalance();

        expect(request.nxpcAmount).to.equal(expectAmount(thousand, await itemIssuance.itemPoolAmount(universeId)));
        await expect(itemIssuance.connect(executor).confirmRequest(request.universe, request.id, true)).to.be.emit(
          itemIssuance,
          "RequestConfirmed"
        );
        const afterRequest = await itemIssuance.requests(1);
        expect(await blackhole.getBalance()).to.equal(prevBlackholeBalance.add(request.nxpcAmount));
        expect(afterRequest.status).to.equal(RequestStatus.CONFIRMED);
      });

      it("Succeed when calling `confirmItem` function by executor with an invalid request", async () => {
        const [, executor, , , user] = await ethers.getSigners();
        const { itemIssuance, request } = await loadFixture(requestItemIssuanceFixture);
        const prevUserBalance = await user.getBalance();

        expect(request.nxpcAmount).to.equal(expectAmount(thousand, await itemIssuance.itemPoolAmount(universeId)));
        await expect(itemIssuance.connect(executor).confirmRequest(request.universe, request.id, false)).to.be.emit(
          itemIssuance,
          "RequestRejected"
        );
        const afterRequest = await itemIssuance.requests(1);
        expect(await user.getBalance()).to.equal(prevUserBalance.add(request.nxpcAmount));
        expect(afterRequest.status).to.equal(RequestStatus.REJECTED);
      });

      it("Reverts when attempting to confirm request when universe doesn't exist", async () => {
        const [, executor] = await ethers.getSigners();
        const { itemIssuance, request } = await loadFixture(requestItemIssuanceFixture);

        await expect(
          itemIssuance.connect(executor).confirmRequest(request.universe.add(1), request.id, false)
        ).to.be.revertedWith(nxErrors.ItemIssuance.invalidUniverse);
      });

      it("Reverts when attempting to confirm request when requestId doesn't match", async () => {
        const [, executor] = await ethers.getSigners();
        const { itemIssuance, request } = await loadFixture(requestItemIssuanceFixture);

        await expect(itemIssuance.connect(executor).confirmRequest(request.universe, 0, false)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidRequest
        );
      });

      it("Reverts when attempting to confirm request when caller is not an executor", async () => {
        const [, , , , user] = await ethers.getSigners();
        const { itemIssuance, request } = await loadFixture(requestItemIssuanceFixture);

        await expect(itemIssuance.connect(user).confirmRequest(request.universe, request.id, false)).to.be.revertedWith(
          nxErrors.NextOwnable.executorForbidden
        );
      });

      it("Reverts when attempting to confirm request when request already confirmed", async () => {
        const [, executor] = await ethers.getSigners();
        const { itemIssuance, request } = await loadFixture(requestItemIssuanceFixture);

        await expect(itemIssuance.connect(executor).confirmRequest(request.universe, request.id, true)).to.be.emit(
          itemIssuance,
          "RequestConfirmed"
        );
        await expect(
          itemIssuance.connect(executor).confirmRequest(request.universe, request.id, false)
        ).to.be.revertedWith(nxErrors.ItemIssuance.invalidStatus);
      });
    });
  });

  describe("Ownable", async () => {
    describe("setBlackhole function", async () => {
      it("Succeed when calling `setBlackhole` function by owner", async () => {
        const [owner, , , blackhole, newBlackhole] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(deployFixture);

        expect(await itemIssuance.blackhole()).to.equal(blackhole.address);

        await expect(itemIssuance.connect(owner).setBlackhole(newBlackhole.address)).to.be.emit(
          itemIssuance,
          "SetBlackhole"
        );

        expect(await itemIssuance.blackhole()).to.equal(newBlackhole.address);
      });

      it("Reverts when attempting to set blackhole when caller is not an owner", async () => {
        const [, executor, , , newBlackhole] = await ethers.getSigners();
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.connect(executor).setBlackhole(newBlackhole.address)).to.be.revertedWith(
          nxErrors.Ownable.notOwner
        );
      });

      it("Reverts when attempting to set blackhole with invalid address", async () => {
        const { itemIssuance } = await loadFixture(deployFixture);

        await expect(itemIssuance.setBlackhole(invalidAddress)).to.be.revertedWith(
          nxErrors.ItemIssuance.invalidAddress
        );
      });
    });
  });

  describe("view functions", async () => {
    it("Reverts when attempting to get itemPoolAmount when universe doesn't exist", async () => {
      const { itemIssuance } = await loadFixture(deployFixture);

      await expect(itemIssuance.itemPoolAmount(universeId + 1)).to.be.revertedWith(
        nxErrors.ItemIssuance.invalidUniverse
      );
    });

    it("Reverts when attempting to get universeName when universe doesn't exist", async () => {
      const { itemIssuance } = await loadFixture(deployFixture);

      await expect(itemIssuance.universeName(universeId + 1)).to.be.revertedWith(nxErrors.ItemIssuance.invalidUniverse);
    });
  });
});
