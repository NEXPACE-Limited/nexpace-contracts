import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, ContractTransaction } from "ethers";
import EventHelper, { checkEventMap, genEventMap } from "../lib/contracthelper/util/event-helper";
import { VRFRequestRetriedEvent } from "../../typechain-types/contracts/VRF/VRFManager";
import VRFTest from "../lib/testenv/vrf-chainlink2.0";
import nxErrors from "../lib/nx-errors";

const w = (x: Promise<ContractTransaction>) => x.then((y) => y.wait());

const eventMap = {
  VRFManagerHoracle: ["VRFRequestRetried"],
} as const;

interface EventMap {
  VRFRequestRetried: VRFRequestRetriedEvent;
}

checkEventMap<EventMap, typeof eventMap>();

describe("VRFManagerHoracle", function () {
  async function fixture() {
    const [vrfManagerHoracleOwner, oracle, alice, bob] = await ethers.getSigners();

    // Set Oracle
    const oracleVrfTest = new VRFTest();
    await oracleVrfTest.before(oracle);
    await oracleVrfTest.beforeEach();

    // Deploy
    const VRFManagerHoracle = await ethers.getContractFactory("VRFManagerHoracle", vrfManagerHoracleOwner);
    const vrfManagerHoracle = await VRFManagerHoracle.deploy(
      oracleVrfTest.contracts.coordinator.address,
      oracleVrfTest.contracts.link.address
    );
    const MockVRFRequester = await ethers.getContractFactory("MockVRFRequester");
    const mockVRFRequester = await MockVRFRequester.deploy(vrfManagerHoracle.address);

    const eventHelper = new EventHelper<EventMap>(genEventMap({ VRFManagerHoracle }, eventMap));
    // Add Requester
    const maxVRFPendingTime = BigNumber.from(300);
    await oracleVrfTest.contracts.link.mint(vrfManagerHoracle.address, ethers.utils.parseEther("1000000000"));
    await vrfManagerHoracle.setConfig(oracleVrfTest.keyHash, 1n, 100000);
    await alice.sendTransaction({
      to: vrfManagerHoracle.address,
      value: ethers.utils.parseEther("100"),
    });
    await vrfManagerHoracle.subscribe();
    await vrfManagerHoracle.addVRFRequester(mockVRFRequester.address, maxVRFPendingTime);
    await vrfManagerHoracle.addVRFRequester(vrfManagerHoracleOwner.address, maxVRFPendingTime);
    const requestReceipt = await w(mockVRFRequester.request());

    return {
      vrfManagerHoracleOwner,
      oracle,
      alice,
      bob,
      vrfManagerHoracle,
      mockVRFRequester,
      maxVRFPendingTime,
      oracleVrfTest,
      requestReceipt,
      eventHelper,
    };
  }

  before(async function () {
    this.timeout(10000);
    await loadFixture(fixture);
  });
  describe("requestVRF", function () {
    it("should be reverted when not called by the requester", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.connect(alice).requestVRF(1)).to.be.revertedWith(
        nxErrors.VRFManager.requesterForbidden
      );
    });
  });
  describe("retryVRFRequest", function () {
    it("success - retry several time", async function () {
      const { vrfManagerHoracle, alice, mockVRFRequester, eventHelper } = await loadFixture(fixture);
      await mockVRFRequester.connect(alice).request();
      let requestId = await mockVRFRequester.requestId();
      const id = requestId;

      {
        await time.increase(300);
        const receipt = await w(vrfManagerHoracle.retryRequestVRF(requestId));
        const retriedEvent = eventHelper.findAndParse("VRFRequestRetried", receipt.events ?? []);
        requestId = retriedEvent!.args.newRequestId;
      }
      expect((await vrfManagerHoracle.vrfRequest(id)).id).to.equal(0);

      {
        await time.increase(300);
        const receipt = await w(vrfManagerHoracle.retryRequestVRF(requestId));
        const retriedEvent = eventHelper.findAndParse("VRFRequestRetried", receipt.events ?? []);
        requestId = retriedEvent!.args.newRequestId;
      }
      expect((await vrfManagerHoracle.vrfRequest(requestId)).id).to.equal(id);
    });
    it("should be reverted when vrf request is alive", async function () {
      const { vrfManagerHoracle, alice, mockVRFRequester } = await loadFixture(fixture);
      await mockVRFRequester.connect(alice).request();
      const requestId = await mockVRFRequester.requestId();
      await expect(vrfManagerHoracle.retryRequestVRF(requestId)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequestId
      );
    });
    it("should be reverted when seed already fulfilled", async function () {
      const { vrfManagerHoracle, mockVRFRequester, oracleVrfTest, alice } = await loadFixture(fixture);
      const drawReceipt = await w(mockVRFRequester.connect(alice).request());
      await oracleVrfTest.eventsEmitted(drawReceipt);
      const requestId = await mockVRFRequester.requestId();
      await expect(vrfManagerHoracle.connect(alice).retryRequestVRF(requestId)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequestId
      );
    });
  });
  describe("setConfig", function () {
    it("success", async function () {
      const { vrfManagerHoracle, oracleVrfTest } = await loadFixture(fixture);
      const subId = (await vrfManagerHoracle.requestConfig()).subId;
      await vrfManagerHoracle.setConfig(oracleVrfTest.keyHash, 2n, 100000);

      const result = await vrfManagerHoracle.requestConfig();
      expect(result.keyHash).to.equal(oracleVrfTest.keyHash);
      expect(result.requestConfirmations).to.equal(2n);
      expect(result.callbackGasLimit).to.equal(100000);
      expect(result.subId).to.equal(subId);
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, alice, oracleVrfTest } = await loadFixture(fixture);

      await expect(vrfManagerHoracle.connect(alice).setConfig(oracleVrfTest.keyHash, 2n, 100000)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
  });
  describe("addVRFRequester", function () {
    it("success", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.connect(alice).addVRFRequester(alice.address, 1000)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
  });
  describe("removeVRFRequester", function () {
    it("success", async function () {
      const { vrfManagerHoracle, vrfManagerHoracleOwner } = await loadFixture(fixture);
      await vrfManagerHoracle.removeVRFRequester(vrfManagerHoracleOwner.address);
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, vrfManagerHoracleOwner, alice } = await loadFixture(fixture);
      await expect(
        vrfManagerHoracle.connect(alice).removeVRFRequester(vrfManagerHoracleOwner.address)
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("rawFulfillRandomWords", function () {
    it("should be reverted when not called by the coordinator", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.connect(alice).rawFulfillRandomWords(1, [1])).to.be.revertedWithCustomError(
        vrfManagerHoracle,
        "OnlyCoordinatorCanFulfill"
      );
    });
  });
  describe("subscribe", function () {
    it("should be reverted when already subscribed", async function () {
      const { vrfManagerHoracle } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.subscribe()).to.be.revertedWith(
        "VRFManagerHoracle/subscribeConflict: already subscribed"
      );
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.connect(alice).subscribe()).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("unsubscribe", function () {
    it("success", async function () {
      const { vrfManagerHoracle, oracleVrfTest, requestReceipt } = await loadFixture(fixture);
      const fulfillTxs = await oracleVrfTest.eventsEmitted(requestReceipt);
      expect(fulfillTxs, "fulfill txs").to.have.lengthOf(1);
      await vrfManagerHoracle.unsubscribe(vrfManagerHoracle.address);
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.connect(alice).unsubscribe(vrfManagerHoracle.address)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, oracleVrfTest, requestReceipt } = await loadFixture(fixture);
      const fulfillTxs = await oracleVrfTest.eventsEmitted(requestReceipt);
      expect(fulfillTxs, "fulfill txs").to.have.lengthOf(1);
      await vrfManagerHoracle.unsubscribe(vrfManagerHoracle.address);
      await expect(vrfManagerHoracle.unsubscribe(vrfManagerHoracle.address)).to.be.revertedWith(
        "VRFManagerHoracle/unsubscribeConflict: not subscribed yet"
      );
    });
  });
  describe("topUpSubscription", function () {
    it("success", async function () {
      const { vrfManagerHoracle } = await loadFixture(fixture);
      await vrfManagerHoracle.topUpSubscription();
    });
    it("should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.connect(alice).topUpSubscription()).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("changeMaxVRFPendingTime", function () {
    it("sucess", async function () {
      const { vrfManagerHoracle, mockVRFRequester } = await loadFixture(fixture);
      await vrfManagerHoracle.changeMaxVRFPendingTime(mockVRFRequester.address, 1000);
    });
    it("success - set deadline to zero", async function () {
      const { vrfManagerHoracle, mockVRFRequester, alice, oracleVrfTest } = await loadFixture(fixture);
      await vrfManagerHoracle.changeMaxVRFPendingTime(mockVRFRequester.address, 0);

      const drawReceipt = await w(mockVRFRequester.connect(alice).request());
      await oracleVrfTest.eventsEmitted(drawReceipt);
    });
    it("setter(changeMaxVRFPendingTime) - should be reverted when not called by the owner", async function () {
      const { vrfManagerHoracle, mockVRFRequester, alice } = await loadFixture(fixture);
      await expect(
        vrfManagerHoracle.connect(alice).changeMaxVRFPendingTime(mockVRFRequester.address, 100)
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
  describe("addVRFREquester", function () {
    it("sucess", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await vrfManagerHoracle.addVRFRequester(alice.address, 1000);
    });
    it("should be reverted when VRF Requester is already added", async function () {
      const { vrfManagerHoracle, mockVRFRequester } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.addVRFRequester(mockVRFRequester.address, 1000)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequesterAddress
      );
    });
  });
  describe("removeVRFRequester", function () {
    it("sucess", async function () {
      const { vrfManagerHoracle, mockVRFRequester } = await loadFixture(fixture);
      await vrfManagerHoracle.removeVRFRequester(mockVRFRequester.address);
    });
    it("should be reverted when VRF Requester is not exist", async function () {
      const { vrfManagerHoracle, alice } = await loadFixture(fixture);
      await expect(vrfManagerHoracle.removeVRFRequester(alice.address)).to.be.revertedWith(
        nxErrors.VRFManager.invalidRequesterAddress
      );
    });
  });
  describe("view function", function () {
    it("vrfRequester", async function () {
      const { vrfManagerHoracle, mockVRFRequester, maxVRFPendingTime } = await loadFixture(fixture);
      const result = await vrfManagerHoracle.vrfRequester(mockVRFRequester.address);
      expect(result.isVRFRequester).to.equal(true);
      expect(result.maxVRFPendingTime).to.equal(maxVRFPendingTime);
    });
    it("vrfRequest", async function () {
      const { vrfManagerHoracle, alice, mockVRFRequester, maxVRFPendingTime } = await loadFixture(fixture);
      await mockVRFRequester.connect(alice).request();
      const requestId = await mockVRFRequester.requestId();
      const result = await vrfManagerHoracle.vrfRequest(requestId);
      const timestamp = await time.latest();
      expect(result.deadline).to.equal(maxVRFPendingTime.add(BigNumber.from(timestamp)));
      expect(result.numWords).to.equal(1);
      expect(result.requester).to.equal(mockVRFRequester.address);
      expect(result.id).to.equal(requestId);
    });
  });
});
