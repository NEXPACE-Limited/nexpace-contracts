import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWarp, deployTeleporter, now, signToken, sign721, sign1155 } from "./lib";

import nxErrors from "../lib/nx-errors";

describe("Bridge action", () => {
  // Fixtures
  async function deployFixture() {
    const [deployer, manager, ad1, ad2, initOwner] = await ethers.getSigners();

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const timestamp = await now();

    await deployWarp();
    await deployTeleporter();
    const [
      TeleporterRegistry,
      teleporterMessenger,
      SourceBridge,
      DestinationBridge,
      ERC20,
      ERC721,
      ERC1155,
      ImplERC20Token,
      ImplERC721Token,
      ImplERC1155Token,
      ReentrantAttack,
      Teller,
    ] = await Promise.all([
      ethers.getContractFactory("TeleporterRegistry"),
      ethers.getContractFactory("TeleporterMessenger"),
      ethers.getContractFactory("MockSourceBridge"),
      ethers.getContractFactory("MockDestinationBridge"),
      ethers.getContractFactory("ERC20PresetFixedSupply"),
      ethers.getContractFactory("ERC721PresetMinterPauserAutoId"),
      ethers.getContractFactory("ERC1155PresetMinterPauser"),
      ethers.getContractFactory("ERC20BridgeToken"),
      ethers.getContractFactory("ERC721BridgeToken"),
      ethers.getContractFactory("ERC1155BridgeToken"),
      ethers.getContractFactory("MockReentrantAttack"),
      ethers.getContractFactory("Teller"),
    ]);
    const forwarder = "0x1100000000000000000000000000000000000001";
    const initialize = {
      version: "1",
      protocolAddress: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf",
    };
    const teleporterRegistry = await TeleporterRegistry.deploy([initialize]);

    // Source bridge set
    const mockSourceBlockchainID = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const nativeTokenAddress = "0x0200000000000000000000000000000000000001";
    const sourceBridge = await SourceBridge.deploy(forwarder, teleporterRegistry.address, manager.address);
    await sourceBridge.connect(deployer).deployed();

    const submitted20 = await ERC20.deploy("SUBMIT20", "SBT20", 100_000_000n, await ad1.getAddress());
    const submitted721 = await ERC721.deploy("SUBMIT721", "SBT721", "http://mock.test.io/erc721/");
    const submitted1155 = await ERC1155.deploy("http://mock.test.io/erc1155/");

    const teller = await Teller.deploy(forwarder, sourceBridge.address, manager.address, submitted20.address);
    await teller.connect(deployer).deployed();

    await sourceBridge.connect(manager).setTeller(teller.address);
    const mintAndAprv = async () => {
      const approveTx = await submitted20.connect(ad1).approve(sourceBridge.address, 100_000_000n);
      const approveTxTeller = await submitted20.connect(ad1).approve(teller.address, 100_000_000n);
      const approval721Tx = await submitted721.connect(ad1).setApprovalForAll(sourceBridge.address, true);
      const approval1155Tx = await submitted1155.connect(ad1).setApprovalForAll(sourceBridge.address, true);
      await approveTx.wait();
      await approval721Tx.wait();
      await approval1155Tx.wait();
      await approveTxTeller.wait();
      for (let i = 0; i < 10; i++) {
        const mint721Tx = await submitted721.mint(await ad1.getAddress());
        await mint721Tx.wait();
        const mint1155Tx = await submitted1155.mint(await ad1.getAddress(), i, 100, "0x00");
        await mint1155Tx.wait();
      }
    };
    await Promise.all([await mintAndAprv()]);

    // Destination bridge set
    const mockDestinationBlockchainID = "0x0000000000000000000000000000000000000000000000000000000000000002";
    const implERC20Token = await ImplERC20Token.deploy(forwarder, deployer.address);
    const implERC721 = await ImplERC721Token.deploy(forwarder, deployer.address);
    const implERC1155 = await ImplERC1155Token.deploy(forwarder, deployer.address);

    const destinationBridge = await DestinationBridge.deploy(
      forwarder,
      teleporterRegistry.address,
      manager.address,
      initOwner.address,
      implERC20Token.address,
      implERC721.address,
      implERC1155.address
    );
    await destinationBridge.connect(deployer).deployed();

    const reentrantAttack = await ReentrantAttack.connect(deployer).deploy(
      mockDestinationBlockchainID,
      mockSourceBlockchainID,
      destinationBridge.address,
      sourceBridge.address
    );
    return {
      chainId,
      timestamp,
      forwarder,
      mockSourceBlockchainID,
      mockDestinationBlockchainID,
      sourceBridge,
      destinationBridge,
      teleporterMessenger,
      nativeTokenAddress,
      deployer,
      manager,
      ad1,
      ad2,
      initOwner,
      submitted20,
      submitted721,
      submitted1155,
      reentrantAttack,
      teller,
    };
  }
  async function submitFixture() {
    const {
      mockSourceBlockchainID,
      mockDestinationBlockchainID,
      sourceBridge,
      destinationBridge,
      teleporterMessenger,
      nativeTokenAddress,
      manager,
      submitted20,
      submitted721,
      submitted1155,
    } = await loadFixture(deployFixture);
    const sourceNative = {
      sourceTokenAddress: nativeTokenAddress,
      tokenType: 1,
      defaultBaseURI: "",
    };

    const sourceERC20 = {
      sourceTokenAddress: submitted20.address,
      tokenType: 2,
      defaultBaseURI: "",
    };
    const sourceERC721 = {
      sourceTokenAddress: submitted721.address,
      tokenType: 3,
      defaultBaseURI: "http://mock.test.io/erc721/",
    };
    const sourceERC1155 = {
      sourceTokenAddress: submitted1155.address,
      tokenType: 4,
      defaultBaseURI: "http://mock.test.io/erc1155/",
    };

    expect(
      await sourceBridge
        .connect(manager)
        .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceNative)
    )
      .to.emit(teleporterMessenger, "SendCrossChainMessage")
      .to.emit(sourceBridge, "SubmitCreateBridgeToken");

    const encodeDataNa = await sourceBridge.encodeCreateBridgeTokenData(nativeTokenAddress, "NATIVE", "NTV", 18);
    expect(await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataNa)).to.emit(
      destinationBridge,
      "CreateBridgeToken"
    );

    const wNativeAddr = await destinationBridge.wrappedTokensAddress(
      mockSourceBlockchainID,
      sourceBridge.address,
      nativeTokenAddress
    );

    expect(await destinationBridge.wrappedTokenContract(wNativeAddr)).to.equal(true);

    await sourceBridge
      .connect(manager)
      .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceERC20);
    const encodeData20 = await sourceBridge.encodeCreateBridgeTokenData(
      sourceERC20.sourceTokenAddress,
      await submitted20.name(),
      await submitted20.symbol(),
      await submitted20.decimals()
    );
    await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData20);
    const wERC20Addr = await destinationBridge.wrappedTokensAddress(
      mockSourceBlockchainID,
      sourceBridge.address,
      sourceERC20.sourceTokenAddress
    );

    await sourceBridge
      .connect(manager)
      .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceERC721);
    const encodeData721 = await sourceBridge.encodeCreateBridgeERC721Data(
      sourceERC721.sourceTokenAddress,
      await submitted721.name(),
      await submitted721.symbol(),
      sourceERC721.defaultBaseURI
    );
    await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData721);
    const wERC721Addr = await destinationBridge.wrappedTokensAddress(
      mockSourceBlockchainID,
      sourceBridge.address,
      sourceERC721.sourceTokenAddress
    );

    await sourceBridge
      .connect(manager)
      .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceERC1155);
    const encodeData1155 = await sourceBridge.encodeCreateBridgeERC1155Data(
      sourceERC1155.sourceTokenAddress,
      sourceERC1155.defaultBaseURI
    );
    await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData1155);
    const wERC1155Addr = await destinationBridge.wrappedTokensAddress(
      mockSourceBlockchainID,
      sourceBridge.address,
      sourceERC1155.sourceTokenAddress
    );

    const [wNa, wERC20, wERC721, wERC1155] = await Promise.all([
      ethers.getContractAt("ERC20BridgeToken", wNativeAddr),
      ethers.getContractAt("ERC20BridgeToken", wERC20Addr),
      ethers.getContractAt("ERC721BridgeToken", wERC721Addr),
      ethers.getContractAt("ERC1155BridgeToken", wERC1155Addr),
    ]);
    return { wNa, wERC20, wERC721, wERC1155 };
  }
  async function bridgeFixture() {
    const {
      mockSourceBlockchainID,
      mockDestinationBlockchainID,
      sourceBridge,
      destinationBridge,
      teleporterMessenger,
      nativeTokenAddress,
      ad1,
      ad2,
      submitted20,
      submitted721,
      submitted1155,
    } = await loadFixture(deployFixture);
    const { wNa, wERC20, wERC721, wERC1155 } = await loadFixture(submitFixture);

    const aprv = async () => {
      const approveNaTx = await wNa.connect(ad2).approve(destinationBridge.address, 100_000_000_000_000_000_000n);
      const approve20Tx = await wERC20.connect(ad2).approve(destinationBridge.address, 100_000_000_000_000_000_000n);
      const approval721Tx = await wERC721.connect(ad2).setApprovalForAll(destinationBridge.address, true);
      const approval1155Tx = await wERC1155.connect(ad2).setApprovalForAll(destinationBridge.address, true);
      await approveNaTx.wait();
      await approve20Tx.wait();
      await approval721Tx.wait();
      await approval1155Tx.wait();
    };
    await Promise.all([await aprv()]);

    // Native Birdge ////////////////////////////////////////////////////////////////////
    const ad1Balance = await ethers.provider.getBalance(ad1.address);
    const txnData = sourceBridge.interface.encodeFunctionData("bridgeTokens", [
      mockDestinationBlockchainID,
      destinationBridge.address,
      nativeTokenAddress,
      ad1.address,
      ad2.address,
      1_000_000_000_000_000_000n,
    ]);

    expect(await ad1.sendTransaction({ to: sourceBridge.address, value: 1_000_000_000_000_000_000n, data: txnData }))
      .to.emit(teleporterMessenger, "SendCrossChainMessage")
      .to.emit(sourceBridge, "BridgeTokens");

    const encodeNativeData = await sourceBridge.encodeMintWrappedTokenData(
      nativeTokenAddress,

      ad2.address,
      1_000_000_000_000_000_000n
    );

    expect(
      await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeNativeData)
    ).to.emit(destinationBridge, "MintBridgeToken");

    expect(await ethers.provider.getBalance(sourceBridge.address)).to.equal(1_000_000_000_000_000_000n);
    expect(await ethers.provider.getBalance(ad1.address)).to.lessThan(ad1Balance.add(-1_000_000_000_000_000_000n));
    expect(await wNa.balanceOf(ad2.address)).to.equal(1_000_000_000_000_000_000n);

    // ERC20 Birdge ////////////////////////////////////////////////////////////////////
    expect(
      await sourceBridge
        .connect(ad1)
        .bridgeTokens(
          mockDestinationBlockchainID,
          destinationBridge.address,
          submitted20.address,
          ad1.address,
          ad2.address,
          1_000n
        )
    )
      .to.emit(teleporterMessenger, "SendCrossChainMessage")
      .to.emit(sourceBridge, "BridgeTokens");

    const encodeERC20Data = await sourceBridge.encodeMintWrappedTokenData(submitted20.address, ad2.address, 1_000n);

    expect(
      await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeERC20Data)
    ).to.emit(destinationBridge, "MintBridgeToken");

    expect(await submitted20.balanceOf(ad1.address)).to.equal(99_999_000n);
    expect(await wERC20.balanceOf(ad2.address)).to.equal(1_000n);

    // ERC721 Birdge ////////////////////////////////////////////////////////////////////
    expect(
      await sourceBridge
        .connect(ad1)
        .bridgeERC721(
          mockDestinationBlockchainID,
          destinationBridge.address,
          submitted721.address,
          ad1.address,
          ad2.address,
          [1, 2, 3]
        )
    )
      .to.emit(teleporterMessenger, "SendCrossChainMessage")
      .to.emit(sourceBridge, "BridgeTokens");

    const encodeERC721Data = await sourceBridge.encodeMintERC721Data(submitted721.address, ad2.address, [1, 2, 3]);

    expect(
      await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeERC721Data)
    ).to.emit(destinationBridge, "MintBridgeToken");

    expect(await submitted721.ownerOf(1)).to.equal(sourceBridge.address);
    expect(await submitted721.ownerOf(2)).to.equal(sourceBridge.address);
    expect(await submitted721.ownerOf(3)).to.equal(sourceBridge.address);
    expect(await submitted721.balanceOf(sourceBridge.address)).to.equal(3);
    expect(await wERC721.ownerOf(1)).to.equal(ad2.address);
    expect(await wERC721.ownerOf(2)).to.equal(ad2.address);
    expect(await wERC721.ownerOf(3)).to.equal(ad2.address);
    expect(await wERC721.balanceOf(ad2.address)).to.equal(3);

    // ERC1155 Birdge ////////////////////////////////////////////////////////////////////
    expect(
      await sourceBridge
        .connect(ad1)
        .bridgeERC1155(
          mockDestinationBlockchainID,
          destinationBridge.address,
          submitted1155.address,
          ad1.address,
          ad2.address,
          [1, 2, 3],
          [5, 10, 15]
        )
    )
      .to.emit(teleporterMessenger, "SendCrossChainMessage")
      .to.emit(sourceBridge, "BridgeTokens");

    const encodeERC1155Data = await sourceBridge.encodeMintERC1155Data(
      submitted1155.address,
      ad2.address,
      [1, 2, 3],
      [5, 10, 15]
    );

    expect(
      await destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeERC1155Data)
    ).to.emit(destinationBridge, "MintBridgeToken");

    expect(await submitted1155.balanceOf(ad1.address, 1)).to.equal(95);
    expect(await submitted1155.balanceOf(sourceBridge.address, 1)).to.equal(5);
    expect(await submitted1155.balanceOf(ad1.address, 2)).to.equal(90);
    expect(await submitted1155.balanceOf(sourceBridge.address, 2)).to.equal(10);
    expect(await submitted1155.balanceOf(ad1.address, 3)).to.equal(85);
    expect(await submitted1155.balanceOf(sourceBridge.address, 3)).to.equal(15);
    expect(await wERC1155.balanceOf(ad2.address, 1)).to.equal(5);
    expect(await wERC1155.balanceOf(ad2.address, 2)).to.equal(10);
    expect(await wERC1155.balanceOf(ad2.address, 3)).to.equal(15);
  }
  describe("Happy case - Pay the fees using native token for Bridging", async () => {
    it("Bridge native token by teller", async () => {
      const {
        chainId,
        timestamp,
        teller,
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 101, data: txnData })).to.be.emit(
        sourceBridge,
        "BridgeTokens"
      );
    });
    it("Bridge ERC20 token by teller", async () => {
      const {
        chainId,
        timestamp,
        teller,
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted20,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 1, data: txnData })).to.be.emit(
        sourceBridge,
        "BridgeTokens"
      );
    });
    it("Bridge 721 token by teller", async () => {
      const {
        chainId,
        timestamp,
        manager,
        teller,
        sourceBridge,
        destinationBridge,
        ad1,
        mockDestinationBlockchainID,
        submitted721,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };

      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.emit(
        sourceBridge,
        "BridgeERC721"
      );
    });
    it("Bridge 1155 token by teller", async () => {
      const {
        chainId,
        timestamp,
        manager,
        teller,
        sourceBridge,
        destinationBridge,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };

      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.emit(
        sourceBridge,
        "BridgeERC1155"
      );
    });
  });
  describe("Happy case - Pay the fees using ERC20 token for Bridging", async () => {
    it("Bridge native token by teller", async () => {
      const {
        chainId,
        timestamp,
        teller,
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.emit(
        sourceBridge,
        "BridgeTokens"
      );
    });
    it("Bridge ERC20 token by teller", async () => {
      const {
        chainId,
        timestamp,
        teller,
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted20,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.emit(sourceBridge, "BridgeTokens");
    });
    it("Bridge 721 token by teller", async () => {
      const {
        chainId,
        timestamp,
        manager,
        teller,
        sourceBridge,
        destinationBridge,
        ad1,
        mockDestinationBlockchainID,
        submitted721,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };

      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.emit(sourceBridge, "BridgeERC721");
    });
    it("Bridge 1155 token by teller", async () => {
      const {
        chainId,
        timestamp,
        manager,
        teller,
        sourceBridge,
        destinationBridge,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };

      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.emit(
        sourceBridge,
        "BridgeERC1155"
      );
    });
  });
  describe("Happy case - Set / Get functions", async () => {
    it("set teller", async () => {
      const { teller, manager } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      expect(await teller.getRequestSigner()).to.equal(manager.address);
      await teller.setRequestSigner(ethers.constants.AddressZero);
      expect(await teller.getRequestSigner()).to.equal(ethers.constants.AddressZero);
    });
    it("set neso", async () => {
      const { teller, submitted20 } = await loadFixture(deployFixture);
      const { wERC20 } = await loadFixture(submitFixture);
      expect(await teller.getNeso()).to.equal(submitted20.address);
      await teller.setNeso(wERC20.address);
      expect(await teller.getNeso()).to.equal(wERC20.address);
    });
  });
  describe("Fail case - Bridging native token using native token", async () => {
    it("not order requester", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, ad1.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeTokensWithNXPC(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - wrong signature", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, ad1.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidSignature
      );
    });
    it("invalid order hash - used signature", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, value: 102, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("wrong value", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.wrongValue
      );
    });
    it("cannot send to zero address - order.to", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ethers.constants.AddressZero,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("cannot send to zero address - order.commissionTo", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: ethers.constants.AddressZero,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("cannot receivable contract address", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.transferFailed
      );
    });
    it("deadline", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 102, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging ERC20 token using native token", async () => {
    it("not order requester", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);
      await expect(teller.connect(manager).bridgeTokensWithNXPC(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - used order hash", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, value: 2, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("wrong value", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.wrongValue
      );
    });
    it("cannot receivable contract address", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.transferFailed
      );
    });
    it("deadline", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging ERC721 token using native token", async () => {
    it("not order requester", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeERC721WithNXPC(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - used order hash", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNXPC", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, value: 1, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, value: 1, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("wrong value", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.wrongValue
      );
    });
    it("cannot receivable contract address", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.transferFailed
      );
    });
    it("deadline", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging ERC1155 token using native token", async () => {
    it("mismatch ids and amount length", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4, 5],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(ad1).bridgeERC1155WithNXPC(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.wrongLength
      );
    });
    it("not order requester", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeERC1155WithNXPC(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - used order hash", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNXPC", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, value: 1, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, value: 1, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("wrong value", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.wrongValue
      );
    });
    it("cannot receivable contract address", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.transferFailed
      );
    });
    it("deadline", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNXPC", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging native token using ERC20", async () => {
    it("not order requester", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeTokensWithNESO(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - used order hash", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, value: 100, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("wrong value", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 2, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.wrongValue
      );
    });
    it("deadline", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: destinationBridge.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: nativeTokenAddress,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, value: 100, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging ERC20 token using ERC20", async () => {
    it("not order requester", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeTokensWithNESO(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid siganture - used order hash", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("deadline", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted20.address,
        sender: ad1.address,
        recipient: ad1.address,
        amount: 100,
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await signToken(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeTokensWithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging ERC721 token using ERC20", async () => {
    it("not order requester", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeERC721WithNESO(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - used order hash", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNESO", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("deadline", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const { chainId, timestamp, teller, destinationBridge, manager, ad1, mockDestinationBlockchainID, submitted721 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign721(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeERC721WithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Bridging ERC1155 token using ERC20", async () => {
    it("mismatch ids and amount length", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4, 5],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 1,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(ad1).bridgeERC1155WithNESO(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.wrongLength
      );
    });
    it("not order requester", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      await expect(teller.connect(manager).bridgeERC1155WithNESO(requestOrder, signature)).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("invalid signature - used order hash", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNESO", [requestOrder, signature]);
      await ad1.sendTransaction({ to: teller.address, data: txnData });
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidOrderHash
      );
    });
    it("deadline", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp - 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Teller.invalidRequest
      );
    });
    it("Paused", async () => {
      const {
        chainId,
        timestamp,
        teller,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      const requestOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [4],
        amounts: [5],
        commissionTo: manager.address,
        commissionAmount: 2,
        deadline: timestamp + 1000,
        salt: 1,
      };
      const signature = await sign1155(chainId, teller.address, manager, requestOrder);

      await teller.pause();

      const txnData = teller.interface.encodeFunctionData("bridgeERC1155WithNESO", [requestOrder, signature]);
      await expect(ad1.sendTransaction({ to: teller.address, data: txnData })).to.be.revertedWith(
        nxErrors.Pausable.paused
      );
    });
  });
  describe("Fail case - Set / Get functions", async () => {
    it("set teller", async () => {
      const { teller, ad1 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(teller.connect(ad1).setRequestSigner(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
    it("set neso", async () => {
      const { teller, ad1 } = await loadFixture(deployFixture);
      const { wERC20 } = await loadFixture(submitFixture);
      await expect(teller.connect(ad1).setNeso(wERC20.address)).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
  });
});