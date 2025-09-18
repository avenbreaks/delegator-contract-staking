// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./System.sol";
import "./interfaces/ISlash.sol";

/**
 * @title Validators Contract - Final Optimized
 * @notice CLI Compatible without SafeMath (using Solidity 0.8+ built-in protection)
 * @dev Optimized for size < 24KB
 */
contract Validators is System {
    uint16 public constant MaxValidatorNum = 101;
    uint64 public constant StakingLockPeriod = 86400;
    uint64 public constant WithdrawRewardPeriod = 28800;
    uint256 public constant MinimalStakingCoin = 10000 ether;
    uint256 public constant ValidatorSlashAmount = 500 ether;
    uint256 public constant MinimalOfStaking = 1000 ether;

    enum Status {
        NotExist,
        Created,
        Staked,
        Unstake,
        Jailed
    }

    struct Description {
        string moniker;
        string website;
        string email;
        string details;
    }

    struct Validator {
        address payable rewardAddr;
        Status status;
        uint256 stakingAmount;
        Description description;
        uint256 rewardAmount;
        uint256 slashAmount;
        uint256 lastWithdrawRewardBlock;
        address[] stakers;
        uint256 commissionRate;
        uint256 delegatorRewardPool;
        uint256 accRewardPerStake;
        uint256 accSlashPerStake;
    }

    struct StakingInfo {
        uint256 amount;
        uint256 unstakeBlock;
        uint256 index;
    }

    struct DelegatorRewardInfo {
        uint256 rewardDebt;
        uint256 pendingRewards;
        uint256 lastClaimBlock;
    }

    mapping(address => Validator) public validatorInfo;
    mapping(address => mapping(address => StakingInfo)) public stakerInfo;
    address[] public validatorCandidateSet;
    address[] public validatorSet;
    uint256 public totalStaking;

    ISlash slash;
    
    uint256 distributedRewardNumber;
    uint256 updateValidatorNumber;
    
    mapping(address => bool) validatorCandidateExists;
    uint256 public constant DEFAULT_COMMISSION_RATE = 500;
    uint256 public constant MAX_COMMISSION_RATE = 1000;

    mapping(address => mapping(address => DelegatorRewardInfo)) public delegatorRewardInfo;
    uint256 private constant PRECISION_FACTOR = 1e18;

    event ValidatorCreated(address indexed validator, address indexed rewardAddr);
    event ValidatorUpdated(address indexed validator, address indexed rewardAddr);
    event ValidatorUnjailed(address indexed validator);
    event Unstake(address indexed staker, address indexed validator, uint256 amount, uint256 unLockHeight);
    event Staking(address indexed staker, address indexed validator, uint256 amount);
    event WithdrawStaking(address indexed staker, address indexed validator, uint256 amount);
    event WithdrawRewards(address indexed validator, address indexed rewardAddress, uint256 amount, uint256 nextWithdrawBlock);
    event RewardDistributed(address[] validators, uint256[] rewards, uint256 rewardCount);
    event ValidatorSlash(address indexed validator, uint256 amount);
    event ValidatorSetUpdated(address[] validators);
    event AddToValidatorCandidate(address indexed validator);
    event RemoveFromValidatorCandidate(address indexed validator);
    event DelegatorRewardsClaimed(address indexed delegator, address indexed validator, uint256 amount);

    modifier onlyNotRewarded() {
        require(block.number > distributedRewardNumber, "Already rewarded");
        _;
        distributedRewardNumber = block.number;
    }

    modifier onlyNotUpdated() {
        require(block.number > updateValidatorNumber, "Already updated");
        _;
        updateValidatorNumber = block.number;
    }

    function initialize(address[] calldata validators) external onlyNotInitialized {
        slash = ISlash(SlashContractAddr);
        admin = msg.sender;

        for (uint256 i = 0; i < validators.length; i++) {
            require(validators[i] != address(0), "Invalid addr");

            if (!isValidatorCandidate(validators[i])) {
                validatorCandidateSet.push(validators[i]);
                validatorCandidateExists[validators[i]] = true;
            }
            
            if (!isValidatorActivated(validators[i])) {
                validatorSet.push(validators[i]);
            }
            
            if (validatorInfo[validators[i]].rewardAddr == address(0)) {
                validatorInfo[validators[i]].rewardAddr = payable(validators[i]);
            }
            
            if (validatorInfo[validators[i]].status == Status.NotExist) {
                validatorInfo[validators[i]].status = Status.Staked;
            }

            if (validatorInfo[validators[i]].commissionRate == 0) {
                validatorInfo[validators[i]].commissionRate = DEFAULT_COMMISSION_RATE;
            }
        }

        initialized = true;
    }

    function create(
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details
    ) external payable onlyInitialized whenNotPaused returns (bool) {
        address payable validator = payable(msg.sender);
        require(validatorInfo[validator].status == Status.NotExist, "Already exist");
        
        uint256 stakingAmount = msg.value;
        _updateValidator(validator, rewardAddr, moniker, website, email, details);
        validatorInfo[validator].commissionRate = DEFAULT_COMMISSION_RATE;
        
        emit ValidatorCreated(validator, rewardAddr);
        
        if (stakingAmount > 0) {
            return _stake(validator, validator, stakingAmount);
        }
        
        return true;
    }

    function edit(
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details
    ) external onlyInitialized whenNotPaused returns (bool) {
        address payable validator = payable(msg.sender);
        require(validatorInfo[validator].status != Status.NotExist, "Not exist");
        
        _updateValidator(validator, rewardAddr, moniker, website, email, details);
        emit ValidatorUpdated(validator, rewardAddr);
        return true;
    }

    function stake(address validator) external payable onlyInitialized whenNotPaused returns (bool) {
        address payable staker = payable(msg.sender);
        uint256 stakingAmount = msg.value;
        return _stake(staker, validator, stakingAmount);
    }

    function _stake(address staker, address validator, uint256 stakingAmount) private returns (bool) {
        require(validatorInfo[validator].status != Status.NotExist, "Not exist");
        require(stakerInfo[staker][validator].unstakeBlock == 0, "Unstaking");
        require(stakingAmount >= MinimalOfStaking, "Min 1000 OXT");

        Validator storage valInfo = validatorInfo[validator];
        require(
            valInfo.stakingAmount + stakingAmount >= MinimalStakingCoin,
            "Min 10000 OXT"
        );

        _updateDelegatorRewards(staker, validator);

        if (stakerInfo[staker][validator].amount == 0) {
            stakerInfo[staker][validator].index = valInfo.stakers.length;
            valInfo.stakers.push(staker);
        }

        valInfo.stakingAmount = valInfo.stakingAmount + stakingAmount;
        if (valInfo.status != Status.Staked && valInfo.status != Status.Jailed) {
            valInfo.status = Status.Staked;
        }

        stakerInfo[staker][validator].amount = stakerInfo[staker][validator].amount + stakingAmount;
        totalStaking = totalStaking + stakingAmount;
        
        delegatorRewardInfo[staker][validator].rewardDebt = 
            (stakerInfo[staker][validator].amount * valInfo.accRewardPerStake) / PRECISION_FACTOR;
        
        emit Staking(staker, validator, stakingAmount);

        if (valInfo.status == Status.Staked) {
            addToValidatorCandidate(validator, valInfo.stakingAmount);
        }

        return true;
    }

    function unstake(address validator) external onlyInitialized whenNotPaused returns (bool) {
        address staker = msg.sender;
        require(validatorInfo[validator].status != Status.NotExist, "Not exist");

        _updateDelegatorRewards(staker, validator);

        StakingInfo storage stakingInfo = stakerInfo[staker][validator];
        Validator storage valInfo = validatorInfo[validator];
        uint256 unstakeAmount = stakingInfo.amount;

        require(stakingInfo.unstakeBlock == 0, "Already unstaking");
        require(unstakeAmount > 0, "No stake");
        require(
            !(validatorSet.length == 1 &&
                isValidatorActivated(validator) &&
                valInfo.stakingAmount - unstakeAmount < MinimalStakingCoin),
            "Last validator"
        );

        if (stakingInfo.index != valInfo.stakers.length - 1) {
            valInfo.stakers[stakingInfo.index] = valInfo.stakers[valInfo.stakers.length - 1];
            stakerInfo[valInfo.stakers[stakingInfo.index]][validator].index = stakingInfo.index;
        }
        valInfo.stakers.pop();

        valInfo.stakingAmount = valInfo.stakingAmount - unstakeAmount;
        stakingInfo.unstakeBlock = block.number;
        stakingInfo.index = 0;
        totalStaking = totalStaking - unstakeAmount;

        if (valInfo.stakingAmount < MinimalStakingCoin) {
            valInfo.status = Status.Unstake;
        }

        uint256 unLockHeight = block.number + StakingLockPeriod + 1;
        emit Unstake(staker, validator, unstakeAmount, unLockHeight);

        if (valInfo.status != Status.Staked) {
            removeFromValidatorCandidate(validator);
        }
        return true;
    }

    function unjailed() external onlyInitialized whenNotPaused returns (bool) {
        address validator = msg.sender;
        require(validatorInfo[validator].status == Status.Jailed, "Not jailed");
        require(slash.clean(validator), "Clean failed");

        if (validatorInfo[validator].stakingAmount >= MinimalStakingCoin) {
            validatorInfo[validator].status = Status.Staked;
            addToValidatorCandidate(validator, validatorInfo[validator].stakingAmount);
        } else {
            validatorInfo[validator].status = Status.Unstake;
        }

        emit ValidatorUnjailed(validator);
        return true;
    }

    function withdrawStaking(address validator) external returns (bool) {
        address payable staker = payable(msg.sender);
        StakingInfo storage stakingInfo = stakerInfo[staker][validator];
        
        require(validatorInfo[validator].status != Status.NotExist, "Not exist");
        require(stakingInfo.unstakeBlock != 0, "Unstake first");
        require(
            stakingInfo.unstakeBlock + StakingLockPeriod <= block.number,
            "Still locked"
        );
        require(stakingInfo.amount > 0, "No stake");

        uint256 staking = stakingInfo.amount;
        stakingInfo.amount = 0;
        stakingInfo.unstakeBlock = 0;

        staker.transfer(staking);
        emit WithdrawStaking(staker, validator, staking);
        return true;
    }

    function withdrawRewards(address validator) external returns (bool) {
        address payable rewardAddr = payable(msg.sender);
        
        require(validatorInfo[validator].status != Status.NotExist, "Not exist");
        require(
            validatorInfo[validator].rewardAddr == rewardAddr,
            "Not receiver"
        );
        require(
            validatorInfo[validator].lastWithdrawRewardBlock + WithdrawRewardPeriod <= block.number,
            "Wait period"
        );
        
        uint256 rewardAmount = validatorInfo[validator].rewardAmount;
        require(rewardAmount > 0, "No reward");

        validatorInfo[validator].rewardAmount = 0;
        validatorInfo[validator].lastWithdrawRewardBlock = block.number;

        if (rewardAmount > 0) {
            rewardAddr.transfer(rewardAmount);
        }
        
        uint256 nextWithdrawBlock = block.number + WithdrawRewardPeriod + 1;
        emit WithdrawRewards(validator, rewardAddr, rewardAmount, nextWithdrawBlock);
        return true;
    }

    function distributeBlockReward() external payable onlyCoinbase onlyNotRewarded onlyInitialized onlyBlockEpoch {
        uint256 amount = msg.value;
        if (amount > 0) {
            _distributeRewardToActivatedValidators(amount, address(0));
        }
    }

    function _distributeRewardToActivatedValidators(uint256 rewardAmount, address exceptAddress) private {
        if (rewardAmount == 0) return;

        uint256 totalRewardStaking = 0;
        uint256 rewardValidatorLen = 0;
        
        for (uint256 i = 0; i < validatorSet.length; i++) {
            if (validatorInfo[validatorSet[i]].status != Status.Jailed && validatorSet[i] != exceptAddress) {
                totalRewardStaking = totalRewardStaking + validatorInfo[validatorSet[i]].stakingAmount;
                rewardValidatorLen++;
            }
        }
        
        if (rewardValidatorLen == 0) return;

        address[] memory rewardValidators = new address[](rewardValidatorLen);
        uint256[] memory validatorRewardAmount = new uint256[](rewardValidatorLen);
        uint256 rewardCount = 0;
        uint256 distributedAmount = 0;
        
        for (uint256 i = 0; i < validatorSet.length; i++) {
            if (validatorInfo[validatorSet[i]].status != Status.Jailed && validatorSet[i] != exceptAddress) {
                uint256 reward;
                if (totalRewardStaking == 0) {
                    reward = rewardAmount / rewardValidatorLen;
                } else {
                    reward = (rewardAmount * validatorInfo[validatorSet[i]].stakingAmount) / totalRewardStaking;
                }
                
                uint256 commission = (reward * validatorInfo[validatorSet[i]].commissionRate) / 10000;
                uint256 delegatorReward = reward - commission;
                
                validatorInfo[validatorSet[i]].rewardAmount = validatorInfo[validatorSet[i]].rewardAmount + commission;
                
                if (validatorInfo[validatorSet[i]].stakingAmount > 0 && delegatorReward > 0) {
                    validatorInfo[validatorSet[i]].delegatorRewardPool = 
                        validatorInfo[validatorSet[i]].delegatorRewardPool + delegatorReward;
                    
                    validatorInfo[validatorSet[i]].accRewardPerStake = 
                        validatorInfo[validatorSet[i]].accRewardPerStake + 
                        ((delegatorReward * PRECISION_FACTOR) / validatorInfo[validatorSet[i]].stakingAmount);
                }
                
                rewardValidators[rewardCount] = validatorSet[i];
                validatorRewardAmount[rewardCount] = reward;
                rewardCount++;
                distributedAmount = distributedAmount + reward;
            }
        }

        uint256 remain = rewardAmount - distributedAmount;
        if (remain > 0 && rewardCount > 0) {
            validatorInfo[rewardValidators[rewardCount - 1]].rewardAmount = 
                validatorInfo[rewardValidators[rewardCount - 1]].rewardAmount + remain;
            validatorRewardAmount[rewardCount - 1] = validatorRewardAmount[rewardCount - 1] + remain;
        }

        emit RewardDistributed(rewardValidators, validatorRewardAmount, rewardCount);
    }

    function _updateDelegatorRewards(address delegator, address validator) private {
        StakingInfo storage stakingInfo = stakerInfo[delegator][validator];
        Validator storage valInfo = validatorInfo[validator];
        DelegatorRewardInfo storage rewardInfo = delegatorRewardInfo[delegator][validator];
        
        if (stakingInfo.amount > 0) {
            uint256 accReward = (stakingInfo.amount * valInfo.accRewardPerStake) / PRECISION_FACTOR;
            uint256 pending = accReward - rewardInfo.rewardDebt;
            
            if (pending > 0) {
                rewardInfo.pendingRewards = rewardInfo.pendingRewards + pending;
            }
        }
        
        rewardInfo.rewardDebt = (stakingInfo.amount * valInfo.accRewardPerStake) / PRECISION_FACTOR;
    }
    
    function claimDelegatorRewards(address validator) external returns (bool) {
        address payable delegator = payable(msg.sender);
        
        _updateDelegatorRewards(delegator, validator);
        
        DelegatorRewardInfo storage rewardInfo = delegatorRewardInfo[delegator][validator];
        uint256 claimable = rewardInfo.pendingRewards;
        
        require(claimable > 0, "No rewards");
        
        rewardInfo.pendingRewards = 0;
        rewardInfo.lastClaimBlock = block.number;
        
        Validator storage valInfo = validatorInfo[validator];
        if (valInfo.delegatorRewardPool >= claimable) {
            valInfo.delegatorRewardPool = valInfo.delegatorRewardPool - claimable;
        } else {
            claimable = valInfo.delegatorRewardPool;
            valInfo.delegatorRewardPool = 0;
        }
        
        delegator.transfer(claimable);
        
        emit DelegatorRewardsClaimed(delegator, validator, claimable);
        return true;
    }
    
    function getPendingDelegatorRewards(address delegator, address validator) external view returns (uint256) {
        StakingInfo memory stakingInfo = stakerInfo[delegator][validator];
        Validator memory valInfo = validatorInfo[validator];
        DelegatorRewardInfo memory rewardInfo = delegatorRewardInfo[delegator][validator];
        
        if (stakingInfo.amount == 0) {
            return rewardInfo.pendingRewards;
        }
        
        uint256 accReward = (stakingInfo.amount * valInfo.accRewardPerStake) / PRECISION_FACTOR;
        uint256 pending = accReward - rewardInfo.rewardDebt;
        
        return rewardInfo.pendingRewards + pending;
    }

    function getValidatorCandidate() public view returns (address[] memory, uint256[] memory, uint256) {
        address[] memory candidates = new address[](validatorCandidateSet.length);
        uint256[] memory stakings = new uint256[](validatorCandidateSet.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < validatorCandidateSet.length; i++) {
            if (validatorInfo[validatorCandidateSet[i]].status == Status.Staked) {
                candidates[count] = validatorCandidateSet[i];
                stakings[count] = validatorInfo[validatorCandidateSet[i]].stakingAmount;
                count++;
            }
        }
        return (candidates, stakings, count);
    }

    function getValidatorInfo(address validator) public view returns (
        address payable,
        Status,
        uint256,
        uint256,
        uint256,
        uint256,
        address[] memory
    ) {
        Validator memory v = validatorInfo[validator];
        return (
            v.rewardAddr,
            v.status,
            v.stakingAmount,
            v.rewardAmount,
            v.slashAmount,
            v.lastWithdrawRewardBlock,
            v.stakers
        );
    }

    function getValidatorDescription(address validator) public view returns (
        string memory,
        string memory,
        string memory,
        string memory
    ) {
        Validator memory v = validatorInfo[validator];
        return (
            v.description.moniker,
            v.description.website,
            v.description.email,
            v.description.details
        );
    }

    function getStakingInfo(address staker, address validator) public view returns (
        uint256,
        uint256,
        uint256
    ) {
        return (
            stakerInfo[staker][validator].amount,
            stakerInfo[staker][validator].unstakeBlock,
            stakerInfo[staker][validator].index
        );
    }

    function getActivatedValidators() public view returns (address[] memory) {
        return validatorSet;
    }

    function isValidatorActivated(address validator) public view returns (bool) {
        for (uint256 i = 0; i < validatorSet.length; i++) {
            if (validatorSet[i] == validator) {
                return true;
            }
        }
        return false;
    }

    function isValidatorCandidate(address who) public view returns (bool) {
        for (uint256 i = 0; i < validatorCandidateSet.length; i++) {
            if (validatorCandidateSet[i] == who) {
                return true;
            }
        }
        return false;
    }

    function isJailed(address validator) public view returns (bool) {
        return validatorInfo[validator].status == Status.Jailed;
    }

    function validateDescription(
        string memory moniker,
        string memory website,
        string memory email,
        string memory details
    ) public pure returns (bool) {
        require(bytes(moniker).length <= 128, "moniker len");
        require(bytes(website).length <= 256, "website len");
        require(bytes(email).length <= 256, "email len");
        require(bytes(details).length <= 1024, "details len");
        return true;
    }

    function updateActivatedValidators() public onlyCoinbase onlyNotUpdated onlyInitialized onlyBlockEpoch returns (address[] memory) {
        require(validatorCandidateSet.length > 0, "empty set");
        require(validatorCandidateSet.length <= MaxValidatorNum, "max 101");
        
        validatorSet = validatorCandidateSet;
        emit ValidatorSetUpdated(validatorSet);
        return validatorSet;
    }

    function slashValidator(address validator) external onlySlashContract {
        if (!isValidatorActivated(validator)) return;

        Validator storage valInfo = validatorInfo[validator];
        valInfo.status = Status.Jailed;
        uint256 stakingAmount = valInfo.stakingAmount;
        deactivateValidator(validator);
        removeFromValidatorCandidate(validator);

        if (stakingAmount == 0) return;

        uint256 slashTotal = 0;
        for (uint256 i = 0; i < valInfo.stakers.length; i++) {
            StakingInfo storage stakingInfo = stakerInfo[valInfo.stakers[i]][validator];
            uint256 stakerSlashAmount = (stakingInfo.amount * ValidatorSlashAmount) / stakingAmount;
            stakingInfo.amount = stakingInfo.amount - stakerSlashAmount;
            slashTotal = slashTotal + stakerSlashAmount;
        }
        
        valInfo.stakingAmount = valInfo.stakingAmount - slashTotal;
        valInfo.slashAmount = valInfo.slashAmount + slashTotal;

        _distributeRewardToActivatedValidators(slashTotal, validator);
        emit ValidatorSlash(validator, slashTotal);
    }

    function _updateValidator(
        address payable validator,
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details
    ) private returns (bool) {
        require(rewardAddr != address(0), "Invalid reward addr");
        require(validateDescription(moniker, website, email, details), "Invalid desc");
        
        if (validatorInfo[validator].status == Status.NotExist) {
            validatorInfo[validator].status = Status.Created;
        }

        validatorInfo[validator].rewardAddr = rewardAddr;
        validatorInfo[validator].description = Description(moniker, website, email, details);
        
        return true;
    }

    function addToValidatorCandidate(address validator, uint256 staking) internal returns (bool) {
        if (validatorCandidateExists[validator]) return true;

        if (validatorCandidateSet.length < MaxValidatorNum) {
            validatorCandidateSet.push(validator);
            validatorCandidateExists[validator] = true;
            emit AddToValidatorCandidate(validator);
            return true;
        }

        uint256 lowestStaking = validatorInfo[validatorCandidateSet[0]].stakingAmount;
        uint256 lowestIndex = 0;
        
        for (uint256 i = 1; i < validatorCandidateSet.length; i++) {
            if (validatorInfo[validatorCandidateSet[i]].stakingAmount < lowestStaking) {
                lowestStaking = validatorInfo[validatorCandidateSet[i]].stakingAmount;
                lowestIndex = i;
            }
        }

        if (staking <= lowestStaking) return false;

        emit RemoveFromValidatorCandidate(validatorCandidateSet[lowestIndex]);
        validatorCandidateExists[validatorCandidateSet[lowestIndex]] = false;
        
        validatorCandidateSet[lowestIndex] = validator;
        validatorCandidateExists[validator] = true;
        emit AddToValidatorCandidate(validator);
        
        return true;
    }

    function removeFromValidatorCandidate(address validator) internal {
        if (!validatorCandidateExists[validator]) return;

        for (uint256 i = 0; i < validatorCandidateSet.length && validatorCandidateSet.length > 1; i++) {
            if (validatorCandidateSet[i] == validator) {
                if (i != validatorCandidateSet.length - 1) {
                    validatorCandidateSet[i] = validatorCandidateSet[validatorCandidateSet.length - 1];
                }
                validatorCandidateSet.pop();
                validatorCandidateExists[validator] = false;
                emit RemoveFromValidatorCandidate(validator);
                break;
            }
        }
    }

    function deactivateValidator(address validator) private {
        for (uint256 i = 0; i < validatorSet.length && validatorSet.length > 1; i++) {
            if (validator == validatorSet[i]) {
                if (i != validatorSet.length - 1) {
                    validatorSet[i] = validatorSet[validatorSet.length - 1];
                }
                validatorSet.pop();
                break;
            }
        }
    }

    receive() external payable {}
}