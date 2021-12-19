// eslint-disable-next-line node/no-extraneous-import
import { Provider } from "@ethersproject/providers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { StakingRewards, MockToken } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expandTo18Decimals, mineBlock } from "./utils";
import { BigNumber } from "ethers";

describe("Staking Rewards", function () {
  let stakingRewards: StakingRewards;
  let rewardToken: MockToken;
  let owner: SignerWithAddress;
  let rewardsDistribution: SignerWithAddress;
  let minter: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let provider: Provider;

  const rewardsDuration = 60 * 60 * 24 * 60; // 60 days
  const reward = expandTo18Decimals(100);
  const minterRole = ethers.utils.id("MINTER_ROLE");
  const rewardDistributionRole = ethers.utils.id("REWARD_DISTRIBUTION_ROLE");

  before(async () => {
    provider = ethers.provider;

    [owner, staker1, staker2, rewardsDistribution, minter] =
      await ethers.getSigners();

    // reward token contract
    const RewardToken = await ethers.getContractFactory("MockToken");
    rewardToken = (await RewardToken.connect(rewardsDistribution).deploy(
      "Reward Token",
      "RTOK"
    )) as MockToken;
  });

  beforeEach(async () => {
    const currentBlock = await provider.getBlock("latest");

    const stakingRewardsParams = {
      startTime: BigNumber.from(currentBlock.timestamp).add(86400), // 1 day from now
      rewardsDuration: rewardsDuration,
      rewardToken: rewardToken.address,
      rewardsDistribution: rewardsDistribution.address,
      minter: minter.address,
      name: "Pool token",
      symbol: "PPT",
    };

    // staking rewards contract
    const StakingRewards = await ethers.getContractFactory("StakingRewards");
    stakingRewards = (await StakingRewards.deploy(
      stakingRewardsParams.startTime,
      stakingRewardsParams.rewardsDuration,
      stakingRewardsParams.rewardToken,
      stakingRewardsParams.rewardsDistribution,
      stakingRewardsParams.minter,
      stakingRewardsParams.name,
      stakingRewardsParams.symbol
    )) as StakingRewards;
  });

  describe("Function permissions", () => {
    it("only rewardsDistribution address can call notifyRewardAmount", async () => {
      // success
      await expect(
        stakingRewards.connect(rewardsDistribution).notifyRewardAmount(1)
      )
        .to.emit(stakingRewards, "RewardAdded")
        .withArgs(1);

      const lastUpdatedBlock = await stakingRewards.lastUpdateTime();
      expect(await stakingRewards.periodFinish()).to.be.eq(
        lastUpdatedBlock.add(rewardsDuration)
      );

      // error
      await expect(
        stakingRewards.connect(staker1).notifyRewardAmount(1)
      ).revertedWith(
        `AccessControl: account ${staker1.address.toLowerCase()} is missing role ${rewardDistributionRole}`
      );
    });

    it("prevents staker to claim before start time", async () => {
      // error
      await expect(stakingRewards.connect(staker1).claim()).revertedWith(
        `Not started`
      );
    });

    it("only minter address can call mint", async () => {
      // success
      await expect(() =>
        stakingRewards.connect(minter).mint(owner.address, 1)
      ).to.changeTokenBalance(stakingRewards, owner, 1);

      // error
      await expect(
        stakingRewards.connect(staker1).mint(owner.address, 1)
      ).revertedWith(
        `AccessControl: account ${staker1.address.toLowerCase()} is missing role ${minterRole}`
      );
    });
  });

  async function notifyRewardAmount(
    reward: BigNumber
  ): Promise<{ startTime: BigNumber; endTime: BigNumber }> {
    // send reward tokens
    await rewardToken
      .connect(rewardsDistribution)
      .transfer(stakingRewards.address, reward);

    // notifyRewardAmount
    await stakingRewards
      .connect(rewardsDistribution)
      .notifyRewardAmount(reward);

    const startTime: BigNumber = await stakingRewards.lastUpdateTime();
    const endTime: BigNumber = await stakingRewards.periodFinish();

    return { startTime, endTime };
  }

  describe("#notifyRewardAmount()", () => {
    it("it should add rewards to the contract", async () => {
      const { startTime: firstStartTime, endTime: firstEndTime } =
        await notifyRewardAmount(reward);

      expect(firstEndTime).to.be.eq(firstStartTime.add(rewardsDuration));

      // add reward for the second time
      const { endTime: secondEndTime } = await notifyRewardAmount(reward);

      expect(secondEndTime).to.be.eq(firstEndTime);
    });
  });

  describe("earned()", () => {
    it("should be 0 when not staking", async () => {
      expect(await stakingRewards.earned(staker1.address)).to.be.eq(0);
    });

    it("should be > 0 when staking", async () => {
      const { startTime, endTime } = await notifyRewardAmount(reward);

      // mint ppt to the staker1
      const stakeAmount = expandTo18Decimals(2);
      await stakingRewards.connect(minter).mint(staker1.address, stakeAmount);

      // fast-forward ~1/3 through the reward window
      await mineBlock(startTime.add(endTime.sub(startTime).div(3)).toNumber());

      const staker1Earned = await stakingRewards.earned(staker1.address);

      expect(staker1Earned).to.be.gt(BigNumber.from(0));
    });

    it("should calculate the earned for multiple staker", async () => {
      const { startTime, endTime } = await notifyRewardAmount(reward);

      // mint ppt to the staker1
      const stakeAmount = expandTo18Decimals(2);
      await stakingRewards.connect(minter).mint(staker1.address, stakeAmount);

      // fast-forward ~1/3 through the reward window
      await mineBlock(startTime.add(endTime.sub(startTime).div(3)).toNumber());

      let staker1Earned = await stakingRewards.earned(staker1.address);

      // eslint-disable-next-line no-unused-expressions
      expect(reward.div(3).sub(staker1Earned).lte(reward.div(3).div(10000))).to
        .be.true;

      // mint ppt to the staker2
      await stakingRewards.connect(minter).mint(staker2.address, stakeAmount);

      // fast-forward ~2/3 through the reward window
      const currentTime = BigNumber.from(
        (await provider.getBlock("latest")).timestamp
      );
      await mineBlock(
        currentTime.add(endTime.sub(startTime).div(3)).toNumber()
      );

      let staker2Earned = await stakingRewards.earned(staker2.address);
      staker1Earned = await stakingRewards.earned(staker1.address);

      // eslint-disable-next-line no-unused-expressions
      expect(reward.div(2).sub(staker1Earned).lte(reward.div(2).div(10000))); // 1/3 + (50% of 1/3)
      expect(reward.div(6).sub(staker2Earned).lte(reward.div(6).div(10000))); // 50% of 1/3

      // mint ppt to the staker3
      const staker3 = owner;
      await stakingRewards.connect(minter).mint(staker3.address, stakeAmount);

      // fast-forward past the reward window
      await mineBlock(endTime.add(1).toNumber());

      const staker3Earned = await stakingRewards.earned(staker3.address);
      staker2Earned = await stakingRewards.earned(staker2.address);
      staker1Earned = await stakingRewards.earned(staker1.address);

      // eslint-disable-next-line no-unused-expressions
      expect(
        reward
          .mul(11)
          .div(18)
          .sub(staker1Earned)
          .lte(reward.mul(11).div(18).div(10000))
      ); // 1/3 + (50% of 1/3) + (33% of 1/3)
      expect(
        reward
          .mul(5)
          .div(18)
          .sub(staker2Earned)
          .lte(reward.mul(5).div(18).div(10000))
      ); // ~33% of 1/3
      expect(reward.div(9).sub(staker3Earned).lte(reward.div(9).div(10000))); // ~33% of 1/3
    });
  });

  describe("#claim(): full", () => {
    it("should let staker1 to claim all pool tokens", async () => {
      const { endTime } = await notifyRewardAmount(reward);
      const stakeAmount = expandTo18Decimals(2);

      // mint ppt to the staker1
      await stakingRewards.connect(minter).mint(staker1.address, stakeAmount);
      const stakeStartTime: BigNumber = await stakingRewards.lastUpdateTime();

      // fast-forward past the reward window
      await mineBlock(endTime.add(1).toNumber());

      // claim
      const initialStakerRewardBalance = await rewardToken.balanceOf(
        staker1.address
      );
      await stakingRewards.connect(staker1).claim();
      const postStakerRewardBalance = await rewardToken.balanceOf(
        staker1.address
      );
      const rewardAmount = postStakerRewardBalance.sub(
        initialStakerRewardBalance
      );

      // eslint-disable-next-line no-unused-expressions
      expect(reward.sub(rewardAmount).lte(reward.div(10000))).to.be.true; // ensure result is within .01%
      expect(rewardAmount).to.be.eq(
        reward.div(rewardsDuration).mul(endTime.sub(stakeStartTime))
      );
    });
  });

  describe("#claim(): half", () => {
    it("should let staker1 to claim 50% of pool tokens", async () => {
      const { startTime, endTime } = await notifyRewardAmount(reward);
      const stakeAmount = expandTo18Decimals(2);

      // fast-forward ~halfway through the reward window
      await mineBlock(startTime.add(endTime.sub(startTime).div(2)).toNumber());

      // mint ppt to the staker1
      await stakingRewards.connect(minter).mint(staker1.address, stakeAmount);
      const stakeStartTime: BigNumber = await stakingRewards.lastUpdateTime();

      // fast-forward past the reward window
      await mineBlock(endTime.add(1).toNumber());

      const initialStakerRewardBalance = await rewardToken.balanceOf(
        staker1.address
      );

      // claim
      await stakingRewards.connect(staker1).claim();
      const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime();
      expect(stakeEndTime).to.be.eq(endTime);

      const postStakerRewardBalance = await rewardToken.balanceOf(
        staker1.address
      );
      const rewardAmount = postStakerRewardBalance.sub(
        initialStakerRewardBalance
      );

      expect(rewardAmount).to.be.eq(
        reward.div(rewardsDuration).mul(endTime.sub(stakeStartTime))
      );

      // eslint-disable-next-line no-unused-expressions
      expect(reward.div(2).sub(rewardAmount).lte(reward.div(2).div(10000))).to
        .be.true;
    }).retries(2);
  });

  describe("#claim(): two staker simultaneously", () => {
    it("should let staker1 claim 75% and let staker2 claim 25% of pool tokens", async () => {
      const { startTime, endTime } = await notifyRewardAmount(reward);
      const stakeAmount = expandTo18Decimals(2);
      const initialStaker1RewardBalance = await rewardToken.balanceOf(
        staker1.address
      );
      const initialStaker2RewardBalance = await rewardToken.balanceOf(
        staker2.address
      );

      // stake with staker1
      await stakingRewards.connect(minter).mint(staker1.address, stakeAmount);

      // fast-forward ~halfway through the reward window
      await mineBlock(startTime.add(endTime.sub(startTime).div(2)).toNumber());

      // mint ppt to the staker2
      await stakingRewards.connect(minter).mint(staker2.address, stakeAmount);

      // fast-forward past the reward window
      await mineBlock(endTime.add(1).toNumber());

      // claim
      await stakingRewards.connect(staker1).claim();
      await stakingRewards.connect(staker2).claim();

      const postStaker1RewardAmount = await rewardToken.balanceOf(
        staker1.address
      );
      const postStaker2RewardAmount = await rewardToken.balanceOf(
        staker2.address
      );
      const staker1Reward = postStaker1RewardAmount.sub(
        initialStaker1RewardBalance
      );
      const staker2Reward = postStaker2RewardAmount.sub(
        initialStaker2RewardBalance
      );
      const totalReward = staker1Reward.add(staker2Reward);

      // eslint-disable-next-line no-unused-expressions
      expect(reward.div(2).sub(totalReward).lte(reward.div(2).div(10000))).to.be
        .true;

      expect(
        totalReward
          .mul(3)
          .div(4)
          .sub(staker1Reward)
          .lte(totalReward.mul(3).div(4).div(10000))
      );
      expect(
        totalReward.div(4).sub(staker2Reward).lte(totalReward.div(4).div(10000))
      );
    });
  });
  describe("#claim(): two staker respectively", () => {
    it("should let staker1 claim 50% and let staker2 claim 50% of pool tokens", async () => {
      const { startTime, endTime } = await notifyRewardAmount(reward);
      const stakeAmount = expandTo18Decimals(2);
      const initialStaker1RewardBalance = await rewardToken.balanceOf(
        staker1.address
      );
      const initialStaker2RewardBalance = await rewardToken.balanceOf(
        staker2.address
      );

      // stake with staker1
      await stakingRewards.connect(minter).mint(staker1.address, stakeAmount);

      // fast-forward ~halfway through the reward window
      await mineBlock(startTime.add(endTime.sub(startTime).div(2)).toNumber());

      // claim
      await stakingRewards.connect(staker1).claim();

      const postStaker1RewardAmount = await rewardToken.balanceOf(
        staker1.address
      );
      const staker1Reward = postStaker1RewardAmount.sub(
        initialStaker1RewardBalance
      );

      // mint ppt to the staker2
      await stakingRewards.connect(minter).mint(staker2.address, stakeAmount);

      // fast-forward past the reward window
      await mineBlock(endTime.add(1).toNumber());

      await stakingRewards.connect(staker2).claim();

      const postStaker2RewardAmount = await rewardToken.balanceOf(
        staker2.address
      );
      const staker2Reward = postStaker2RewardAmount.sub(
        initialStaker2RewardBalance
      );

      expect(reward.div(2).sub(staker2Reward).lte(reward.div(2).div(10000)));
      expect(
        reward.sub(staker1Reward.add(staker2Reward)).lte(reward.div(10000))
      );
    });
  });

  // This is skipped on purpose. It is only here to
  // estimate gas for different functions
  // (to be used with REPORT_GAS=1)
  xit("GAS cost estimator", async () => {
    await notifyRewardAmount(reward);
  });
});
