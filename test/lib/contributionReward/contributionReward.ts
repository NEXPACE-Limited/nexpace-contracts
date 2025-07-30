import * as fs from "fs";

const parseFile = (filename: string) => {
  try {
    const file = fs
      .readFileSync(`./${filename}.csv`)
      .toString()
      .split(`\n`)
      .filter((e) => e !== "")
      .filter((e) => e !== "\r")
      .map((l) => {
        return l
          .replace("\r", "")
          .toLowerCase()
          .split(",")
          .map((e, i) => {
            return i > 0 ? +e : e;
          });
      });

    return file;
  } catch (error) {
    console.log(error);
    throw new Error("Error reading files");
  }
};

export const contributionReward = () => {
  const file = parseFile("test/lib/contributionReward/contributionReward");
  return file;
};
