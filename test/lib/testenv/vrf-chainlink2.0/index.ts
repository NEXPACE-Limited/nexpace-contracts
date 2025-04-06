import BN from "bn.js";
import { ethers } from "hardhat";
import { ContractReceipt, ContractTransaction, Signer, utils } from "ethers";
import { chainlink, ec, ecvrf } from "../../../../common_modules/chainlink-vrf";
import type {
  MockBlockhashStore,
  MockAggregatorV3,
  MockLinkToken,
  MockLinkToken__factory,
  VRFCoordinatorV2,
  VRFCoordinatorV2__factory,
} from "../../../../typechain-types";
import type {
  RandomWordsFulfilledEvent,
  RandomWordsRequestedEvent,
} from "../../../../typechain-types/@chainlink/contracts/src/v0.8/vrf/VRFCoordinatorV2";
import EventHelper, { checkEventMap, genEventMap } from "../../contracthelper/util/event-helper";

/**
 * @name CoordinatorConfig
 * @description value for coordinator.setConfig
 */
export interface CoordinatorConfig {
  minimumRequestConfirmations: number;
  maxGasLimit: number;
  stalenessSeconds: number;
  gasAfterPaymentCalculation: number;
  fallbackWeiPerUnitLink: bigint;
  feeConfig: {
    fulfillmentFlatFeeLinkPPMTier1: number;
    fulfillmentFlatFeeLinkPPMTier2: number;
    fulfillmentFlatFeeLinkPPMTier3: number;
    fulfillmentFlatFeeLinkPPMTier4: number;
    fulfillmentFlatFeeLinkPPMTier5: number;
    reqsForTier2: number;
    reqsForTier3: number;
    reqsForTier4: number;
    reqsForTier5: number;
  };
}

const defaultConfig: CoordinatorConfig = {
  minimumRequestConfirmations: 1,
  maxGasLimit: 50_000_000,
  stalenessSeconds: 600,
  gasAfterPaymentCalculation: 10_000,
  fallbackWeiPerUnitLink: 5_486_000_000_000_000n,
  feeConfig: {
    fulfillmentFlatFeeLinkPPMTier1: 250000,
    fulfillmentFlatFeeLinkPPMTier2: 250000,
    fulfillmentFlatFeeLinkPPMTier3: 250000,
    fulfillmentFlatFeeLinkPPMTier4: 250000,
    fulfillmentFlatFeeLinkPPMTier5: 250000,
    reqsForTier2: 0,
    reqsForTier3: 0,
    reqsForTier4: 0,
    reqsForTier5: 0,
  },
};

const eventMap = {
  VRFCoordinatorV2: ["RandomWordsFulfilled", "RandomWordsRequested"],
} as const;

interface EventMap {
  RandomWordsFulfilled: RandomWordsFulfilledEvent;
  RandomWordsRequested: RandomWordsRequestedEvent;
}

checkEventMap<EventMap, typeof eventMap>();

const w = (x: Promise<ContractTransaction>) => x.then((y) => y.wait());

/**
 * @name VRFTest
 * @description Deployment of the coordinator for unit testing of the contract using VRF.
 * @description Parsing RandomWordsRequested events and sending fulfill transactions
 */
export default class VRFTest {
  constructor(coordinatorConfig?: Partial<CoordinatorConfig>) {
    this.coordinatorConfig = {
      ...defaultConfig,
      ...coordinatorConfig,
      feeConfig: {
        ...defaultConfig.feeConfig,
        ...coordinatorConfig?.feeConfig,
      },
    };
  }

  signer!: Signer;
  coordinatorConfig: CoordinatorConfig;

  factories!: {
    VRFCoordinatorV2: VRFCoordinatorV2__factory;
    MockLinkToken: MockLinkToken__factory;
  };

  staticContracts!: {
    blockhashStore: MockBlockhashStore;
    linkEthFeed: MockAggregatorV3;
  };

  contracts!: {
    coordinator: VRFCoordinatorV2;
    link: MockLinkToken;
  };

  eventHelper!: EventHelper<EventMap>;

  sk!: BN;
  pk!: chainlink.Point;
  keyHash!: string;

  // function to be called in the before hook
  async before(signer?: Signer) {
    signer = signer ?? (await ethers.getSigners())[0];
    this.signer = signer;
    const [VRFCoordinatorV2, MockLinkToken, blockhashStore, linkEthFeed] = await Promise.all([
      ethers.getContractFactory("VRFCoordinatorV2", signer),
      ethers.getContractFactory("MockLinkToken", signer),
      ethers.getContractFactory("MockBlockhashStore", signer).then((f) => f.deploy()),
      ethers.getContractFactory("MockAggregatorV3", signer).then((f) => f.deploy(18, "LINK / ETH", 0n)),
    ]);
    this.factories = { VRFCoordinatorV2, MockLinkToken };
    this.staticContracts = { blockhashStore, linkEthFeed };
    this.eventHelper = new EventHelper(genEventMap(this.factories, eventMap));
    const kp = ec.genKeyPair();
    const rawPk = kp.getPublic();
    const keyHash = chainlink.hashOfKey(rawPk);
    this.sk = kp.getPrivate();
    this.pk = [rawPk.getX().toArray("be", 32), rawPk.getY().toArray("be", 32)];
    this.keyHash = keyHash;
    await Promise.all([blockhashStore, linkEthFeed].map((c) => c.deployed()));
  }

