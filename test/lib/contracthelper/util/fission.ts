import { BigNumber, BigNumberish } from "ethers";
import { parseEther } from "ethers/lib/utils";

const billion = parseEther("1000000000");

export const expectAmount = (amount: BigNumberish, poolAmount: BigNumberish): BigNumber =>
  billion.mul(amount).div(poolAmount);
