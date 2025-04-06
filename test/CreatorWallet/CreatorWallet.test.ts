import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import VRFTest from "../lib/testenv/vrf";
import { CreatorWallet, DAppRewardAllocationWallet } from "../../typechain-types";
import { CreatorAddedEvent, DAppAddedEvent } from "../../typechain-types/contracts/Creator/CreatorFactory";
import EventHelper, { checkEventMap, genEventMap } from "../lib/contracthelper/util/event-helper";
import { GenerateTransactionEvent } from "../../typechain-types/contracts/Creator/CreatorWallet/CreatorWallet";
import { ApprovalEvent } from "../../typechain-types/@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply";
import { BigNumber } from "ethers";
import nxErrors from "../lib/nx-errors";
import { sendMetaTransaction } from "../lib/metatx";
import { expectAmount } from "../lib/contracthelper/util/fission";

const eventMap = {
  NESO: ["Approval"],
  CreatorFactory: ["CreatorAdded", "DAppAdded"],
  CreatorWallet: ["ContributionRewardVaultDeployed", "GenerateTransaction"],
} as const;

interface EventMap {
  Approval: ApprovalEvent;
  CreatorAdded: CreatorAddedEvent;
  DAppAdded: DAppAddedEvent;
  GenerateTransaction: GenerateTransactionEvent;
}

checkEventMap<EventMap, typeof eventMap>();

interface CreatorWalletInfo {
  name: string;
  owners: SignerWithAddress[];
  executor: SignerWithAddress;
  threshold: number;
  account?: CreatorWallet;
  nesoAmount: number;
  nxpcAmount: BigNumber;
}

interface DAppInfo {
  name: string;
  creatorId: number;
  executor: SignerWithAddress;
  account?: DAppRewardAllocationWallet;
  nesoAmount: number;
}

function popSigner(signers: SignerWithAddress[], size: number = 1): SignerWithAddress[] {
  const result: SignerWithAddress[] = [];
  for (let i = 0; i < size; i++) {
    const signer = signers.pop();
    if (signer === undefined) {
      throw new Error("Array is empty");
    } else result.push(signer);
  }

  return result;
}

