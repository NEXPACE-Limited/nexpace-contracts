import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWarp, deployTeleporter } from "./lib";

import nxErrors from "../lib/nx-errors";

describe("Bridge action", () => {
  // Fixtures
  async function deployFixture() {
    const [deployer, manager, ad1, ad2, initOwner] = await ethers.getSigners();

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
    ]);
    const forwarder = "0x0500000000000000000000000000000000000001";
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

    expect(await sourceBridge.getTeller()).to.equal(ethers.constants.AddressZero);
    await sourceBridge.connect(manager).setTeller(manager.address);
    expect(await sourceBridge.getTeller()).to.equal(manager.address);

    const submitted20 = await ERC20.deploy("SUBMIT20", "SBT20", 100_000_000n, await ad1.getAddress());
    const submitted721 = await ERC721.deploy("SUBMIT721", "SBT721", "http://mock.test.io/erc721/");
    const submitted1155 = await ERC1155.deploy("http://mock.test.io/erc1155/");

    const mintAndAprv = async () => {
      const approveTx = await submitted20.connect(ad1).approve(sourceBridge.address, 100_000_000n);
      const approval721Tx = await submitted721.connect(ad1).setApprovalForAll(sourceBridge.address, true);
      const approval1155Tx = await submitted1155.connect(ad1).setApprovalForAll(sourceBridge.address, true);
      await approveTx.wait();
      await approval721Tx.wait();
      await approval1155Tx.wait();
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
  const bridgeFixture = async () => {
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
      .to.emit(sourceBridge, "BridgeERC721");

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
      .to.emit(sourceBridge, "BridgeERC1155");

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
  };
  describe("Happy case - Bridging token", async () => {
    it("Bridge native token from dest to source", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      const { wNa } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      await destinationBridge
        .connect(ad2)
        .bridgeTokens(
          mockSourceBlockchainID,
          sourceBridge.address,
          nativeTokenAddress,
          ad2.address,
          500_000_000_000_000_000n
        );

      const encodeDataNa = await destinationBridge.encodeUnlockOriginTokensData(
        mockSourceBlockchainID,
        sourceBridge.address,
        nativeTokenAddress,
        ad2.address,
        500_000_000_000_000_000n
      );
      await sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataNa);
      expect(await ethers.provider.getBalance(sourceBridge.address)).to.equal(500_000_000_000_000_000n);
      expect(await wNa.balanceOf(ad2.address)).to.equal(500_000_000_000_000_000n);
    });
    it("Bridge ERC20 token from dest to source", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      const { wERC20 } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      await destinationBridge
        .connect(ad2)
        .bridgeTokens(mockSourceBlockchainID, sourceBridge.address, submitted20.address, ad2.address, 400n);
      const encodeDataERC20 = await destinationBridge.encodeUnlockOriginTokensData(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted20.address,
        ad2.address,
        400n
      );
      await sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC20);
      expect(await submitted20.balanceOf(ad2.address)).to.equal(400n);
      expect(await submitted20.balanceOf(sourceBridge.address)).to.equal(600n);
      expect(await wERC20.balanceOf(ad2.address)).to.equal(600n);
    });
    it("Bridge ERC721 token from dest to source", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        submitted721,
      } = await loadFixture(deployFixture);
      const { wERC721 } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      await destinationBridge
        .connect(ad2)
        .bridgeERC721(mockSourceBlockchainID, sourceBridge.address, submitted721.address, ad2.address, [1, 3]);
      const encode721Data = await destinationBridge.encodeUnlockERC721Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted721.address,
        ad2.address,
        [1, 3]
      );
      await sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encode721Data);
      expect(await submitted721.ownerOf(1)).to.equal(ad2.address);
      expect(await submitted721.ownerOf(2)).to.equal(sourceBridge.address);
      expect(await submitted721.ownerOf(3)).to.equal(ad2.address);
      expect(await wERC721.ownerOf(2)).to.equal(ad2.address);
    });
    it("Bridge ERC1155 token from dest to source", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      const { wERC1155 } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      await destinationBridge
        .connect(ad2)
        .bridgeERC1155(
          mockSourceBlockchainID,
          sourceBridge.address,
          submitted1155.address,
          ad2.address,
          [1, 2, 3],
          [1, 1, 1]
        );
      const encode1155Data = await destinationBridge.encodeUnlockERC1155Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted1155.address,
        ad2.address,
        [1, 2, 3],
        [1, 1, 1]
      );
      await sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encode1155Data);
      expect(await submitted1155.balanceOf(ad2.address, 1)).to.equal(1);
      expect(await submitted1155.balanceOf(sourceBridge.address, 1)).to.equal(4);
      expect(await submitted1155.balanceOf(ad2.address, 2)).to.equal(1);
      expect(await submitted1155.balanceOf(sourceBridge.address, 2)).to.equal(9);
      expect(await submitted1155.balanceOf(ad2.address, 3)).to.equal(1);
      expect(await submitted1155.balanceOf(sourceBridge.address, 3)).to.equal(14);
      expect(await wERC1155.balanceOf(ad2.address, 1)).to.equal(4);
      expect(await wERC1155.balanceOf(ad2.address, 2)).to.equal(9);
      expect(await wERC1155.balanceOf(ad2.address, 3)).to.equal(14);
    });
    it("Bridge ERC20 token from source to dest by teller", async () => {
      const {
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted20,
        teleporterMessenger,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      expect(
        await sourceBridge
          .connect(manager)
          .bridgeTokens(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted20.address,
            ad1.address,
            ad1.address,
            1_000n
          )
      )
        .to.emit(teleporterMessenger, "SendCrossChainMessage")
        .to.emit(sourceBridge, "BridgeTokens");

      expect(await submitted20.balanceOf(ad1.address)).to.equal(99_999_000n);
    });
    it("Bridge ERC721 token from source to dest by teller", async () => {
      const {
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted721,
        teleporterMessenger,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      expect(
        await sourceBridge
          .connect(manager)
          .bridgeERC721(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted721.address,
            ad1.address,
            ad1.address,
            [1, 2, 3]
          )
      )
        .to.emit(teleporterMessenger, "SendCrossChainMessage")
        .to.emit(sourceBridge, "BridgeERC721");

      expect(await submitted721.ownerOf(1)).to.equal(sourceBridge.address);
      expect(await submitted721.ownerOf(2)).to.equal(sourceBridge.address);
      expect(await submitted721.ownerOf(3)).to.equal(sourceBridge.address);
      expect(await submitted721.balanceOf(sourceBridge.address)).to.equal(3);
    });
    it("Bridge ERC1155 token from source to dest by teller", async () => {
      const {
        sourceBridge,
        destinationBridge,
        manager,
        ad1,
        mockDestinationBlockchainID,
        submitted1155,
        teleporterMessenger,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      expect(
        await sourceBridge
          .connect(manager)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad1.address,
            ad1.address,
            [1, 2, 3],
            [5, 10, 15]
          )
      )
        .to.emit(teleporterMessenger, "SendCrossChainMessage")
        .to.emit(sourceBridge, "BridgeERC1155");

      expect(await submitted1155.balanceOf(ad1.address, 1)).to.equal(95);
      expect(await submitted1155.balanceOf(sourceBridge.address, 1)).to.equal(5);
      expect(await submitted1155.balanceOf(ad1.address, 2)).to.equal(90);
      expect(await submitted1155.balanceOf(sourceBridge.address, 2)).to.equal(10);
      expect(await submitted1155.balanceOf(ad1.address, 3)).to.equal(85);
      expect(await submitted1155.balanceOf(sourceBridge.address, 3)).to.equal(15);
    });
  });
  describe("Happy case - Set / Get functions", async () => {
    it("set teller", async () => {
      const { sourceBridge, manager, ad1 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      expect(await sourceBridge.getTeller()).to.equal(manager.address);
      await sourceBridge.connect(manager).setTeller(ad1.address);
      expect(await sourceBridge.getTeller()).to.equal(ad1.address);
    });
    it("set init owner", async () => {
      const { destinationBridge, manager, initOwner } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      expect(await destinationBridge.getInitOwner()).to.equal(initOwner.address);
      await destinationBridge.connect(manager).setInitOwner(manager.address);
      expect(await destinationBridge.getInitOwner()).to.equal(manager.address);
    });
    it("set init owner", async () => {
      const { destinationBridge, manager, initOwner } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      expect(await destinationBridge.getInitOwner()).to.equal(initOwner.address);
      await destinationBridge.connect(manager).setInitOwner(manager.address);
      expect(await destinationBridge.getInitOwner()).to.equal(manager.address);
    });
    it("set relayer", async () => {
      const { sourceBridge, destinationBridge, manager } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      expect((await sourceBridge.getAllowedRelayerAddresses()).length).to.equal(0);
      expect((await destinationBridge.getAllowedRelayerAddresses()).length).to.equal(0);
      await sourceBridge.connect(manager).addAllowedRelayer(manager.address);
      expect((await sourceBridge.getAllowedRelayerAddresses()).length).to.equal(1);
      await destinationBridge.connect(manager).addAllowedRelayer(manager.address);
      expect((await destinationBridge.getAllowedRelayerAddresses()).length).to.equal(1);
      await sourceBridge.connect(manager).clearAllowedRelayer();
      await destinationBridge.connect(manager).clearAllowedRelayer();
      expect((await sourceBridge.getAllowedRelayerAddresses()).length).to.equal(0);
      expect((await destinationBridge.getAllowedRelayerAddresses()).length).to.equal(0);
    });
  });
  describe("Fail case - submitCreateBridgeToken", async () => {
    it("wrong source token address", async () => {
      const { sourceBridge, manager, destinationBridge, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: ethers.constants.AddressZero,
        tokenType: 1,
        defaultBaseURI: "",
      };
      await expect(
        sourceBridge
          .connect(manager)
          .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { sourceBridge, manager, nativeTokenAddress, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: nativeTokenAddress,
        tokenType: 1,
        defaultBaseURI: "",
      };
      await expect(
        sourceBridge
          .connect(manager)
          .submitCreateBridgeToken(mockDestinationBlockchainID, ethers.constants.AddressZero, sourceTokenInfo)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("exist contract", async () => {
      const { sourceBridge, destinationBridge, manager, nativeTokenAddress, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: nativeTokenAddress,
        tokenType: 1,
        defaultBaseURI: "",
      };
      await expect(
        sourceBridge
          .connect(manager)
          .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong token type", async () => {
      const { sourceBridge, destinationBridge, manager, nativeTokenAddress, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: nativeTokenAddress,
        tokenType: 5,
        defaultBaseURI: "",
      };
      await expect(
        sourceBridge
          .connect(manager)
          .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("not executor", async () => {
      const { sourceBridge, destinationBridge, ad1, nativeTokenAddress, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: nativeTokenAddress,
        tokenType: 1,
        defaultBaseURI: "",
      };
      await expect(
        sourceBridge
          .connect(ad1)
          .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo)
      ).to.be.revertedWith(nxErrors.NextOwnable.executorForbidden);
    });
  });
  describe("Fail case - bridging native / ERC20 bridge token(source to dest)", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad1, nativeTokenAddress } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const wrongBlockchainID = await sourceBridge.currentBlockchainID();
      const txnData = sourceBridge.interface.encodeFunctionData("bridgeTokens", [
        wrongBlockchainID,
        destinationBridge.address,
        nativeTokenAddress,
        ad1.address,
        ad1.address,
        1_000_000_000_000_000_000n,
      ]);
      await expect(
        ad1.sendTransaction({ to: sourceBridge.address, value: 1_000_000_000_000_000_000n, data: txnData })
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong from address", async () => {
      const { sourceBridge, destinationBridge, ad1, ad2, submitted20, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeTokens(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted20.address,
            ad2.address,
            ad1.address,
            1_000n
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong recipient address", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted20, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeTokens(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted20.address,
            ad1.address,
            ethers.constants.AddressZero,
            1_000n
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong source token address", async () => {
      const { sourceBridge, ad1, destinationBridge, mockDestinationBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeTokens(
            mockDestinationBlockchainID,
            destinationBridge.address,
            ethers.constants.AddressZero,
            ad1.address,
            ad1.address,
            1_000n
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { sourceBridge, ad1, submitted20, mockDestinationBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeTokens(
            mockDestinationBlockchainID,
            ethers.constants.AddressZero,
            submitted20.address,
            ad1.address,
            ad1.address,
            1_000n
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("submitted wrong token type value for native token contract", async () => {
      const { sourceBridge, destinationBridge, manager, ad1, nativeTokenAddress, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: nativeTokenAddress,
        tokenType: 4,
        defaultBaseURI: "",
      };
      await sourceBridge
        .connect(manager)
        .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo);
      const txnData = sourceBridge.interface.encodeFunctionData("bridgeTokens", [
        mockDestinationBlockchainID,
        destinationBridge.address,
        nativeTokenAddress,
        ad1.address,
        ad1.address,
        1_000_000_000_000_000_000n,
      ]);
      await expect(
        ad1.sendTransaction({ to: sourceBridge.address, value: 1_000_000_000_000_000_000n, data: txnData })
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("native token bridging with wrong value", async () => {
      const { sourceBridge, destinationBridge, ad1, nativeTokenAddress, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const txnData = sourceBridge.interface.encodeFunctionData("bridgeTokens", [
        mockDestinationBlockchainID,
        destinationBridge.address,
        nativeTokenAddress,
        ad1.address,
        ad1.address,
        1_000_000_000_000_000_000n,
      ]);
      await expect(
        ad1.sendTransaction({ to: sourceBridge.address, value: 100_000_000_000_000_000n, data: txnData })
      ).to.be.revertedWith(nxErrors.SourceBridge.wrongAmount);
    });
    it("submitted wrong token type value for erc20 token contract", async () => {
      const { sourceBridge, destinationBridge, manager, submitted20, ad1, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: submitted20.address,
        tokenType: 1,
        defaultBaseURI: "",
      };
      await sourceBridge
        .connect(manager)
        .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeTokens(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted20.address,
            ad1.address,
            ad1.address,
            1_000n
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("ERC20 token bridging with wrong value", async () => {
      const { sourceBridge, destinationBridge, submitted20, ad1, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const txnData = sourceBridge.interface.encodeFunctionData("bridgeTokens", [
        mockDestinationBlockchainID,
        destinationBridge.address,
        submitted20.address,
        ad1.address,
        ad1.address,
        1_000n,
      ]);
      await expect(
        ad1.sendTransaction({ to: sourceBridge.address, value: 100_000_000_000_000_000n, data: txnData })
      ).to.be.revertedWith(nxErrors.SourceBridge.wrongValue);
    });
    it("when paused", async () => {
      const { sourceBridge, destinationBridge, manager, submitted20, ad1, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await sourceBridge.connect(manager).pause();
      const txnData = sourceBridge.interface.encodeFunctionData("bridgeTokens", [
        mockDestinationBlockchainID,
        destinationBridge.address,
        submitted20.address,
        ad1.address,
        ad1.address,
        100_000_000_000_000_000n,
      ]);
      await expect(
        ad1.sendTransaction({ to: sourceBridge.address, value: 100_000_000_000_000_000n, data: txnData })
      ).to.be.revertedWith("Pausable: paused");
    });
  });
  describe("Fail case - bridging ERC721 bridge token(source to dest)", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted721 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const wrongBlockchainID = await sourceBridge.currentBlockchainID();
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(wrongBlockchainID, destinationBridge.address, submitted721.address, ad1.address, ad1.address, [
            1,
          ])
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong from address", async () => {
      const { sourceBridge, destinationBridge, ad1, ad2, submitted721, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted721.address,
            ad2.address,
            ad1.address,
            [1]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong recipient address", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted721, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted721.address,
            ad1.address,
            ethers.constants.AddressZero,
            [1]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong source token address", async () => {
      const { sourceBridge, ad1, destinationBridge, mockDestinationBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            mockDestinationBlockchainID,
            destinationBridge.address,
            ethers.constants.AddressZero,
            ad1.address,
            ad1.address,
            [1]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { sourceBridge, ad1, submitted721, mockDestinationBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            mockDestinationBlockchainID,
            ethers.constants.AddressZero,
            submitted721.address,
            ad1.address,
            ad1.address,
            [1]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("over block gas limit", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted721, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const fakeOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted721.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [1],
      };

      for (let i = 2; i < 130; i++) {
        fakeOrder.tokenIds.push(i);
      }

      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            fakeOrder.destinationBlockchainID,
            fakeOrder.destinationBridgeAddress,
            fakeOrder.sourceTokenAddress,
            fakeOrder.sender,
            fakeOrder.recipient,
            fakeOrder.tokenIds
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.overBlockGas);
    });
    it("submitted wrong token type value for native token contract", async () => {
      const { sourceBridge, destinationBridge, manager, ad1, submitted721, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: submitted721.address,
        tokenType: 4,
        defaultBaseURI: "http://mock.test.io/erc721/",
      };
      await sourceBridge
        .connect(manager)
        .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted721.address,
            ad1.address,
            ad1.address,
            [1]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("when paused", async () => {
      const { sourceBridge, destinationBridge, manager, submitted721, ad1, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await sourceBridge.connect(manager).pause();
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC721(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted721.address,
            ad1.address,
            ad1.address,
            [1]
          )
      ).to.be.revertedWith("Pausable: paused");
    });
  });
  describe("Fail case - bridging ERC1155 bridge token(source to dest)", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted1155 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const wrongBlockchainID = await sourceBridge.currentBlockchainID();
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            wrongBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad1.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong from address", async () => {
      const { sourceBridge, destinationBridge, ad1, ad2, submitted1155, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad2.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong recipient address", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted1155, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad1.address,
            ethers.constants.AddressZero,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong source token address", async () => {
      const { sourceBridge, ad1, destinationBridge, mockDestinationBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            ethers.constants.AddressZero,
            ad1.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { sourceBridge, ad1, submitted1155, mockDestinationBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            ethers.constants.AddressZero,
            submitted1155.address,
            ad1.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidAddress);
    });
    it("wrong length with amounts and ids", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted1155, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad1.address,
            ad1.address,
            [1],
            [5, 10]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.wrongLength);
    });
    it("over block gas limit", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted1155, mockDestinationBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const fakeOrder = {
        destinationBlockchainID: mockDestinationBlockchainID,
        destinationBridgeAddress: destinationBridge.address,
        sourceTokenAddress: submitted1155.address,
        sender: ad1.address,
        recipient: ad1.address,
        tokenIds: [1],
        amounts: [1],
      };

      for (let i = 2; i < 130; i++) {
        fakeOrder.tokenIds.push(i);
        fakeOrder.amounts.push(i);
      }

      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            fakeOrder.destinationBlockchainID,
            fakeOrder.destinationBridgeAddress,
            fakeOrder.sourceTokenAddress,
            fakeOrder.sender,
            fakeOrder.recipient,
            fakeOrder.tokenIds,
            fakeOrder.amounts
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.overBlockGas);
    });
    it("submitted wrong token type value", async () => {
      const { sourceBridge, destinationBridge, manager, ad1, submitted1155, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      const sourceTokenInfo = {
        sourceTokenAddress: submitted1155.address,
        tokenType: 1,
        defaultBaseURI: "http://mock.test.io/erc721/",
      };
      await sourceBridge
        .connect(manager)
        .submitCreateBridgeToken(mockDestinationBlockchainID, destinationBridge.address, sourceTokenInfo);
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad1.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("when paused", async () => {
      const { sourceBridge, destinationBridge, manager, submitted1155, ad1, mockDestinationBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await sourceBridge.connect(manager).pause();
      await expect(
        sourceBridge
          .connect(ad1)
          .bridgeERC1155(
            mockDestinationBlockchainID,
            destinationBridge.address,
            submitted1155.address,
            ad1.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith("Pausable: paused");
    });
  });
  describe("Fail case - bridging ERC20 bridge token(dest to source)", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad1, nativeTokenAddress } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const wrongBlockchainID = await destinationBridge.currentBlockchainID();
      await expect(
        destinationBridge.bridgeTokens(wrongBlockchainID, sourceBridge.address, nativeTokenAddress, ad1.address, 400n)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
    it("wrong recipient address", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted20, mockSourceBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeTokens(
            mockSourceBlockchainID,
            sourceBridge.address,
            submitted20.address,
            ethers.constants.AddressZero,
            100n
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { destinationBridge, ad1, submitted20, mockSourceBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeTokens(mockSourceBlockchainID, ethers.constants.AddressZero, submitted20.address, ad1.address, 100n)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong source token address(zero address)", async () => {
      const { destinationBridge, ad1, sourceBridge, mockSourceBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeTokens(mockSourceBlockchainID, sourceBridge.address, ethers.constants.AddressZero, ad1.address, 100n)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong source token address(wrong value)", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC20 } = await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeTokens(mockSourceBlockchainID, sourceBridge.address, wERC20.address, ad1.address, 100n)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("when paused", async () => {
      const { sourceBridge, destinationBridge, manager, submitted20, ad1, mockSourceBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await destinationBridge.connect(manager).pause();
      await expect(
        destinationBridge.bridgeTokens(
          mockSourceBlockchainID,
          sourceBridge.address,
          submitted20.address,
          ad1.address,
          100n
        )
      ).to.be.revertedWith("Pausable: paused");
    });
  });
  describe("Fail case - bridging ERC721 bridge token(dest to source)", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted721 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const wrongBlockchainID = await destinationBridge.currentBlockchainID();
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(wrongBlockchainID, sourceBridge.address, submitted721.address, ad1.address, [1])
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
    it("wrong recipient address", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted721, mockSourceBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(
            mockSourceBlockchainID,
            sourceBridge.address,
            submitted721.address,
            ethers.constants.AddressZero,
            [1]
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { destinationBridge, ad1, submitted721, mockSourceBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(mockSourceBlockchainID, ethers.constants.AddressZero, submitted721.address, ad1.address, [1])
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong source token address(zero address)", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(mockSourceBlockchainID, sourceBridge.address, ethers.constants.AddressZero, ad1.address, [1])
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong source token address(wrong value)", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC721 } = await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(mockSourceBlockchainID, sourceBridge.address, wERC721.address, ad1.address, [1])
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("over block gas limit", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC721 } = await loadFixture(submitFixture);

      const fakeOrder = {
        destinationBlockchainID: mockSourceBlockchainID,
        destinationBridgeAddress: sourceBridge.address,
        destinationTokenAddress: wERC721.address,
        recipient: ad1.address,
        tokenIds: [1],
      };

      for (let i = 2; i < 130; i++) {
        fakeOrder.tokenIds.push(i);
      }

      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(
            fakeOrder.destinationBlockchainID,
            fakeOrder.destinationBridgeAddress,
            fakeOrder.destinationTokenAddress,
            fakeOrder.recipient,
            fakeOrder.tokenIds
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.overBlockGas);
    });
    it("when paused", async () => {
      const { sourceBridge, destinationBridge, manager, submitted721, ad1, mockSourceBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await destinationBridge.connect(manager).pause();
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC721(mockSourceBlockchainID, sourceBridge.address, submitted721.address, ad1.address, [1])
      ).to.be.revertedWith("Pausable: paused");
    });
  });
  describe("Fail case - bridging ERC1155 bridge token(dest to source)", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted1155 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const wrongBlockchainID = await destinationBridge.currentBlockchainID();
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(wrongBlockchainID, sourceBridge.address, submitted1155.address, ad1.address, [1], [5])
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
    it("wrong recipient address", async () => {
      const { sourceBridge, destinationBridge, ad1, submitted1155, mockSourceBlockchainID } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(
            mockSourceBlockchainID,
            sourceBridge.address,
            submitted1155.address,
            ethers.constants.AddressZero,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong destination bridge address", async () => {
      const { destinationBridge, ad1, submitted1155, mockSourceBlockchainID } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(
            mockSourceBlockchainID,
            ethers.constants.AddressZero,
            submitted1155.address,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong source token address(zero address)", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(
            mockSourceBlockchainID,
            sourceBridge.address,
            ethers.constants.AddressZero,
            ad1.address,
            [1],
            [5]
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("wrong source token address(wrong value)", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC1155 } = await loadFixture(submitFixture);
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(mockSourceBlockchainID, sourceBridge.address, wERC1155.address, ad1.address, [1], [5])
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
    it("over block gas limit", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC1155 } = await loadFixture(submitFixture);

      const fakeOrder = {
        destinationBlockchainID: mockSourceBlockchainID,
        destinationBridgeAddress: sourceBridge.address,
        destinationTokenAddress: wERC1155.address,
        recipient: ad1.address,
        tokenIds: [1],
        amounts: [1],
      };

      for (let i = 2; i < 130; i++) {
        fakeOrder.tokenIds.push(i);
        fakeOrder.amounts.push(i);
      }

      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(
            fakeOrder.destinationBlockchainID,
            fakeOrder.destinationBridgeAddress,
            fakeOrder.destinationTokenAddress,
            fakeOrder.recipient,
            fakeOrder.tokenIds,
            fakeOrder.amounts
          )
      ).to.be.revertedWith(nxErrors.DestinationBridge.overBlockGas);
    });
    it("when paused", async () => {
      const { sourceBridge, destinationBridge, manager, submitted1155, ad1, mockSourceBlockchainID } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await destinationBridge.connect(manager).pause();
      await expect(
        destinationBridge
          .connect(ad1)
          .bridgeERC1155(mockSourceBlockchainID, sourceBridge.address, submitted1155.address, ad1.address, [1], [5])
      ).to.be.revertedWith("Pausable: paused");
    });
  });
  describe("Fail case - Unlock bridge token", async () => {
    it("not enough balance", async () => {
      const {
        sourceBridge,
        destinationBridge,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        nativeTokenAddress,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataNa = await destinationBridge.encodeUnlockOriginTokensData(
        mockSourceBlockchainID,
        sourceBridge.address,
        nativeTokenAddress,
        sourceBridge.address,
        400n
      );
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataNa)
      ).to.be.revertedWith(nxErrors.SourceBridge.transferFailed);
    });
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID, submitted20 } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC20 = await destinationBridge.encodeUnlockOriginTokensData(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted20.address,
        ad2.address,
        400n
      );
      await expect(
        sourceBridge.receiveMessage(mockSourceBlockchainID, destinationBridge.address, encodeDataERC20)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong bridge address", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC20 = await destinationBridge.encodeUnlockOriginTokensData(
        mockSourceBlockchainID,
        destinationBridge.address,
        submitted20.address,
        ad2.address,
        400n
      );
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC20)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("not enough token amount", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID, mockDestinationBlockchainID, submitted20 } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC20 = await destinationBridge.encodeUnlockOriginTokensData(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted20.address,
        ad2.address,
        2_000_000_000_000_000_000n
      );
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC20)
      ).to.be.revertedWith(nxErrors.SourceBridge.wrongAmount);
    });
    it("wrong action type to unlock", async () => {
      const { sourceBridge, destinationBridge, ad1, mockDestinationBlockchainID, nativeTokenAddress } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      const fakeEncodeData = await sourceBridge.encodeMintWrappedTokenData(nativeTokenAddress, ad1.address, 200n);
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, fakeEncodeData)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
  });
  describe("Fail case - Unlock bridge ERC721 token", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID, submitted721 } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC721 = await destinationBridge.encodeUnlockERC721Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted721.address,
        ad2.address,
        [1]
      );
      await expect(
        sourceBridge.receiveMessage(mockSourceBlockchainID, destinationBridge.address, encodeDataERC721)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong bridge address", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        submitted721,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC721 = await destinationBridge.encodeUnlockERC721Data(
        mockSourceBlockchainID,
        destinationBridge.address,
        submitted721.address,
        ad2.address,
        [1]
      );
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC721)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong token id", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        submitted721,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC721 = await destinationBridge.encodeUnlockERC721Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted721.address,
        ad2.address,
        [1]
      );
      await sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC721);
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC721)
      ).to.be.revertedWith(nxErrors.SourceBridge.wrongAmount);
    });
  });
  describe("Fail case - Unlock bridge ERC1155 token", async () => {
    it("wrong blockchainID", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID, submitted1155 } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC1155 = await destinationBridge.encodeUnlockERC1155Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted1155.address,
        ad2.address,
        [1],
        [5]
      );
      await expect(
        sourceBridge.receiveMessage(mockSourceBlockchainID, destinationBridge.address, encodeDataERC1155)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("wrong bridge address", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC1155 = await destinationBridge.encodeUnlockERC1155Data(
        mockSourceBlockchainID,
        destinationBridge.address,
        submitted1155.address,
        ad2.address,
        [1],
        [5]
      );
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC1155)
      ).to.be.revertedWith(nxErrors.SourceBridge.invalidRequest);
    });
    it("not enough token amount", async () => {
      const {
        sourceBridge,
        destinationBridge,
        ad2,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        submitted1155,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      const encodeDataERC1155 = await destinationBridge.encodeUnlockERC1155Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted1155.address,
        ad2.address,
        [1],
        [200]
      );
      await expect(
        sourceBridge.receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeDataERC1155)
      ).to.be.revertedWith(nxErrors.SourceBridge.wrongAmount);
    });
  });
  describe("Fail case - create bridge token contract", async () => {
    it("already exist erc20 contract", async () => {
      const { sourceBridge, destinationBridge, mockSourceBlockchainID, nativeTokenAddress } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const encodeDataNa = await sourceBridge.encodeCreateBridgeTokenData(nativeTokenAddress, "TEST", "TEST", 18);
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataNa)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
    it("already exist erc721 contract", async () => {
      const { sourceBridge, destinationBridge, mockSourceBlockchainID, submitted721 } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const encodeDataNa = await sourceBridge.encodeCreateBridgeERC721Data(
        submitted721.address,
        "TEST",
        "TEST",
        "http://mock.test.io/erc721/"
      );
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataNa)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
    it("already exist erc1155 contract", async () => {
      const { sourceBridge, destinationBridge, mockSourceBlockchainID, submitted1155 } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const encodeDataNa = await sourceBridge.encodeCreateBridgeERC1155Data(
        submitted1155.address,
        "http://mock.test.io/erc1155/"
      );
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataNa)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
    it("wrong type value contract", async () => {
      const { sourceBridge, destinationBridge, ad1, mockSourceBlockchainID, nativeTokenAddress } = await loadFixture(
        deployFixture
      );
      await loadFixture(submitFixture);
      const fakeEncodeData = await destinationBridge.encodeUnlockERC721Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        nativeTokenAddress,
        ad1.address,
        [1]
      );
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, fakeEncodeData)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidRequest);
    });
  });
  describe("Fail case - mint bridge token", async () => {
    it("not exist token contract", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC20 } = await loadFixture(submitFixture);
      const encodeDataERC20 = await sourceBridge.encodeMintWrappedTokenData(wERC20.address, ad2.address, 100n);
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataERC20)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
  });
  describe("Fail case - mint bridge ERC721 token", async () => {
    it("not exist token contract", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC721 } = await loadFixture(submitFixture);
      const encodeDataERC721 = await sourceBridge.encodeMintERC721Data(wERC721.address, ad2.address, [5]);
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataERC721)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
  });
  describe("Fail case - mint bridge ERC1155 token", async () => {
    it("not exist token contract", async () => {
      const { sourceBridge, destinationBridge, ad2, mockSourceBlockchainID } = await loadFixture(deployFixture);
      const { wERC1155 } = await loadFixture(submitFixture);
      const encodeDataERC1155 = await sourceBridge.encodeMintERC1155Data(wERC1155.address, ad2.address, [5], [10]);
      await expect(
        destinationBridge.receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeDataERC1155)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
  });
  describe("Fail case - Set / Get functions", async () => {
    it("set teller - not owner", async () => {
      const { sourceBridge, ad1 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      await expect(sourceBridge.connect(ad1).setTeller(ad1.address)).to.be.revertedWith(nxErrors.Ownable.notOwner);
    });
    it("set init owner - not owner", async () => {
      const { destinationBridge, ad1 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      await expect(destinationBridge.connect(ad1).setInitOwner(ad1.address)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
    });
    it("set init owner - zero address", async () => {
      const { destinationBridge, manager } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      await expect(destinationBridge.connect(manager).setInitOwner(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.DestinationBridge.invalidAddress
      );
    });
    it("set relayer - not owner", async () => {
      const { sourceBridge, destinationBridge, manager, ad1 } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      expect((await sourceBridge.getAllowedRelayerAddresses()).length).to.equal(0);
      expect((await destinationBridge.getAllowedRelayerAddresses()).length).to.equal(0);

      await sourceBridge.connect(manager).addAllowedRelayer(manager.address);
      expect((await sourceBridge.getAllowedRelayerAddresses()).length).to.equal(1);
      await expect(sourceBridge.connect(ad1).addAllowedRelayer(ad1.address)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await destinationBridge.connect(manager).addAllowedRelayer(manager.address);
      expect((await destinationBridge.getAllowedRelayerAddresses()).length).to.equal(1);
      await expect(destinationBridge.connect(ad1).addAllowedRelayer(ad1.address)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );

      await expect(sourceBridge.connect(ad1).clearAllowedRelayer()).to.be.revertedWith(nxErrors.Ownable.notOwner);
      await sourceBridge.connect(manager).clearAllowedRelayer();
      expect((await sourceBridge.getAllowedRelayerAddresses()).length).to.equal(0);
      await expect(destinationBridge.connect(ad1).clearAllowedRelayer()).to.be.revertedWith(nxErrors.Ownable.notOwner);
      await destinationBridge.connect(manager).clearAllowedRelayer();
      expect((await destinationBridge.getAllowedRelayerAddresses()).length).to.equal(0);
    });
    it("set relayer - zero address", async () => {
      const { sourceBridge, destinationBridge, manager } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);

      await expect(sourceBridge.connect(manager).addAllowedRelayer(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.SourceBridge.invalidAddress
      );
      await expect(
        destinationBridge.connect(manager).addAllowedRelayer(ethers.constants.AddressZero)
      ).to.be.revertedWith(nxErrors.DestinationBridge.invalidAddress);
    });
  });
  describe("bridge token contract", async () => {
    it("Happy case - retrieve ", async () => {
      const { initOwner, ad2 } = await loadFixture(deployFixture);
      const { wERC20, wERC721, wERC1155 } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      expect(await wERC20.balanceOf(initOwner.address)).to.equal(0);
      await wERC20.connect(initOwner).retrieve(ad2.address, initOwner.address, 200n, "test");
      expect(await wERC20.balanceOf(initOwner.address)).to.equal(200n);

      expect(await wERC721.ownerOf(3)).to.equal(ad2.address);
      await wERC721.connect(initOwner).retrieve(ad2.address, initOwner.address, 3, "test");
      expect(await wERC721.ownerOf(3)).to.equal(initOwner.address);

      expect(await wERC1155.balanceOf(initOwner.address, 1)).to.equal(0);
      await wERC1155.connect(initOwner).retrieve(ad2.address, initOwner.address, 1, 2, "test");
      expect(await wERC1155.balanceOf(initOwner.address, 1)).to.equal(2);
      await wERC1155.connect(initOwner).retrieveBatch(ad2.address, initOwner.address, [2, 3], [1, 1], "test");
      expect(await wERC1155.balanceOf(initOwner.address, 2)).to.equal(1);
      expect(await wERC1155.balanceOf(initOwner.address, 3)).to.equal(1);
    });
    it("Happy case - Set / Get functions ", async () => {
      const { destinationBridge, initOwner } = await loadFixture(deployFixture);
      const { wERC20, wERC721, wERC1155 } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      expect(await wERC20.name()).to.equal("SUBMIT20");
      expect(await wERC20.symbol()).to.equal("SBT20");
      expect(await wERC20.decimals()).to.equal(18);
      expect(await wERC20.getBridgeContract()).to.equal(destinationBridge.address);
      await wERC20.connect(initOwner).setBridgeContract(ethers.constants.AddressZero);
      expect(await wERC20.getBridgeContract()).to.equal(ethers.constants.AddressZero);

      expect(await wERC721.name()).to.equal("SUBMIT721");
      expect(await wERC721.symbol()).to.equal("SBT721");
      expect(await wERC721.tokenURI(1)).to.equal("http://mock.test.io/erc721/1.json");
      expect(await wERC721.getBridgeContract()).to.equal(destinationBridge.address);
      await wERC721.connect(initOwner).setBridgeContract(ethers.constants.AddressZero);
      expect(await wERC721.getBridgeContract()).to.equal(ethers.constants.AddressZero);

      expect(await wERC1155.uri(1)).to.equal("http://mock.test.io/erc1155/1.json");
      await wERC1155.connect(initOwner).setTokenURI("http://mock.test.io/test/", 1);
      expect(await wERC1155.uri(1)).to.equal("http://mock.test.io/test/1.json");
      await wERC1155.connect(initOwner).setDefaultURI("http://mock.test.io/test/");
      expect(await wERC1155.getBridgeContract()).to.equal(destinationBridge.address);
      await wERC1155.connect(initOwner).setBridgeContract(ethers.constants.AddressZero);
      expect(await wERC1155.getBridgeContract()).to.equal(ethers.constants.AddressZero);
    });
    it("Fail case - initialize", async () => {
      const { initOwner, ad1 } = await loadFixture(deployFixture);
      const { wERC20, wERC721, wERC1155 } = await loadFixture(submitFixture);

      await expect(wERC20.connect(initOwner).initialize("dummy", "DMY", "9", ad1.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
      await expect(
        wERC721.connect(initOwner).initialize("dummy", "DMY", "http://mock.source.io/721/", ad1.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
      await expect(
        wERC1155.connect(initOwner).initialize("http://mock.source.io/1155/", ad1.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("Fail case - unauthorized ", async () => {
      const { ad1, ad2 } = await loadFixture(deployFixture);
      const { wERC20, wERC721, wERC1155 } = await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      await expect(wERC20.connect(ad2).mint(ad1.address, 200n)).to.be.revertedWith(nxErrors.unauthorized);
      await expect(wERC20.connect(ad2).retrieve(ad2.address, ad1.address, 200n, "test")).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(wERC20.connect(ad2).setBridgeContract(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(wERC20.connect(ad2).burnFrom(ad1.address, 200n)).to.be.revertedWith(nxErrors.unauthorized);

      await expect(wERC721.connect(ad2).mintBatch(ad1.address, [1, 2, 3])).to.be.revertedWith(nxErrors.unauthorized);
      await expect(wERC721.connect(ad2).retrieve(ad2.address, ad1.address, 1, "test")).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(wERC721.connect(ad2).setBridgeContract(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(wERC721.connect(ad2).burnBatch([1, 2])).to.be.revertedWith(nxErrors.unauthorized);

      await expect(wERC1155.connect(ad2).mintBatch(ad1.address, [1, 2, 3], [10, 10, 10], "0x00")).to.be.revertedWith(
        nxErrors.unauthorized
      );
      await expect(wERC1155.connect(ad2).retrieve(ad2.address, ad1.address, 1, 10, "test")).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(
        wERC1155.connect(ad2).retrieveBatch(ad2.address, ad1.address, [1, 2], [10, 10], "test")
      ).to.be.revertedWith(nxErrors.Ownable.notOwner);
      await expect(wERC1155.connect(ad2).setBridgeContract(ethers.constants.AddressZero)).to.be.revertedWith(
        nxErrors.Ownable.notOwner
      );
      await expect(wERC1155.connect(ad2).burnBatch(ad1.address, [1, 2], [10, 10])).to.be.revertedWith(
        nxErrors.unauthorized
      );
      await expect(wERC1155.connect(ad2).setDefaultURI("http://mock.test.io/test")).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
      await expect(wERC1155.connect(ad2).setTokenURI("http://mock.test.io/test", 1)).to.be.revertedWith(
        nxErrors.NextOwnable.executorForbidden
      );
    });
  });
  describe("Reentrant attack", async () => {
    it("Destination chain", async () => {
      const { destinationBridge, sourceBridge, mockSourceBlockchainID, manager, submitted1155, reentrantAttack } =
        await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);

      await reentrantAttack.setTokenType_(1);
      const encodeData = sourceBridge.encodeMintERC1155Data(submitted1155.address, reentrantAttack.address, [6], [2]);

      await expect(
        destinationBridge.connect(manager).receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(2);
      await expect(
        destinationBridge.connect(manager).receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(3);
      await expect(
        destinationBridge.connect(manager).receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(4);
      await expect(
        destinationBridge.connect(manager).receiveMessage(mockSourceBlockchainID, sourceBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });
    it("Source chain", async () => {
      const {
        destinationBridge,
        sourceBridge,
        mockSourceBlockchainID,
        mockDestinationBlockchainID,
        manager,
        submitted1155,
        reentrantAttack,
      } = await loadFixture(deployFixture);
      await loadFixture(submitFixture);
      await loadFixture(bridgeFixture);
      await reentrantAttack.setTokenType_(1);
      const encodeData = destinationBridge.encodeUnlockERC1155Data(
        mockSourceBlockchainID,
        sourceBridge.address,
        submitted1155.address,
        reentrantAttack.address,
        [1],
        [2]
      );

      await expect(
        sourceBridge.connect(manager).receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(2);
      await expect(
        sourceBridge.connect(manager).receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(3);
      await expect(
        sourceBridge.connect(manager).receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(4);
      await expect(
        sourceBridge.connect(manager).receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");

      await reentrantAttack.setTokenType_(5);
      await expect(
        sourceBridge.connect(manager).receiveMessage(mockDestinationBlockchainID, destinationBridge.address, encodeData)
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });
  });
});