  // function to be called in the beforeEach hook
  async beforeEach() {
    const {
      signer,
      coordinatorConfig,
      factories: { MockLinkToken, VRFCoordinatorV2 },
      staticContracts: { blockhashStore, linkEthFeed },
      pk,
    } = this;
    const link = await MockLinkToken.deploy();
    const coordinator = await VRFCoordinatorV2.deploy(link.address, blockhashStore.address, linkEthFeed.address);
    this.contracts = { coordinator, link };
    await Promise.all([link, coordinator].map((c) => c.deployed()));
    await Promise.all([
      w(link.grantMintRole(await signer.getAddress())),
      w(
        coordinator.setConfig(
          coordinatorConfig.minimumRequestConfirmations,
          coordinatorConfig.maxGasLimit,
          coordinatorConfig.stalenessSeconds,
          coordinatorConfig.gasAfterPaymentCalculation,
          coordinatorConfig.fallbackWeiPerUnitLink,
          coordinatorConfig.feeConfig
        )
      ),
      w(coordinator.registerProvingKey(await signer.getAddress(), pk)),
    ]);
  }

  // function to be called when RandomWordsRequested event is emitted
  // send fulfill transaction after handling event
  // check validation of RandomWordsRequested, RandomWordsFulfilled events optionally
  async randomWordsRequested(event: RandomWordsRequestedEvent, validate = false) {
    const {
      sk,
      contracts: { coordinator },
    } = this;
    const {
      blockHash,
      args: { keyHash },
    } = event;
    const preSeed = event.args.preSeed.toBigInt();
    const requestId = event.args.requestId.toBigInt();
    if (validate) {
      const calculated = BigInt(utils.solidityKeccak256(["bytes32", "uint256"], [keyHash, preSeed]));
      if (requestId !== calculated) throw new Error(`invalid requestId: should be ${calculated} but ${requestId}`);
    }
    const rc = {
      blockNum: event.blockNumber,
      subId: event.args.subId.toBigInt(),
      callbackGasLimit: BigInt(event.args.callbackGasLimit),
      numWords: BigInt(event.args.numWords),
      sender: event.args.sender,
    };
    const proof = await chainlink.prove(sk, preSeed, blockHash);
    const ret = coordinator.fulfillRandomWords(proof, rc);
    if (validate) {
      const r = await (await ret).wait();
      const event = this.findFulfillEvent(r);
      if (!event) throw new Error("RandomWordsFulfilled not emitted");
      {
        const retrieved = event.args.requestId.toBigInt();
        if (retrieved !== requestId)
          throw new Error(`invalid requestId: requested ${requestId} but ${retrieved} fulfilled`);
      }
      {
        const retrieved = event.args.outputSeed.toBigInt();
        const calculated = BigInt(
          await ecvrf.compute({
            gamma: ec.curve.point(proof.gamma[0], proof.gamma[1]),
          })
        );
        if (retrieved !== calculated) throw new Error(`invalid outputSeed: should be ${calculated} but ${retrieved}`);
      }
    }
    return ret;
  }

  // handling RandomWordsRequested events
  async eventsEmitted(receipt: ContractReceipt, validate = false) {
    return Promise.all(this.filterRequestEvent(receipt).map((event) => this.randomWordsRequested(event, validate)));
  }

  filterRequestEvent(receipt: ContractReceipt) {
    return this.eventHelper.filterAndParse(
      "RandomWordsRequested",
      (receipt.events ?? []).filter((x) => x.address === this.contracts.coordinator.address)
    );
  }

  findFulfillEvent(receipt: ContractReceipt) {
    const events = receipt.events;
    if (!events || events.length === 0) return null;
    const event = events[events.length - 1];
    if (event.address !== this.contracts.coordinator.address) return null;
    return this.eventHelper.maybeParse("RandomWordsFulfilled", event);
  }

  async doSingleFulfill(requestReceipt: ContractReceipt, validate = false) {
    const fulfills = await this.eventsEmitted(requestReceipt, validate);
    if (fulfills.length !== 1) throw new Error(`number of fulfillment (${fulfills.length}) is not 1`);
    return fulfills[0];
  }

  async singleFulfill(requestReceipt: ContractReceipt, validate = false) {
    const fulfillReceipt = await w(this.doSingleFulfill(requestReceipt, validate));
    const fulfillEvent = this.findFulfillEvent(fulfillReceipt);
    if (!fulfillEvent) throw new Error("fulfill event is null");
    return fulfillEvent;
  }
}
