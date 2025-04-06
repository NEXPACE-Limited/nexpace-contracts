import { ethers } from "hardhat";

async function deploy() {
  const NXPCVaultAddress = ethers.constants.AddressZero;

  const NXPC = await ethers.getContractFactory("NXPC");
  const nxpc = await NXPC.deploy(NXPCVaultAddress);

  await nxpc.deployed();

  console.log(`CA: ${nxpc.address}`);
}

deploy().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
