/* eslint-disable no-process-exit */
import hre, { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { getSigner } from "./utils/getSigner";
import { StakingRewards } from "../typechain-types";
// eslint-disable-next-line node/no-extraneous-import
import { BigNumber } from "ethers";

async function main() {
  const signer = await getSigner(hre);
  const provider = ethers.provider;
  const currentBlock = await provider.getBlock("latest");

  const rewardsDuration = 60 * 60 * 24 * 60; // 60 days

  const stakingRewardsParams = {
    startTime: BigNumber.from(currentBlock.timestamp).add(86400).toString(),
    rewardsDuration: rewardsDuration,
    rewardToken: "0x53dD53dAf8F112BcA64332eA97398EfbC8a0E234",
    rewardsDistribution: "0x53dD53dAf8F112BcA64332eA97398EfbC8a0E234",
    minter: "0x53dD53dAf8F112BcA64332eA97398EfbC8a0E234",
    name: "pool-token",
    symbol: "PPT",
  };

  // staking rewards contract
  const StakingRewards = await ethers.getContractFactory("StakingRewards");
  const stakingRewards = (await StakingRewards.deploy(
    stakingRewardsParams.startTime,
    stakingRewardsParams.rewardsDuration,
    stakingRewardsParams.rewardToken,
    stakingRewardsParams.rewardsDistribution,
    stakingRewardsParams.minter,
    stakingRewardsParams.name,
    stakingRewardsParams.symbol,
    { gasLimit: 5000000 }
  )) as StakingRewards;

  console.log("Deployer: ", await signer.getAddress());
  console.log("🚧 StakingRewards deployed to:", stakingRewards.address);
  console.log(
    "✅ npx hardhat verify --network",
    hre.network.name,
    stakingRewards.address,
    ...Object.values(stakingRewardsParams)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