describe("Creator Contract", () => {
  // Fixtures
  async function fixture() {
    const [
      alice,
      bob,
      oracle,
      forwarder,
      itemIssuanceOwner,
      nesoOwner,
      dAppOwner,
      factoryOwner,
      factoryExecutor,
      richUser,
      ...signers
    ] = await ethers.getSigners();

    const creatorWalletInfo: CreatorWalletInfo[] = [];
    creatorWalletInfo.push({
      name: "Nexon",
      owners: popSigner(signers, 3),
      executor: popSigner(signers, 1)[0],
      threshold: 2,
      nesoAmount: 30000,
      nxpcAmount: ethers.utils.parseEther("1000000"),
    });
    creatorWalletInfo.push({
      name: "Hello",
      owners: popSigner(signers, 5),
      executor: popSigner(signers, 1)[0],
      threshold: 3,
      nesoAmount: 50000,
      nxpcAmount: ethers.utils.parseEther("2000000"),
    });
    creatorWalletInfo.push({
      name: "Hong",
      owners: popSigner(signers, 2),
      executor: popSigner(signers, 1)[0],
      threshold: 1,
      nesoAmount: 60000,
      nxpcAmount: ethers.utils.parseEther("3000000"),
    });

    const dAppInfo: DAppInfo[] = [];
    dAppInfo.push({
      name: "MSN",
      executor: popSigner(signers)[0],
      creatorId: 2,
      nesoAmount: 1000,
    });
    dAppInfo.push({
      name: "World",
      executor: popSigner(signers)[0],
      creatorId: 3,
      nesoAmount: 2000,
    });
    dAppInfo.push({
      name: "Hi",
      executor: popSigner(signers)[0],
      creatorId: 3,
      nesoAmount: 3000,
    });

    // Set Oracle
    const oracleVrfTest = new VRFTest();
    await oracleVrfTest.before(oracle);
    await oracleVrfTest.beforeEach();

    // Deploy Default
    const ApproveController = await ethers.getContractFactory("ApproveController");
    const approveController = await ApproveController.deploy(forwarder.address);

    const NESO = await ethers.getContractFactory("MockNextMeso", nesoOwner);
    const neso = await NESO.deploy(forwarder.address, approveController.address, 100000);
    const neso2 = await NESO.deploy(forwarder.address, approveController.address, 1);

    const blackhole = "0x0100000000000000000000000000000000000000";

    const NXPCAmountManager = await ethers.getContractFactory("NXPCAmountManager");
    const nxpcAmountManager = await NXPCAmountManager.deploy(forwarder.address);
    const ItemIssuance = await ethers.getContractFactory("ItemIssuance", itemIssuanceOwner);
    const itemIssuance = await ItemIssuance.deploy(forwarder.address, blackhole, nxpcAmountManager.address);

    const Token721 = await ethers.getContractFactory("MockERC721");
    const token721 = await Token721.deploy();

    const Token1155 = await ethers.getContractFactory("MockERC1155");
    const token1155 = await Token1155.deploy();

    const CreatorImpl1 = await ethers.getContractFactory("CreatorWallet");

    const Beacon = await ethers.getContractFactory("UpgradeableBeacon");

    const CreatorFactory = await ethers.getContractFactory("CreatorFactory", factoryOwner);
    const CreatorWallet = await ethers.getContractFactory("CreatorWallet");
    const DAppRewardAllocationWallet = await ethers.getContractFactory("DAppRewardAllocationWallet");

    // Deploy
    const beacon = await Beacon.deploy(neso.address); // temporal address
    const creatorFactory = await CreatorFactory.deploy(
      alice.address,
      dAppOwner.getAddress(),
      beacon.address,
      itemIssuance.address
    );

    await nxpcAmountManager.setBurnAllowlist(itemIssuance.address, true);
    await richUser.sendTransaction({
      to: creatorFactory.address,
      value: ethers.utils.parseEther("10000000"),
    });

    const creatorImpl1 = await CreatorImpl1.deploy(await forwarder.getAddress(), neso.address, creatorFactory.address);
    beacon.upgradeTo(creatorImpl1.address);

    // event
    const eventHelper = new EventHelper<EventMap>(
      genEventMap(
        {
          NESO,
          CreatorFactory,
          CreatorWallet,
        },
        eventMap
      )
    );

    const poolAmount = 1_000_000_000n;

    // Setting - itemIssuance
    await itemIssuance.createUniverse("MapleStory Universe");
    await itemIssuance.addItem(1, poolAmount);
    await token721.setLimitSupply(1, 1_000_000_000_000n);

    // Setting - Approve Controller
    await approveController.setAllowlist(itemIssuance.address, true);

    // Setting
    await creatorFactory.connect(factoryOwner).grantExecutor(await factoryExecutor.getAddress());
    await neso.connect(alice).deposit({ value: 100_000_000 });
    await neso.connect(alice).transfer(creatorFactory.address, 10_000_000_000_000);
    // await neso.connect(nesoOwner).mint(creatorFactory.address, ethers.utils.parseEther("10000000000000"));
    // neso mock deposit으로 바꾸기

    for (let i = 0; i < creatorWalletInfo.length; i++) {
      const { name, owners, threshold, nesoAmount, executor, nxpcAmount } = creatorWalletInfo[i];
      const txn = await creatorFactory.connect(factoryExecutor).addCreator(
        name,
        owners.map((v) => v.getAddress()),
        threshold
      );
      const receipt = await txn.wait();
      const ev = eventHelper.findAndParse("CreatorAdded", receipt.events ?? []);
      creatorWalletInfo[i].account = CreatorWallet.attach(ev!.args.account!);

      await expect(
        creatorFactory.allocateReward(creatorWalletInfo[i].account!.address, nxpcAmount, [neso.address], [nesoAmount])
      ).to.changeTokenBalance(neso, creatorWalletInfo[i].account, nesoAmount);

      const txnData = CreatorFactory.interface.encodeFunctionData("grantExecutor", [await executor.getAddress()]);
      await creatorWalletCall(eventHelper, creatorWalletInfo[i], txnData, creatorWalletInfo[i].owners[0]);
      expect(await creatorWalletInfo[i].account!.isExecutor(executor.getAddress())).to.be.equal(true);
    }

    for (let i = 0; i < dAppInfo.length; i++) {
      const { name, executor, creatorId, nesoAmount } = dAppInfo[i];
      const txn = await creatorFactory.connect(factoryExecutor).addDApp(creatorId, name, executor.getAddress());
      const receipt = await txn.wait();
      const ev = eventHelper.findAndParse("DAppAdded", receipt.events ?? []);
      dAppInfo[i].account = DAppRewardAllocationWallet.attach(ev?.args.account!).connect(dAppInfo[i].executor);
      creatorWalletInfo[creatorId - 1].nesoAmount -= nesoAmount;
      const txnData = creatorWalletInfo[0].account!.interface.encodeFunctionData(
        "allocateERC20(address,uint32,uint256)",
        [neso.address, i + 1, nesoAmount]
      );
      await creatorWalletCall(
        eventHelper,
        creatorWalletInfo[creatorId - 1],
        txnData,
        creatorWalletInfo[creatorId - 1].owners[0]
      );
    }

    return {
      alice,
      bob,
      eventHelper,
      beacon,
      forwarder,
      neso,
      token721,
      token1155,
      creatorFactory,
      itemIssuance,
      creatorWalletInfo,
      dAppInfo,
      factoryExecutor,
      CreatorWallet,
      dAppOwner,
      neso2,
      poolAmount,
    };
  }

  async function creatorWalletCall(
    eventHelper: EventHelper<EventMap>,
    creatorWalletInfo: CreatorWalletInfo,
    txnData: string,
    executor: SignerWithAddress | undefined = undefined,
    signCount: number | undefined = undefined
  ) {
    if (signCount === undefined) signCount = creatorWalletInfo.threshold;
    if (executor === undefined) executor = creatorWalletInfo.executor;
    const { account, owners } = creatorWalletInfo;
    const sequence = eventHelper.findAndParse(
      "GenerateTransaction",
      (await (await account!.connect(executor).generateTransaction(account!.address, 0, 500000, txnData)).wait())
        .events ?? []
    )?.args.sequence!;
    for (let i = 0; i < signCount; i++) await account!.connect(owners[i]).signTransaction(sequence);
    return account!.connect(executor).executeTransaction(sequence);
  }

  async function creatorWalletCallWithForwarder(
    creatorWalletInfo: CreatorWalletInfo,
    txnData: string,
    forwarder: SignerWithAddress,
    executor: SignerWithAddress | undefined = undefined,
    signCount: number | undefined = undefined
  ) {
    if (signCount === undefined) signCount = creatorWalletInfo.threshold;
    if (executor === undefined) executor = creatorWalletInfo.executor;
    const { account, owners } = creatorWalletInfo;
    const generateReceipt = await (
      await sendMetaTransaction(
        forwarder,
        await executor.getAddress(),
        await account!.populateTransaction.generateTransaction(account!.address, 0, 500000, txnData)
      )
    ).wait();
    let sequence = ethers.BigNumber.from(0);
    for (const log of generateReceipt.logs) {
      if (account!.interface.parseLog(log).name === "GenerateTransaction") {
        sequence = account!.interface.parseLog(log).args.sequence;
      }
    }
    for (let i = 0; i < signCount; i++)
      await sendMetaTransaction(
        forwarder,
        await owners[i].getAddress(),
        await account!.populateTransaction.signTransaction(sequence)
      );
    return sendMetaTransaction(
      forwarder,
      await executor.getAddress(),
      await account!.populateTransaction.executeTransaction(sequence)
    );
  }

  before(async function () {
    this.timeout(10000);
    await loadFixture(fixture);
  });

  describe("constructor", function () {
    it("should be reverted when deploy with zero address", async function () {
      const CreatorWallet = await ethers.getContractFactory("CreatorWallet");
      await expect(
        CreatorWallet.deploy(ethers.constants.AddressZero, ethers.constants.AddressZero, ethers.constants.AddressZero)
      ).to.be.revertedWith(nxErrors.CreatorWalletLogicUpgradeable.validAddress);
    });

    it("should be reverted when deploy with zero address", async function () {
      const CreatorFactory = await ethers.getContractFactory("CreatorFactory");
      await expect(
        CreatorFactory.deploy(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith(nxErrors.CreatorFactory.validAddress);
    });
  });

  describe("Transfer ERC20/721/1155", () => {
    it("HappyPath", async () => {
      const { alice, eventHelper, creatorWalletInfo, dAppInfo, neso, token721, token1155 } = await loadFixture(fixture);
      const creatorWallet = creatorWalletInfo[1].account!;
      const dApp = dAppInfo[0].account!;

      await neso.connect(alice).deposit({ value: "1" });
      await neso.connect(alice).transfer(creatorWallet.address, 100);
      await token721.safeMint(creatorWallet.address, 100);
      await token721.safeMint(creatorWallet.address, 101);
      await token1155.mintBatch(creatorWallet.address, [1, 2, 3], [10, 20, 30], "0x");

      await creatorWalletCall(
        eventHelper,
        creatorWalletInfo[1],
        creatorWallet.interface.encodeFunctionData("allocateERC20(address,uint32,uint256)", [neso.address, 1, 10])
      );
      await creatorWalletCall(
        eventHelper,
        creatorWalletInfo[1],
        creatorWallet.interface.encodeFunctionData("transferERC721", [token721.address, dApp.address, 100])
      );
      await creatorWalletCall(
        eventHelper,
        creatorWalletInfo[1],
        creatorWallet.interface.encodeFunctionData("transferERC721", [token721.address, dApp.address, 101])
      );
      await creatorWalletCall(
        eventHelper,
        creatorWalletInfo[1],
        creatorWallet.interface.encodeFunctionData("transferERC1155", [token1155.address, dApp.address, 1, 5])
      );
      await creatorWalletCall(
        eventHelper,
        creatorWalletInfo[1],
        creatorWallet.interface.encodeFunctionData("transferERC1155", [token1155.address, dApp.address, 2, 10])
      );
    });
  });

  describe("CreatorFactory - Check variable", () => {
    it("creatorBecon", async () => {
      const { creatorFactory, beacon } = await loadFixture(fixture);
      expect(await creatorFactory.creatorBeacon()).to.equal(beacon.address);
    });
    it("itemIssuance", async () => {
      const { creatorFactory, itemIssuance } = await loadFixture(fixture);
      expect(await creatorFactory.itemIssuance()).to.equal(itemIssuance.address);
    });
    it("creatorAddress / creatorId / creatorName", async () => {
      const { creatorFactory, creatorWalletInfo, alice } = await loadFixture(fixture);
      for (let i = 0; i < creatorWalletInfo.length; i++) {
        const { name, account } = creatorWalletInfo[i];
        expect(await creatorFactory.creatorAddress(i + 1), "creatorAddress").to.equal(account!.address);
        expect(await creatorFactory.creatorId(account!.address), "creatorId").to.equal(i + 1);
        expect(await creatorFactory["creatorName(uint32)"](i + 1), "creatorName(uint32)").to.equal(name);
        expect(await creatorFactory["creatorName(address)"](account!.address), "creatorName(address)").to.equal(name);
      }
      await expect(creatorFactory["creatorName(uint32)"](0), "creatorName(uint32)").to.be.revertedWith(
        nxErrors.CreatorFactory.invalidCreatorId
      );
      await expect(
        creatorFactory["creatorName(address)"](alice.getAddress()),
        "creatorName(address)"
      ).to.be.revertedWith(nxErrors.CreatorFactory.invalidCreatorAddress);
      await expect(creatorFactory.creatorAddress(0)).to.be.revertedWith(nxErrors.CreatorFactory.invalidCreatorId);
    });
    it("dAppId / dAppAddress / creatorIdOfDApp / creatorAddressOfDApp / dAppName", async () => {
      const { creatorFactory, dAppInfo, creatorWalletInfo, alice } = await loadFixture(fixture);
      for (let i = 0; i < dAppInfo.length; i++) {
        const { creatorId, account, name } = dAppInfo[i];
        expect(await creatorFactory.dAppId(account!.address), "dAppId").to.equal(i + 1);
        expect(await creatorFactory.dAppAddress(i + 1), "dAppAddress").to.equal(account?.address);
        expect(await creatorFactory["creatorIdOfDApp(uint32)"](i + 1)).to.equal(creatorId);
        expect(await creatorFactory["creatorAddressOfDApp(address)"](account!.address), "creatorAddress").to.equal(
          creatorWalletInfo[creatorId - 1].account!.address
        );
        expect(await creatorFactory["creatorAddressOfDApp(uint32)"](i + 1), "creatorAddress").to.equal(
          creatorWalletInfo[creatorId - 1].account!.address
        );
        await expect(creatorFactory["creatorAddressOfDApp(uint32)"](0)).to.be.revertedWith(
          nxErrors.CreatorFactory.invalidDAppId
        );
        expect(await creatorFactory["dAppName(uint32)"](i + 1), "dAppName(uint32)").to.equal(name);
        expect(await creatorFactory["dAppName(address)"](account!.address), "dAppName(address)").to.equal(name);
      }
      await expect(creatorFactory["dAppName(uint32)"](0), "dAppName(uint32)").to.be.revertedWith(
        nxErrors.CreatorFactory.invalidDAppId
      );
      await expect(creatorFactory.dAppAddress(0), "dAppAddress").to.be.revertedWith(
        nxErrors.CreatorFactory.invalidDAppId
      );
      await expect(creatorFactory["creatorIdOfDApp(uint32)"](0)).to.be.revertedWith(
        nxErrors.CreatorFactory.invalidDAppId
      );
      await expect(creatorFactory.dAppId(alice.getAddress())).to.be.revertedWith(
        nxErrors.CreatorFactory.invalidDAppAddress
      );
      await creatorFactory.setDAppActivation(3, false);
      expect(await creatorFactory["dAppName(uint32)"](3)).to.equal(dAppInfo[2].name);
    });
  });

  describe("CreatorFactory - isConnected", () => {
    it("Success", async () => {
      const { creatorFactory, creatorWalletInfo, dAppInfo } = await loadFixture(fixture);
      for (let i = 0; i < creatorWalletInfo.length; i++) {
        for (let j = 0; j < dAppInfo.length; j++) {
          const res = i + 1 === dAppInfo[j].creatorId;
          const creatorAddress = creatorWalletInfo[i].account!.address;
          const dAppAddress = dAppInfo[j].account!.address;
          expect(await creatorFactory["isConnected(uint32,uint32)"](i + 1, j + 1)).to.equal(res);
          expect(await creatorFactory["isConnected(uint32,address)"](i + 1, dAppAddress)).to.equal(res);
          expect(await creatorFactory["isConnected(address,uint32)"](creatorAddress, j + 1)).to.equal(res);
          expect(await creatorFactory["isConnected(address,address)"](creatorAddress, dAppAddress)).to.equal(res);
        }
      }
    });
    it("Wrong", async () => {
      const { creatorFactory, creatorWalletInfo, dAppInfo, alice, bob } = await loadFixture(fixture);
      const creatorAddress = creatorWalletInfo[0].account!.address;
      const dAppAddress = dAppInfo[2].account!.address;
      expect(await creatorFactory["isConnected(uint32,uint32)"](0, 1)).to.false;
      expect(await creatorFactory["isConnected(uint32,uint32)"](1, 0)).to.false;
      expect(await creatorFactory["isConnected(uint32,uint32)"](5, 1)).to.false;
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 7)).to.false;
      expect(await creatorFactory["isConnected(uint32,uint32)"](9, 6)).to.false;
      expect(await creatorFactory["isConnected(uint32,uint32)"](0, 0)).to.false;

      expect(await creatorFactory["isConnected(uint32,address)"](0, dAppAddress)).to.false;
      expect(await creatorFactory["isConnected(uint32,address)"](1, alice.getAddress())).to.false;
      expect(await creatorFactory["isConnected(uint32,address)"](0, alice.getAddress())).to.false;

      expect(await creatorFactory["isConnected(address,uint32)"](alice.getAddress(), 2)).to.false;
      expect(await creatorFactory["isConnected(address,uint32)"](creatorAddress, 0)).to.false;
      expect(await creatorFactory["isConnected(address,uint32)"](alice.getAddress(), 0)).to.false;

      expect(await creatorFactory["isConnected(address,address)"](alice.getAddress(), dAppAddress)).to.false;
      expect(await creatorFactory["isConnected(address,address)"](creatorAddress, alice.getAddress())).to.false;
      expect(await creatorFactory["isConnected(address,address)"](alice.getAddress(), bob.getAddress())).to.false;

      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.true;
      await creatorFactory.setDAppActivation(3, false);
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.true;
    });
  });

  describe("CreatorFactory - Edit variable", () => {
    it("setCreatorName(Owner) - Success", async () => {
      const { creatorFactory } = await loadFixture(fixture);
      await creatorFactory.setCreatorName(1, "TV");
    });
    it("setCreatorName(Executor) - Success", async () => {
      const { creatorFactory, factoryExecutor } = await loadFixture(fixture);
      await creatorFactory.connect(factoryExecutor).setCreatorName(1, "TV");
    });
    it("setCreatorName - Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).setCreatorName(1, "TV")).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
    it("setCreatorName - Revert - when Paused", async () => {
      const { creatorFactory, factoryExecutor } = await loadFixture(fixture);
      await creatorFactory.pause();
      await expect(creatorFactory.connect(factoryExecutor).setCreatorName(1, "TV")).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
    it("setDAppName(Owner) - Success", async () => {
      const { creatorFactory } = await loadFixture(fixture);
      await creatorFactory.setDAppName(1, "TV_DApp");
      expect(await creatorFactory["dAppName(uint32)"](1)).to.equal("TV_DApp");
    });
    it("setDAppName(Executor) - Success", async () => {
      const { creatorFactory, factoryExecutor } = await loadFixture(fixture);
      await creatorFactory.connect(factoryExecutor).setDAppName(1, "TV_DApp");
      expect(await creatorFactory["dAppName(uint32)"](1)).to.equal("TV_DApp");
    });
    it("setDAppName - Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).setDAppName(1, "TV_DApp")).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
    it("setDAppOwner(Owner) - Success", async () => {
      const { creatorFactory, bob } = await loadFixture(fixture);
      await creatorFactory.setDAppOwner(bob.getAddress());
      expect(await creatorFactory.dAppOwner()).to.equal(await bob.getAddress());
    });
    it("setDAppOwner(Executor) - Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, factoryExecutor, bob } = await loadFixture(fixture);
      await expect(creatorFactory.connect(factoryExecutor).setDAppOwner(bob.getAddress())).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
    it("setDAppOwner - Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice, bob } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).setDAppOwner(bob.getAddress())).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
    it("setDAppActivation(Owner/Executor) - Success", async () => {
      const { creatorFactory, factoryExecutor } = await loadFixture(fixture);
      await creatorFactory.setDAppActivation(3, false);
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.true;
      await creatorFactory.connect(factoryExecutor).setDAppActivation(3, true);
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.true;
    });
    it("setDAppActivation - Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).setDAppActivation(3, false)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
    it("setDAppActivation - Revert - when invalid dAppId", async () => {
      const { creatorFactory } = await loadFixture(fixture);
      await expect(creatorFactory.setDAppActivation(0, false)).to.be.revertedWith(
        nxErrors.CreatorFactory.invalidDAppId
      );
      await expect(creatorFactory.setDAppActivation(10, false)).to.be.revertedWith(
        nxErrors.CreatorFactory.invalidDAppId
      );
    });
    it("setCreatorOfDApp(Owner/Executor) - Success", async () => {
      // 2-1, 3-2, 3-3
      const { creatorFactory, factoryExecutor } = await loadFixture(fixture);
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.true;
      expect(await creatorFactory["isConnected(uint32,uint32)"](1, 3)).to.false;
      await creatorFactory.setCreatorOfDApp(3, 1);
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.false;
      expect(await creatorFactory["isConnected(uint32,uint32)"](1, 3)).to.true;
      await creatorFactory.connect(factoryExecutor).setCreatorOfDApp(3, 3);
      expect(await creatorFactory["isConnected(uint32,uint32)"](3, 3)).to.true;
      expect(await creatorFactory["isConnected(uint32,uint32)"](1, 3)).to.false;
    });
    it("setCreatorOfDApp - Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).setCreatorOfDApp(3, 1)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
    it("setCreatorOfDApp - Revert - when invalid dAppId", async () => {
      const { creatorFactory } = await loadFixture(fixture);
      await expect(creatorFactory.setCreatorOfDApp(0, 1)).to.be.revertedWith(nxErrors.CreatorFactory.invalidDAppId);
      await expect(creatorFactory.setCreatorOfDApp(10, 1)).to.be.revertedWith(nxErrors.CreatorFactory.invalidDAppId);
    });
    it("setCreatorOfDApp - Revert - when invalid creatorId", async () => {
      const { creatorFactory } = await loadFixture(fixture);
      await expect(creatorFactory.setCreatorOfDApp(1, 0)).to.be.revertedWith(nxErrors.CreatorFactory.invalidCreatorId);
      await expect(creatorFactory.setCreatorOfDApp(1, 10)).to.be.revertedWith(nxErrors.CreatorFactory.invalidCreatorId);
    });
  });

  describe("CreatorFactory - AddCreator", () => {
    it("Success", async () => {
      const { creatorFactory, alice, eventHelper, creatorWalletInfo } = await loadFixture(fixture);
      const txn = await creatorFactory.addCreator("Mushroom", [alice.getAddress()], 1);
      const receipt = await txn.wait();
      const ev = eventHelper.findAndParse("CreatorAdded", receipt.events ?? []);
      expect(ev?.args.id).to.equal(creatorWalletInfo.length + 1);
      expect(ev?.args.name).to.equal("Mushroom");
    });
    it("Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).addCreator("Mushroom", [alice.getAddress()], 1)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
  });

  describe("CreatorFactory - AddDApp", () => {
    it("Success", async () => {
      const { creatorFactory, alice, eventHelper, dAppInfo } = await loadFixture(fixture);
      const txn = await creatorFactory.addDApp(1, "MSN", alice.getAddress());
      const receipt = await txn.wait();
      const ev = eventHelper.findAndParse("DAppAdded", receipt.events ?? []);
      expect(ev?.args.id).to.equal(dAppInfo.length + 1);
      expect(ev?.args.name).to.equal("MSN");
    });
    it("Revert - when not called by the owner or executor", async () => {
      const { creatorFactory, alice, bob } = await loadFixture(fixture);
      await expect(creatorFactory.connect(alice).addDApp(1, "MSN", bob.getAddress())).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
    it("Revert - when called by nonexist creator", async () => {
      const { creatorFactory, alice, creatorWalletInfo } = await loadFixture(fixture);
      await expect(creatorFactory.addDApp(creatorWalletInfo.length + 1, "MSN", alice.getAddress())).to.be.revertedWith(
        nxErrors.CreatorFactory.invalidCreatorId
      );
    });
  });

  describe("CreatorFactory - allocateReward", () => {
    it("happyPath", async () => {
      const { creatorFactory, creatorWalletInfo, neso } = await loadFixture(fixture);
      const creatorWallet = creatorWalletInfo[0].account!;
      await expect(creatorFactory.allocateReward(creatorWallet.address, 50, [neso.address], [100]))
        .to.changeTokenBalances(neso, [creatorFactory.address, creatorWallet.address], [-100, 100])
        .to.changeEtherBalances([creatorFactory.address, creatorWallet], [-50, 50]);

      await expect(creatorFactory.allocateReward(creatorWallet.address, 0, [neso.address], [100]))
        .to.changeTokenBalances(neso, [creatorFactory.address, creatorWallet.address], [-100, 100])
        .to.changeEtherBalances([creatorFactory.address, creatorWallet], [0, 0]);

      await expect(creatorFactory.allocateReward(creatorWallet.address, 0, [], []))
        .to.changeTokenBalances(neso, [creatorFactory.address, creatorWallet.address], [0, 0])
        .to.changeEtherBalances([creatorFactory.address, creatorWallet], [0, 0]);
    });
    // nxpc의 양이 부족한 경우
    it("Revert - when nxpcAmount is not enough", async () => {
      const { creatorFactory, creatorWalletInfo } = await loadFixture(fixture);
      const creatorWallet = creatorWalletInfo[0].account!;
      await expect(
        creatorFactory.allocateReward(creatorWallet.address, ethers.utils.parseEther("100000000"), [], [])
      ).to.be.revertedWith(nxErrors.CreatorFactory.invalidAmount);
    });
    it("Revert - when not called by the owner(general user)", async () => {
      const { creatorFactory, creatorWalletInfo, alice, neso } = await loadFixture(fixture);
      await expect(
        creatorFactory.connect(alice).allocateReward(creatorWalletInfo[0].account!.address, 0, [neso.address], [100])
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
    it("Revert - when not called by the owner(executor)", async () => {
      const { creatorFactory, creatorWalletInfo, factoryExecutor, neso } = await loadFixture(fixture);
      await expect(
        creatorFactory
          .connect(factoryExecutor)
          .allocateReward(creatorWalletInfo[0].account!.address, 0, [neso.address], [100])
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
    it("Revert - when called by nonexist creator", async () => {
      const { creatorFactory, alice, neso } = await loadFixture(fixture);
      await expect(creatorFactory.allocateReward(alice.getAddress(), 0, [neso.address], [100])).to.be.revertedWith(
        nxErrors.CreatorFactory.invalidCreatorAddress
      );
    });
    it("Revert - when called with different length between tokens and amounts", async () => {
      const { creatorFactory, creatorWalletInfo, neso } = await loadFixture(fixture);
      await expect(
        creatorFactory.allocateReward(creatorWalletInfo[0].account!.address, 0, [neso.address], [100, 200])
      ).to.be.revertedWith(nxErrors.CreatorFactory.invalidLength);
      await expect(
        creatorFactory.allocateReward(creatorWalletInfo[0].account!.address, 0, [neso.address, neso.address], [10])
      ).to.be.revertedWith(nxErrors.CreatorFactory.invalidLength);
    });
  });

  describe("CreatorFactory - allocateRewardBatch", () => {
    it("Success", async () => {
      const { creatorFactory, creatorWalletInfo, neso } = await loadFixture(fixture);
      await creatorFactory.allocateRewardBatch([
        {
          creatorAddress: creatorWalletInfo[0].account!.address,
          nxpcAmount: 5,
          tokens: [neso.address],
          amounts: [100],
        },
      ]);
    });
    it("Revert - when not called by the owner(general user)", async () => {
      const { creatorFactory, creatorWalletInfo, alice, neso } = await loadFixture(fixture);
      await expect(
        creatorFactory.connect(alice).allocateRewardBatch([
          {
            creatorAddress: creatorWalletInfo[0].account!.address,
            nxpcAmount: 5,
            tokens: [neso.address],
            amounts: [100],
          },
        ])
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
    it("Revert - when not called by the owner(executor)", async () => {
      const { creatorFactory, creatorWalletInfo, factoryExecutor, neso } = await loadFixture(fixture);
      await expect(
        creatorFactory.connect(factoryExecutor).allocateRewardBatch([
          {
            creatorAddress: creatorWalletInfo[0].account!.address,
            nxpcAmount: 5,
            tokens: [neso.address],
            amounts: [100],
          },
        ])
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
    it("Revert - when called by nonexist creator", async () => {
      const { creatorFactory, alice, neso } = await loadFixture(fixture);
      await expect(
        creatorFactory.allocateRewardBatch([
          {
            creatorAddress: await alice.getAddress(),
            nxpcAmount: 5,
            tokens: [neso.address],
            amounts: [100],
          },
        ])
      ).to.be.revertedWith(nxErrors.CreatorFactory.invalidCreatorAddress);
    });
  });

  describe("CreatorWallet - initialize", () => {
    it("Revert - when called as a duplicate", async () => {
      const { creatorWalletInfo, alice } = await loadFixture(fixture);
      const creatorWallet = creatorWalletInfo[0].account!;
      await expect(creatorWallet.initialize([alice.getAddress()], 3)).to.be.revertedWith(
        nxErrors.Initializable.alreadyInitialized
      );
    });
  });

  describe("CreatorWallet - onlyInitializing", () => {
    it("Revert - when not called initializing", async () => {
      const { creatorFactory, neso2 } = await loadFixture(fixture);
      const MockCreatorWalletLogic = await ethers.getContractFactory("MockCreatorWalletLogic");
      const mockCreatorWalletLogic = await MockCreatorWalletLogic.deploy(neso2.address, creatorFactory.address);
      await mockCreatorWalletLogic.initialize();
      await expect(mockCreatorWalletLogic.f()).to.be.revertedWith(nxErrors.Initializable.notInitializing);
      await expect(mockCreatorWalletLogic.g()).to.be.revertedWith(nxErrors.Initializable.notInitializing);
    });
  });

  describe("CreatorWallet - allocateERC20(address,uint32,uint256)", () => {
    it("Success(NESO)", async () => {
      const { neso, eventHelper, creatorWalletInfo, dAppInfo } = await loadFixture(fixture);
      const creatorInfo = creatorWalletInfo[1];
      const creatorAccount = creatorWalletInfo[1].account!;
      const txnData = creatorAccount.interface.encodeFunctionData("allocateERC20(address,uint32,uint256)", [
        neso.address,
        1,
        300,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorInfo, txnData)).to.changeTokenBalances(
        neso,
        [creatorAccount.address, dAppInfo[0].account!.address],
        [-300, 300]
      );
    });
    it("Success(NESO) - all token", async () => {
      const { neso, eventHelper, creatorWalletInfo, dAppInfo } = await loadFixture(fixture);
      const creatorInfo = creatorWalletInfo[1];
      const creatorAccount = creatorWalletInfo[1].account!;
      const txnData = creatorAccount.interface.encodeFunctionData("allocateERC20(address,uint32,uint256)", [
        neso.address,
        1,
        creatorInfo.nesoAmount,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorInfo, txnData)).to.changeTokenBalances(
        neso,
        [creatorAccount.address, dAppInfo[0].account!.address],
        [-creatorInfo.nesoAmount, creatorInfo.nesoAmount]
      );
    });
    it("Revert - when called Set 'to' to non-self", async () => {
      const { creatorWalletInfo, neso } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[0].account!.interface.encodeFunctionData(
        "allocateERC20(address,uint32,uint256)",
        [neso.address, 2, 300]
      );
      await expect(
        creatorWalletInfo[0]
          .account!.connect(creatorWalletInfo[0].executor)
          .generateTransaction(neso.address, 0, 100000, txnData)
      ).to.be.revertedWith(nxErrors.CreatorWallet.invalidTo);
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, neso } = await loadFixture(fixture);
      await expect(
        creatorWalletInfo[0].account!["allocateERC20(address,uint32,uint256)"](neso.address, 1, 300)
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
    it("Revert - when called invalid dAppId", async () => {
      const { eventHelper, creatorWalletInfo, neso } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[1].account!.interface.encodeFunctionData(
        "allocateERC20(address,uint32,uint256)",
        [neso.address, 2, 300]
      );
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.forbidden
      );
    });
    it("Revert - when called inactive dAppId", async () => {
      const { neso, eventHelper, creatorFactory, creatorWalletInfo } = await loadFixture(fixture);
      const creatorInfo = creatorWalletInfo[1];
      const creatorAccount = creatorWalletInfo[1].account!;
      await creatorFactory.setDAppActivation(1, false);
      const txnData = creatorAccount.interface.encodeFunctionData("allocateERC20(address,uint32,uint256)", [
        neso.address,
        1,
        300,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorInfo, txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.inactiveDApp
      );
    });
  });

  describe("CreatorWallet - allocateERC20(address,address,uint256)", () => {
    it("Success(NESO)", async () => {
      const { neso, eventHelper, creatorWalletInfo, dAppInfo } = await loadFixture(fixture);
      const creatorInfo = creatorWalletInfo[1];
      const creatorAccount = creatorWalletInfo[1].account!;
      const txnData = creatorAccount.interface.encodeFunctionData("allocateERC20(address,address,uint256)", [
        neso.address,
        dAppInfo[0].account!.address,
        300,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorInfo, txnData)).to.changeTokenBalances(
        neso,
        [creatorAccount.address, dAppInfo[0].account!.address],
        [-300, 300]
      );
    });
    it("Success(NESO) - all token", async () => {
      const { neso, eventHelper, creatorWalletInfo, dAppInfo } = await loadFixture(fixture);
      const creatorInfo = creatorWalletInfo[1];
      const creatorAccount = creatorWalletInfo[1].account!;
      const txnData = creatorAccount.interface.encodeFunctionData("allocateERC20(address,address,uint256)", [
        neso.address,
        dAppInfo[0].account!.address,
        creatorInfo.nesoAmount,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorInfo, txnData)).to.changeTokenBalances(
        neso,
        [creatorAccount.address, dAppInfo[0].account!.address],
        [-creatorInfo.nesoAmount, creatorInfo.nesoAmount]
      );
    });
    it("Revert - when called Set 'to' to non-self", async () => {
      const { creatorWalletInfo, neso, dAppInfo } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[0].account!.interface.encodeFunctionData(
        "allocateERC20(address,address,uint256)",
        [neso.address, dAppInfo[1].account!.address, 300]
      );
      await expect(
        creatorWalletInfo[0]
          .account!.connect(creatorWalletInfo[0].executor)
          .generateTransaction(neso.address, 0, 100000, txnData)
      ).to.be.revertedWith(nxErrors.CreatorWallet.invalidTo);
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, neso, dAppInfo } = await loadFixture(fixture);
      await expect(
        creatorWalletInfo[1].account!["allocateERC20(address,address,uint256)"](
          neso.address,
          dAppInfo[0].account!.address,
          300
        )
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
    it("Revert - when called invalid dAppId", async () => {
      const { eventHelper, creatorWalletInfo, neso, dAppInfo } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[1].account!.interface.encodeFunctionData(
        "allocateERC20(address,address,uint256)",
        [neso.address, dAppInfo[1].account!.address, 300]
      );
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.forbidden
      );
    });
  });

  describe("CreatorWallet - allocateItems", () => {
    it("Success", async () => {
      const { eventHelper, CreatorWallet, creatorWalletInfo } = await loadFixture(fixture);
      const txnData = CreatorWallet.interface.encodeFunctionData("allocateItems", [1, "0x0123456789abcdef"]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData))
        .to.be.emit(creatorWalletInfo[1].account!, "ItemsAllocated")
        .withArgs(1, "0x0123456789abcdef");
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo } = await loadFixture(fixture);
      await expect(creatorWalletInfo[0].account!.allocateItems(1, "0x0123456789abcdef")).to.be.revertedWith(
        nxErrors.SelfCallUpgradeable.forbidden
      );
    });
    it("Revert - when called invalid dAppId", async () => {
      const { eventHelper, CreatorWallet, creatorWalletInfo } = await loadFixture(fixture);
      const txnData = CreatorWallet.interface.encodeFunctionData("allocateItems", [2, "0x0123456789abcdef"]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.forbidden
      );
    });
  });

  describe("CreatorWallet - withdraw NXPC", () => {
    it("Success", async () => {
      const { eventHelper, creatorWalletInfo, alice } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[1].account!.interface.encodeFunctionData("transferNXPC", [
        await alice.getAddress(),
        10,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.changeEtherBalances(
        [creatorWalletInfo[1].account!.address, await alice.getAddress()],
        [-10, 10]
      );
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, alice } = await loadFixture(fixture);
      await expect(creatorWalletInfo[0].account!.transferNXPC(alice.getAddress(), 10)).to.be.revertedWith(
        nxErrors.SelfCallUpgradeable.forbidden
      );
    });
    it("Revert - when called not enough nxpc", async () => {
      const { eventHelper, creatorWalletInfo, alice } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[1].account!.interface.encodeFunctionData("transferNXPC", [
        await alice.getAddress(),
        ethers.utils.parseEther("100000000"),
      ]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.invalidAmount
      );
    });
  });

  describe("CreatorWallet - withdraw NESO", () => {
    it("Success", async () => {
      const { eventHelper, creatorWalletInfo, alice, neso } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[1].account!.interface.encodeFunctionData("withdrawERC20", [
        neso.address,
        await alice.getAddress(),
        10,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.changeTokenBalances(
        neso,
        [creatorWalletInfo[1].account!.address, await alice.getAddress()],
        [-10, 10]
      );
    });
    it("Success - all", async () => {
      const { eventHelper, creatorWalletInfo, alice, neso } = await loadFixture(fixture);
      const txnData = creatorWalletInfo[1].account!.interface.encodeFunctionData("withdrawERC20", [
        neso.address,
        await alice.getAddress(),
        creatorWalletInfo[0].nesoAmount,
      ]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.changeTokenBalances(
        neso,
        [creatorWalletInfo[1].account!.address, await alice.getAddress()],
        [-creatorWalletInfo[0].nesoAmount, creatorWalletInfo[0].nesoAmount]
      );
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, alice, neso } = await loadFixture(fixture);
      await expect(
        creatorWalletInfo[0].account!.withdrawERC20(neso.address, alice.getAddress(), 10)
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
  });

  describe("CreatorWallet - exchange NESO to NXPC", () => {
    it("Success", async () => {
      const { eventHelper, creatorWalletInfo, neso } = await loadFixture(fixture);
      const txnData1 = creatorWalletInfo[1].account!.interface.encodeFunctionData("transferNXPC", [neso.address, 1]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData1)).to.changeTokenBalances(
        neso,
        [creatorWalletInfo[1].account!.address],
        [100000]
      );
      const txnData2 = creatorWalletInfo[1].account!.interface.encodeFunctionData("convertNesoToNXPC", [100000]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData2)).to.changeEtherBalances(
        [creatorWalletInfo[1].account!.address],
        [1]
      );
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo } = await loadFixture(fixture);
      await expect(creatorWalletInfo[0].account!.convertNesoToNXPC(100000)).to.be.revertedWith(
        nxErrors.SelfCallUpgradeable.forbidden
      );
    });
  });

  describe("CreatorWallet - batchTransferERC1155(address,address,uint256[],uint256[])", () => {
    it("Success", async () => {
      const { eventHelper, creatorWalletInfo, alice, token1155 } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[1];
      await token1155.mintBatch(creatorWallet!.address, [10, 20], [5, 10], "0x");
      const txnData = creatorWallet!.interface.encodeFunctionData("batchTransferERC1155", [
        token1155.address,
        await alice.getAddress(),
        [10, 20],
        [3, 7],
      ]);
      await creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData);
      expect(await token1155.balanceOf(creatorWallet!.address, 10)).to.equal(2);
      expect(await token1155.balanceOf(alice.getAddress(), 10)).to.equal(3);
      expect(await token1155.balanceOf(creatorWallet!.address, 20)).to.equal(3);
      expect(await token1155.balanceOf(alice.getAddress(), 20)).to.equal(7);
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, alice, token1155 } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[1];
      await token1155.mintBatch(creatorWallet!.address, [10, 20], [5, 10], "0x");
      await expect(
        creatorWalletInfo[0].account!.batchTransferERC1155(
          token1155.address,
          await alice.getAddress(),
          [10, 20],
          [3, 7]
        )
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
  });

  describe("CreatorWallet - transferERC721", () => {
    it("Success", async () => {
      const { eventHelper, CreatorWallet, creatorWalletInfo, alice, token721 } = await loadFixture(fixture);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 10);
      const txnData = CreatorWallet.interface.encodeFunctionData("transferERC721", [
        token721.address,
        await alice.getAddress(),
        10,
      ]);
      await creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData);
      expect(await token721.ownerOf(10)).to.equal(await alice.getAddress());
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, alice, token721 } = await loadFixture(fixture);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 10);
      await expect(
        creatorWalletInfo[0].account!.transferERC721(token721.address, await alice.getAddress(), 10)
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
  });

  describe("CreatorWallet - batchTransferERC721", () => {
    it("Success", async () => {
      const { eventHelper, CreatorWallet, creatorWalletInfo, alice, token721 } = await loadFixture(fixture);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 10);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 20);
      const txnData = CreatorWallet.interface.encodeFunctionData("batchTransferERC721", [
        token721.address,
        [await alice.getAddress(), await alice.getAddress()],
        [10, 20],
      ]);
      await creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData);
      expect(await token721.ownerOf(10)).to.equal(await alice.getAddress());
      expect(await token721.ownerOf(20)).to.equal(await alice.getAddress());
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, alice, token721 } = await loadFixture(fixture);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 10);
      await expect(
        creatorWalletInfo[0].account!.batchTransferERC721(token721.address, [await alice.getAddress()], [10])
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
    it("Revert - when called invalid length", async () => {
      const { eventHelper, CreatorWallet, creatorWalletInfo, alice, token721 } = await loadFixture(fixture);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 10);
      await token721.safeMint(creatorWalletInfo[1].account!.address, 20);
      let txnData = CreatorWallet.interface.encodeFunctionData("batchTransferERC721", [
        token721.address,
        [await alice.getAddress(), await alice.getAddress()],
        [10],
      ]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.invalidLength
      );

      txnData = CreatorWallet.interface.encodeFunctionData("batchTransferERC721", [
        token721.address,
        [await alice.getAddress()],
        [10, 20],
      ]);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData)).to.be.revertedWith(
        nxErrors.CreatorWalletLogicUpgradeable.invalidLength
      );
    });
  });

  describe("CreatorWallet - transferERC1155", () => {
    it("Success", async () => {
      const { eventHelper, creatorWalletInfo, alice, token1155 } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[1];
      await token1155.mint(creatorWallet!.address, 10, 5, "0x");
      const txnData = creatorWallet!.interface.encodeFunctionData("transferERC1155", [
        token1155.address,
        await alice.getAddress(),
        10,
        3,
      ]);
      await creatorWalletCall(eventHelper, creatorWalletInfo[1], txnData);
      expect(await token1155.balanceOf(creatorWallet!.address, 10)).to.equal(2);
      expect(await token1155.balanceOf(alice.getAddress(), 10)).to.equal(3);
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo, alice, token1155 } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[1];
      await token1155.mint(creatorWallet!.address, 10, 5, "0x");
      await expect(
        creatorWalletInfo[0].account!.transferERC1155(token1155.address, await alice.getAddress(), 10, 3)
      ).to.be.revertedWith(nxErrors.SelfCallUpgradeable.forbidden);
    });
  });

  describe("CreatorWallet - requestItemIssuance", () => {
    it("Success", async () => {
      const { eventHelper, creatorWalletInfo, itemIssuance, poolAmount } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[0];
      const txnData = creatorWallet!.interface.encodeFunctionData("requestItemIssuance", [1, 100, 1]);
      const amount = expectAmount(100, poolAmount);
      await expect(creatorWalletCall(eventHelper, creatorWalletInfo[0], txnData))
        .to.emit(itemIssuance, "ItemRequested")
        .withArgs(1, 1, creatorWallet!.address, 100, 1, amount);
    });
    it("Revert - when called non-self", async () => {
      const { creatorWalletInfo } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[0];
      await expect(creatorWallet!.requestItemIssuance(1, 100, 1)).to.be.revertedWith(
        nxErrors.SelfCallUpgradeable.forbidden
      );
    });
  });

  describe("CreatorWallet - meta transaction", () => {
    it("Transfer ERC721", async () => {
      const { creatorWalletInfo, alice, token721, forwarder } = await loadFixture(fixture);
      const { account: creatorWallet } = creatorWalletInfo[0];
      await token721.safeMint(creatorWallet!.address, 10);
      const txnData = creatorWallet!.interface.encodeFunctionData("transferERC721", [
        token721.address,
        await alice.getAddress(),
        10,
      ]);
      expect(await token721.ownerOf(10)).to.equal(creatorWallet!.address);
      await creatorWalletCallWithForwarder(creatorWalletInfo[0], txnData, forwarder);
      expect(await token721.ownerOf(10)).to.equal(await alice.getAddress());
    });
  });

  // DAppRewardAllocationWallet

  describe("DAppRewardAllocationWallet - Check variable", () => {
    it("dAppId", async () => {
      const { dAppInfo } = await loadFixture(fixture);
      expect(await dAppInfo[0].account!.dAppId()).to.equal(1);
    });
  });

  describe("DAppRewardAllocationWallet - claim", () => {
    it("Success", async () => {
      const { dAppInfo, neso, alice } = await loadFixture(fixture);
      const { account: dAppWallet } = dAppInfo[0];
      const txn = neso.interface.encodeFunctionData("transfer", [await alice.getAddress(), 100]);
      await expect(dAppWallet!.exec(neso.address, txn, 0)).to.be.changeTokenBalances(
        neso,
        [dAppWallet!.address, await alice.getAddress()],
        [-100, 100]
      );
    });
    it("Success - batchExec", async () => {
      const { dAppInfo, neso, alice, bob } = await loadFixture(fixture);
      const { account: dAppWallet } = dAppInfo[0];
      const txn1 = neso.interface.encodeFunctionData("transfer", [await alice.getAddress(), 100]);
      const txn2 = neso.interface.encodeFunctionData("transfer", [await bob.getAddress(), 200]);

      await expect(
        dAppWallet!.batchExec([
          { to: neso.address, data: txn1, value: 0 },
          { to: neso.address, data: txn2, value: 0 },
        ])
      ).to.be.changeTokenBalances(
        neso,
        [dAppWallet!.address, await alice.getAddress(), await bob.getAddress()],
        [-300, 100, 200]
      );
    });
    it("Revert - when not called by owner nor executor", async () => {
      const { dAppInfo, neso, alice } = await loadFixture(fixture);
      const { account: dAppWallet } = dAppInfo[0];
      const txn = neso.interface.encodeFunctionData("transfer", [await alice.getAddress(), 100]);
      await expect(dAppWallet!.connect(alice).exec(neso.address, txn, 0)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
  });

  describe("DAppRewardAllocationWallet - deallocate", () => {
    it("Success", async () => {
      const { dAppInfo, neso, creatorWalletInfo } = await loadFixture(fixture);
      const { account: dAppWallet } = dAppInfo[0];

      expect(await neso.balanceOf(creatorWalletInfo[1].account!.address)).to.equal(creatorWalletInfo[1].nesoAmount);

      await dAppWallet!.deallocateERC20(neso.address, dAppInfo[0].nesoAmount);
      creatorWalletInfo[1].nesoAmount += dAppInfo[0].nesoAmount;

      expect(await neso.balanceOf(creatorWalletInfo[1].account!.address)).to.equal(creatorWalletInfo[1].nesoAmount);
    });
    it("Revert - when not called by owner nor executor", async () => {
      const { dAppInfo, neso, alice } = await loadFixture(fixture);
      const { account: dAppWallet } = dAppInfo[0];

      await expect(dAppWallet!.connect(alice).deallocateERC20(neso.address, dAppInfo[0].nesoAmount)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
  });

  describe("DAppRewardAllocationWallet - owner", () => {
    it("Success", async () => {
      const { dAppInfo, dAppOwner } = await loadFixture(fixture);
      expect(await dAppInfo[0].account!.owner()).to.equal(await dAppOwner.getAddress());
    });
  });

  describe("MockCreatorTokenControllerUpgradeable - onlyInitializing", () => {
    it("Revert - when not called initializing", async () => {
      const MockCreatorTokenControllerUpgradeable = await ethers.getContractFactory(
        "MockCreatorTokenControllerUpgradeable"
      );
      const mockCreatorTokenControllerUpgradeable = await MockCreatorTokenControllerUpgradeable.deploy();
      await mockCreatorTokenControllerUpgradeable.initialize();
      await expect(mockCreatorTokenControllerUpgradeable.f()).to.be.revertedWith(
        nxErrors.Initializable.notInitializing
      );
      await expect(mockCreatorTokenControllerUpgradeable.g()).to.be.revertedWith(
        nxErrors.Initializable.notInitializing
      );
    });
  });
});
