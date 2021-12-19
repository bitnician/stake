// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/* solhint-disable not-rely-on-time */
contract StakingRewards is ERC20PresetMinterPauser {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public immutable startTime;
    IERC20 public rewardToken;
    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public rewardsDuration;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    bytes32 public constant REWARD_DISTRIBUTION_ROLE =
        keccak256("REWARD_DISTRIBUTION_ROLE");

    constructor(
        uint256 _startTime,
        uint256 _rewardsDuration,
        address _rewardToken,
        address _rewardsDistribution,
        address _minter,
        string memory _name,
        string memory _symbol
    ) ERC20PresetMinterPauser(_name, _symbol) {
        require(_startTime >= block.timestamp, "Invalid start time");
        require(_rewardsDuration > 0, "Invalid reward duration");
        require(_rewardToken != address(0), "Invalid reward token");
        require(
            _rewardsDistribution != address(0),
            "Invalid rewards distribution"
        );

        startTime = _startTime;
        rewardsDuration = _rewardsDuration;
        rewardToken = IERC20(_rewardToken);

        _setupRole(MINTER_ROLE, _minter);
        _setupRole(REWARD_DISTRIBUTION_ROLE, _rewardsDistribution);
    }

    /* ========== VIEWS ========== */

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable()
                    .sub(lastUpdateTime)
                    .mul(rewardRate)
                    .mul(1e18)
                    .div(totalSupply())
            );
    }

    function earned(address account) public view returns (uint256) {
        return
            balanceOf(account)
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[account]))
                .div(1e18)
                .add(rewards[account]);
    }

    function getRewardForDuration() external view returns (uint256) {
        return rewardRate.mul(rewardsDuration);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    function mint(address to, uint256 amount)
        public
        virtual
        override
        updateReward(to)
        onlyRole(MINTER_ROLE)
    {
        require(
            hasRole(MINTER_ROLE, _msgSender()),
            "Access: minter role needed"
        );

        require(amount > 0, "Cannot mint 0");

        _mint(to, amount);
        emit Minted(to, amount);
    }

    function burn(uint256 amount) public override updateReward(msg.sender) {
        require(amount > 0, "0 amount provided");

        super.burn(amount);

        emit Burned(msg.sender, amount);
    }

    function getReward() public updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function claim() external checkTimespan {
        burn(balanceOf(msg.sender));
        getReward();
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function notifyRewardAmount(uint256 reward)
        external
        onlyRole(REWARD_DISTRIBUTION_ROLE)
        updateReward(address(0))
    {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(rewardsDuration);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(rewardsDuration);
        }

        // Ensure the provided reward amount is not more than the balance in the contract.
        // This keeps the reward rate in the right range, preventing overflows due to
        // very high values of rewardRate in the earned and rewardsPerToken functions;
        // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
        uint256 balance = rewardToken.balanceOf(address(this));
        require(
            rewardRate <= balance.div(rewardsDuration),
            "Provided reward too high"
        );

        lastUpdateTime = block.timestamp;
        if (periodFinish == 0)
            periodFinish = block.timestamp.add(rewardsDuration);

        emit RewardAdded(reward);
    }

    function setRewardsDuration(uint256 _rewardsDuration)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            block.timestamp > periodFinish,
            "Previous rewards period must be complete before changing the duration for the new period"
        );
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(rewardsDuration);
    }

    /* ========== MODIFIERS ========== */

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();

        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    modifier checkTimespan() {
        require(block.timestamp >= startTime, "Not started"); // solhint-disable-line not-rely-on-time
        _;
    }

    /* ========== EVENTS ========== */

    event Minted(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event Burned(address indexed user, uint256 amount);
    event RewardAdded(uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
}
