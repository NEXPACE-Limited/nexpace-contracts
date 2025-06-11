import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, ContractTransaction } from "ethers";
import EventHelper, { checkEventMap, genEventMap } from "../lib/contracthelper/util/event-helper";
import { VRFRequestRetriedEvent } from "../../typechain-types/contracts/VRF/VRFManager";
import VRFTest from "../lib/testenv/vrf";
import nxErrors from "../lib/nx-errors";

const w = (x: Promise<ContractTransaction>) => x.then((y) => y.wait());

const eventMap = {
  VRFManagerChainlink: ["VRFRequestRetried"],
} as const;

interface EventMap {
  VRFRequestRetried: VRFRequestRetriedEvent;
}

checkEventMap<EventMap, typeof eventMap>();

describe("VRFManagerChainlink", function () {
  async function fixture() {
    const [vrfManagerChainlinkOwner, oracle, alice, bob] = await ethers.getSigners();

    // Set Oracle
    const oracleVrfTest = new VRFTest();
    await oracleVrfTest.before(oracle);
    await oracleVrfTest.beforeEach();

    // Deploy
    const VRFManagerChainlink = await ethers.getContractFactory("VRFManagerChainlink", vrfManagerChainlinkOwner);
    const vrfManagerChainlink = await VRFManagerChainlink.deploy(oracleVrfTest.contracts.coordinator.address);

    const MockVRFRequester = await ethers.getContractFactory("MockVRFRequester");
    const mockVRFRequester = await MockVRFRequester.deploy(vrfManagerChainlink.address);

    const eventHelper = new EventHelper<EventMap>(genEventMap({ VRFManagerChainlink }, eventMap));
    // Add Requester
    const maxVRFPendingTime = BigNumber.from(300);
    await vrfManagerChainlink.setConfig(oracleVrfTest.keyHash, 1n, 100000);
    await alice.sendTransaction({
      to: vrfManagerChainlink.address,
      value: ethers.utils.parseEther("100"),
    });
    await vrfManagerChainlink.subscribe();
    await vrfManagerChainlink.addVRFRequester(mockVRFRequester.address, maxVRFPendingTime);
    await vrfManagerChainlink.addVRFRequester(vrfManagerChainlinkOwner.address, maxVRFPendingTime);

    const requestReceipt = await w(mockVRFRequester.request());

    return {
      vrfManagerChainlinkOwner,
      oracle,
      alice,
      bob,
      vrfManagerChainlink,
      mockVRFRequester,
      maxVRFPendingTime,
      oracleVrfTest,
      eventHelper,
      requestReceipt,
    };
  }

  before(async function () {
    this.timeout(10000);
    await loadFixture(fixture);
  });
  describe("requestVRF", function () {
    it("should be reverted when not called by the requester", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.connect(alice).requestVRF(1)).to.be.revertedWith(
        nxErrors.VRFManager.requesterForbidden
      );
    });
  });
  describe("retryVRFRequest", function () {
    it("success - retry several time", async function () {
      const { vrfManagerChainlink, alice, mockVRFRequester, eventHelper } = await loadFixture(fixture);
      await mockVRFRequester.connect(alice).request();
      let requestId = await mockVRFRequester.requestId();
      const id = requestId;

      {
        await time.increase(300);
        const receipt = await w(vrfManagerChainlink.retryRequestVRF(requestId));
        const retriedEvent = eventHelper.findAndParse("VRFRequestRetried", receipt.events ?? []);
        requestId = retriedEvent!.args.newRequestId;
      }
      expect((await vrfManagerChainlink.vrfRequest(id)).id).to.equal(0);

      {
        await time.increase(300);
        const receipt = await w(vrfManagerChainlink.retryRequestVRF(requestId));
        const retriedEvent = eventHelper.findAndParse("VRFRequestRetried", receipt.events ?? []);
        requestId = retriedEvent!.args.newRequestId;
      }
      expect((await vrfManagerChainlink.vrfRequest(requestId)).id).to.equal(id);
    });
    it("should be reverted when vrf request is alive", async function () {
      const { vrfManagerChainlink, alice, mockVRFRequester } = await loadFixture(fixture);
      await mockVRFRequester.connect(alice).request();
      const requestId = await mockVRFRequester.requestId();
      await expect(vrfManagerChainlink.retryRequestVRF(requestId)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequestId
      );
    });
    it("should be reverted when seed already fulfilled", async function () {
      const { vrfManagerChainlink, mockVRFRequester, oracleVrfTest, alice } = await loadFixture(fixture);
      const drawReceipt = await w(mockVRFRequester.connect(alice).request());
      await oracleVrfTest.eventsEmitted(drawReceipt);
      const requestId = await mockVRFRequester.requestId();
      await expect(vrfManagerChainlink.connect(alice).retryRequestVRF(requestId)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequestId
      );
    });
  });
  describe("setConfig", function () {
    it("success", async function () {
      const { vrfManagerChainlink, oracleVrfTest } = await loadFixture(fixture);
      const subId = (await vrfManagerChainlink.requestConfig()).subId;
      await vrfManagerChainlink.setConfig(oracleVrfTest.keyHash, 2n, 100000);

      const result = await vrfManagerChainlink.requestConfig();
      expect(result.keyHash).to.equal(oracleVrfTest.keyHash);
      expect(result.requestConfirmations).to.equal(2n);
      expect(result.callbackGasLimit).to.equal(100000);
      expect(result.subId).to.equal(subId);
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, alice, oracleVrfTest } = await loadFixture(fixture);

      await expect(vrfManagerChainlink.connect(alice).setConfig(oracleVrfTest.keyHash, 2n, 100000)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
  });
  describe("addVRFRequester", function () {
    it("success", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.connect(alice).addVRFRequester(alice.address, 1000)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
  });
  describe("removeVRFRequester", function () {
    it("success", async function () {
      const { vrfManagerChainlink, vrfManagerChainlinkOwner } = await loadFixture(fixture);
      await vrfManagerChainlink.removeVRFRequester(vrfManagerChainlinkOwner.address);
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, vrfManagerChainlinkOwner, alice } = await loadFixture(fixture);
      await expect(
        vrfManagerChainlink.connect(alice).removeVRFRequester(vrfManagerChainlinkOwner.address)
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("rawFulfillRandomWords", function () {
    it("should be reverted when not called by the coordinator", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.connect(alice).rawFulfillRandomWords(1, [1])).to.be.revertedWithCustomError(
        vrfManagerChainlink,
        "OnlyCoordinatorCanFulfill"
      );
    });
    it("should be reverted when deadline expired", async function () {
      const { vrfManagerChainlink, mockVRFRequester, alice } = await loadFixture(fixture);
      await vrfManagerChainlink.setCoordinator(await alice.getAddress());

      await mockVRFRequester.connect(alice).request();
      const requestId = await mockVRFRequester.requestId();

      await time.increase(3000);
      await expect(vrfManagerChainlink.connect(alice).rawFulfillRandomWords(requestId, [1])).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequestId
      );
    });
  });
  describe("setCoordinator", function () {
    it("success", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await vrfManagerChainlink.setCoordinator(await alice.getAddress());
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, alice, bob } = await loadFixture(fixture);
      await expect(
        vrfManagerChainlink.connect(bob).setCoordinator(await alice.getAddress())
      ).to.be.revertedWithCustomError(vrfManagerChainlink, "OnlyOwnerOrCoordinator");
    });
  });
  describe("subscribe", function () {
    it("should be reverted when already subscribed", async function () {
      const { vrfManagerChainlink } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.subscribe()).to.be.revertedWith(
        "VRFManagerChainlink/subscribeConflict: already subscribed"
      );
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.connect(alice).subscribe()).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("unsubscribe", function () {
    it("success", async function () {
      const { vrfManagerChainlink, oracleVrfTest, requestReceipt } = await loadFixture(fixture);
      const fulfillTxs = await oracleVrfTest.eventsEmitted(requestReceipt);
      expect(fulfillTxs, "fulfill txs").to.have.lengthOf(1);
      await vrfManagerChainlink.unsubscribe(vrfManagerChainlink.address);
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.connect(alice).unsubscribe(vrfManagerChainlink.address)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, oracleVrfTest, requestReceipt } = await loadFixture(fixture);
      const fulfillTxs = await oracleVrfTest.eventsEmitted(requestReceipt);
      expect(fulfillTxs, "fulfill txs").to.have.lengthOf(1);
      await vrfManagerChainlink.unsubscribe(vrfManagerChainlink.address);
      await expect(vrfManagerChainlink.unsubscribe(vrfManagerChainlink.address)).to.be.revertedWith(
        "VRFManagerChainlink/unsubscribeConflict: not subscribed yet"
      );
    });
  });
  describe("topUpSubscription", function () {
    it("success", async function () {
      const { vrfManagerChainlink } = await loadFixture(fixture);
      await vrfManagerChainlink.topUpSubscription();
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.connect(alice).topUpSubscription()).to.be.revertedWith(
        nxErrors.executorForbidden
      );
    });
  });
  describe("changeMaxVRFPendingTime", function () {
    it("sucess", async function () {
      const { vrfManagerChainlink, mockVRFRequester } = await loadFixture(fixture);
      await vrfManagerChainlink.changeMaxVRFPendingTime(mockVRFRequester.address, 1000);
    });
    it("success - set deadline to zero", async function () {
      const { vrfManagerChainlink, mockVRFRequester, alice, oracleVrfTest } = await loadFixture(fixture);
      await vrfManagerChainlink.changeMaxVRFPendingTime(mockVRFRequester.address, 0);

      const drawReceipt = await w(mockVRFRequester.connect(alice).request());
      await oracleVrfTest.eventsEmitted(drawReceipt);
    });
    it("setter(changeMaxVRFPendingTime) - should be reverted when not called by the owner", async function () {
      const { vrfManagerChainlink, mockVRFRequester, alice } = await loadFixture(fixture);
      await expect(
        vrfManagerChainlink.connect(alice).changeMaxVRFPendingTime(mockVRFRequester.address, 100)
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("addVRFREquester", function () {
    it("sucess", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await vrfManagerChainlink.addVRFRequester(alice.address, 1000);
    });
    it("should be reverted when VRF Requester is already added", async function () {
      const { vrfManagerChainlink, mockVRFRequester } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.addVRFRequester(mockVRFRequester.address, 1000)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequesterAddress
      );
    });
  });
  describe("removeVRFRequester", function () {
    it("sucess", async function () {
      const { vrfManagerChainlink, mockVRFRequester } = await loadFixture(fixture);
      await vrfManagerChainlink.removeVRFRequester(mockVRFRequester.address);
    });
    it("should be reverted when VRF Requester is not exist", async function () {
      const { vrfManagerChainlink, alice } = await loadFixture(fixture);
      await expect(vrfManagerChainlink.removeVRFRequester(alice.address)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequesterAddress
      );
    });
  });
  describe("view function", function () {
    it("vrfRequester", async function () {
      const { vrfManagerChainlink, mockVRFRequester, maxVRFPendingTime } = await loadFixture(fixture);
      const result = await vrfManagerChainlink.vrfRequester(mockVRFRequester.address);
      expect(result.isVRFRequester).to.equal(true);
      expect(result.maxVRFPendingTime).to.equal(maxVRFPendingTime);
    });
    it("vrfRequest", async function () {
      const { vrfManagerChainlink, alice, mockVRFRequester, maxVRFPendingTime } = await loadFixture(fixture);
      await mockVRFRequester.connect(alice).request();
      const requestId = await mockVRFRequester.requestId();
      const result = await vrfManagerChainlink.vrfRequest(requestId);
      const timestamp = await time.latest();
      expect(result.deadline).to.equal(maxVRFPendingTime.add(BigNumber.from(timestamp)));
      expect(result.numWords).to.equal(1);
      expect(result.requester).to.equal(mockVRFRequester.address);
      expect(result.id).to.equal(requestId);
    });
  });
});
