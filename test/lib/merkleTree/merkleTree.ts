import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { BytesLike } from "ethers";

export type MerkleInput = Array<bigint | BytesLike>;
export type MerkleProof = Array<BytesLike>;
export type MerkleTree = {
  input: Array<MerkleInput>;
  leaf: Array<BytesLike>;
  proof: Array<MerkleProof>;
  merkleRoot: BytesLike;
  length: bigint;
};

const createTree = (input: Array<MerkleInput>, leafType: Array<string>) => {
  const tree = StandardMerkleTree.of(input, leafType);

  return {
    input,
    leaf: input.map((e) => tree.leafHash(e)),
    proof: input.map((_, i) => tree.getProof(i)),
    merkleRoot: tree.root,
    length: BigInt(input.length),
  };
};

export const createBasket = (round: bigint, slot: Array<bigint>): MerkleTree => {
  const input = slot.map((e, i) => [round, BigInt(i), e]);
  const basketLeafType = ["uint256", "uint64", "uint256"];

  return createTree(input, basketLeafType);
};

export const createReward = (round: bigint, users: Array<BytesLike>, amounts: Array<bigint>): MerkleTree => {
  if (users.length !== amounts.length) {
    throw Error();
  }

  const input = users.map((e, i) => [round, e, amounts[i]]);
  const rewardLeafType = ["uint256", "address", "uint256"];

  return createTree(input, rewardLeafType);
};

export const createClaimTree = (users: Array<BytesLike>, amounts: Array<bigint>): MerkleTree => {
  if (users.length !== amounts.length) {
    throw Error();
  }

  const input = users.map((e, i) => [e, amounts[i]]);
  const rewardLeafType = ["address", "uint256"];

  return createTree(input, rewardLeafType);
};
