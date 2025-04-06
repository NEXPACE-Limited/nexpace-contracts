import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, ContractTransaction } from "ethers";
import EventHelper, { checkEventMap, genEventMap } from "../lib/contracthelper/util/event-helper";
import { VRFManagerChangedEvent } from "../../typechain-types/contracts/VRF/VRFRequester";
import VRFTest from "../lib/testenv/vrf";
import nxErrors from "../lib/nx-errors";

const w = (x: Promise<ContractTransaction>) => x.then((y) => y.wait());

const eventMap = {
  MockVRFRequester: ["VRFManagerChanged"],
} as const;

interface EventMap {
  VRFManagerChanged: VRFManagerChangedEvent;
}

checkEventMap<EventMap, typeof eventMap>();

describe("VRFRequester", function () {
  async function fixture() {
    const [vrfManagerChainlinkOwner, oracle, alice] = await ethers.getSigners();

    const dummyAddress = "0x0200000000000000000000000000000000000000";

    // Set Oracle
    const oracleVrfTest = new VRFTest();
    await oracleVrfTest.before(oracle);
    await oracleVrfTest.beforeEach();

    // Deploy
    const VRFManagerChainlink = await ethers.getContractFactory("VRFManagerChainlink", vrfManagerChainlinkOwner);
    const vrfManagerChainlink = await VRFManagerChainlink.deploy(oracleVrfTest.contracts.coordinator.address);

    const MockVRFRequester = await ethers.getContractFactory("MockVRFRequester");
    const mockVRFRequester = await MockVRFRequester.deploy(vrfManagerChainlink.address);

    const eventHelper = new EventHelper<EventMap>(genEventMap({ MockVRFRequester }, eventMap));
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

    return {
      dummyAddress,
      alice,
      vrfManagerChainlink,
      mockVRFRequester,
      eventHelper,
    };
  }

  before(async function () {
    this.timeout(10000);
    await loadFixture(fixture);
  });

  describe("changeVRFManager", function () {
    it("success", async function () {
      const { mockVRFRequester, alice, dummyAddress, eventHelper, vrfManagerChainlink } = await loadFixture(fixture);

      const receipt = await w(mockVRFRequester.connect(alice).changeVRFManager(dummyAddress));
      const retriedEvent = eventHelper.findAndParse("VRFManagerChanged", receipt.events ?? []);
      const previousManagerAddress = retriedEvent!.args.previousManagerAddress;
      const newManagerAddress = retriedEvent!.args.newManagerAddress;

      expect(previousManagerAddress).to.equal(vrfManagerChainlink.address);
      expect(newManagerAddress).to.equal(dummyAddress);
    });
  });

  describe("fulfillVRF", function () {
    it("should be reverted when not called by the VRFManager", async function () {
      const { mockVRFRequester, alice } = await loadFixture(fixture);

      await expect(mockVRFRequester.connect(alice).fulfillVRF(1, [1])).to.be.revertedWith(
        nxErrors.VRFRequester.managerForbidden
      );
    });
  });
});
