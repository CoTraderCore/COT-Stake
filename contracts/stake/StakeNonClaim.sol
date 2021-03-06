pragma solidity ^0.6.2;

import "../openzeppelin-contracts/contracts/math/Math.sol";
import "../openzeppelin-contracts/contracts/math/SafeMath.sol";
import "../openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import "../openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";


contract Owned {
    address public owner;
    address public nominatedOwner;

    constructor(address _owner) public {
        require(_owner != address(0), "Owner address cannot be 0");
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    function nominateNewOwner(address _owner) external onlyOwner {
        nominatedOwner = _owner;
        emit OwnerNominated(_owner);
    }

    function acceptOwnership() external {
        require(msg.sender == nominatedOwner, "You must be nominated before you can accept ownership");
        emit OwnerChanged(owner, nominatedOwner);
        owner = nominatedOwner;
        nominatedOwner = address(0);
    }

    modifier onlyOwner {
        require(msg.sender == owner, "Only the contract owner may perform this action");
        _;
    }

    event OwnerNominated(address newOwner);
    event OwnerChanged(address oldOwner, address newOwner);
}

abstract contract RewardsDistributionRecipient is Owned {
    address public rewardsDistribution;

    function notifyRewardAmount(uint256 reward) virtual external;

    modifier onlyRewardsDistribution() {
        require(msg.sender == rewardsDistribution, "Caller is not RewardsDistribution contract");
        _;
    }

    function setRewardsDistribution(address _rewardsDistribution) external onlyOwner {
        rewardsDistribution = _rewardsDistribution;
    }
}


contract TokenWrapper is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public stakingToken;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    constructor(address _stakingToken) public {
        stakingToken = IERC20(_stakingToken);
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function stakePool(uint256 amount) internal nonReentrant {
        _totalSupply = _totalSupply.add(amount);
        _balances[msg.sender] = _balances[msg.sender].add(amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function stakePoolFor(uint256 amount, address forAddress) internal nonReentrant {
        _totalSupply = _totalSupply.add(amount);
        _balances[forAddress] = _balances[forAddress].add(amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawPool(uint256 amount) internal nonReentrant {
        _totalSupply = _totalSupply.sub(amount);
        _balances[msg.sender] = _balances[msg.sender].sub(amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }
}


contract StakeNonClaim is TokenWrapper, RewardsDistributionRecipient {
    IERC20 public rewardsToken;

    uint256 public DURATION;
    uint256 public END_STAKE;

    uint256 public periodFinish = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);

    constructor(
        address _owner,
        address _rewardsToken,
        address _stakingToken,
        uint256 _DURATION
    ) public TokenWrapper(_stakingToken) Owned(_owner) {
        rewardsToken = IERC20(_rewardsToken);
        DURATION = _DURATION;
        END_STAKE = now + _DURATION;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return Math.min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored.add(
                lastTimeRewardApplicable().sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(totalSupply())
            );
    }

    function earned(address account) public view returns (uint256) {
        return balanceOf(account).mul(rewardPerToken().sub(userRewardPerTokenPaid[account])).div(1e18).add(rewards[account]);
    }

    function earnedByShare(uint256 share) public view returns (uint256) {
        return share.mul(rewardPerToken()).div(1e18);
    }

    function stake(uint256 amount) public updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        super.stakePool(amount);
        emit Staked(msg.sender, amount);
    }

    function stakeFor(uint256 amount, address forAddress) public updateReward(forAddress) {
        require(amount > 0, "Cannot stake 0");
        super.stakePoolFor(amount, forAddress);
        emit Staked(forAddress, amount);
    }

    // allow withdraw in any time, but without rewards
    function withdraw(uint256 amount) public updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(balanceOf(msg.sender) >= amount, "Input more than balance");
        super.withdrawPool(amount);
        emit Withdrawn(msg.sender, amount);
    }

    // allow withdarw with rewards
    function exit() external {
        require(now >= END_STAKE, "Stake not finished");
        uint256 userShares = balanceOf(msg.sender);
        require(userShares > 0, "Empty shares");
        withdraw(userShares);
        getReward();
    }

    // NOT Allow claim
    function getReward() private updateReward(msg.sender) {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function notifyRewardAmount(uint256 reward) override external onlyRewardsDistribution updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward.div(DURATION);
        } else {
            uint256 remaining = periodFinish.sub(block.timestamp);
            uint256 leftover = remaining.mul(rewardRate);
            rewardRate = reward.add(leftover).div(DURATION);
        }
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp.add(DURATION);
        emit RewardAdded(reward);
    }

    // for case if rewards stuck rewards distribution can move rewards to new contract 
    function inCaseRewardsStuck() external onlyRewardsDistribution {
      rewardsToken.transfer(rewardsDistribution, rewardsToken.balanceOf(address(this)));
    }
}
