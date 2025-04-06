import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { IMockFake } from "../../typechain-types";
import { deployWarp, deployTeleporter } from "../Bridge/lib";

describe("meta-transaction fake coverage", function () {
  async function deployFixture() {
    const TeleporterRegistry = await ethers.getContractFactory("TeleporterRegistry");
    await deployWarp();
    await deployTeleporter();
    const initialize = {
      version: "1",
      protocolAddress: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf",
    };
    const teleporterRegistry = await TeleporterRegistry.deploy([initialize]);

    return {
      teleporterRegistry,
    };
  }

  it("this test is for faking coverage of unused trivial override functions", async function () {
    const { teleporterRegistry } = await loadFixture(deployFixture);
    const signers = await ethers.getSigners();
    await Promise.all(
      ["DestinationBridge", "SourceBridge"].map(async (n, i) => {
        const factory = await ethers.getContractFactory(`Mock${n}MetaTransactionFakeCoverage`, signers[i]);
        const fake = (await factory.deploy(teleporterRegistry.address)) as IMockFake;
        await fake.fake();
      })
    );
  });
  it("this test is for faking coverage of unused trivial override functions", async function () {
    const signers = await ethers.getSigners();
    await Promise.all(
      ["ERC20BridgeToken", "ERC721BridgeToken", "ERC1155BridgeToken", "Teller"].map(async (n, i) => {
        const factory = await ethers.getContractFactory(`Mock${n}MetaTransactionFakeCoverage`, signers[i]);
        const fake = (await factory.deploy()) as IMockFake;
        await fake.fake();
      })
    );
  });
});
