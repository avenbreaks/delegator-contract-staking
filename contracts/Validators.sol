// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./System.sol";
import "./interfaces/ISlash.sol";

/**
 * @title Validators Contract - Optimized for Geth Compatibility
 * @notice Refactored to avoid Stack too deep errors without --via-ir
 * @dev Compatible with pre-Shanghai Geth versions
 */
contract Validators is System {
    
    // --- Constants ---
    uint16 public constant MAX_VALIDATOR_NUM = 101;
    uint256 public constant STAKING_LOCK_PERIOD = 86400;
    uint256 public constant WITHDRAW_REWARD_PERIOD = 28800;
    uint256 public constant MIN_DELEGATOR_STAKE = 1000 ether;
    uint256 public constant MIN_VALIDATOR_TOTAL_STAKE = 10000 ether;
    uint256 public constant VALIDATOR_SLASH_PENALTY = 500 ether;
    uint256 public constant MAX_COMMISSION_RATE = 1000;
    uint256 public constant DEFAULT_COMMISSION_RATE = 500;
    uint256 private constant PRECISION_FACTOR = 1e18;
    uint256 private constant COMMISSION_BASE = 10000;
    uint256 private constant REMAINDER_THRESHOLD = 1e15;

    // --- Structs ---
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
        uint256 totalStaked;
        Description description;
        uint256 rewardAmount;
        uint256 slashAmount;
        uint256 lastWithdrawRewardTimestamp;
        address[] delegators;
        uint256 commissionRate;
        uint256 delegatorRewardPool;
        uint256 accRewardPerStake;
        uint256 accSlashPerStake;
        uint256 lastRewardUpdateBlock;
    }

    struct DelegatorInfo {
        uint256 delegatedAmount;
        uint256 unstakeTimestamp;
        uint256 index;
        uint256 rewardDebt;
        uint256 pendingRewards;
        uint256 slashDebt;
        uint256 lastInteractionBlock;
    }

    struct ReentrancyGuard {
        uint256 status;
    }

    // --- State Variables ---
    mapping(address => Validator) private validatorInfo;
    mapping(address => mapping(address => DelegatorInfo)) private delegatorInfo;
    address[] private validatorCandidateSet;
    address[] private validatorSet;
    uint256 private totalNetworkStaked;
    
    ISlash private slashContract;
    
    uint256 private distributedRewardNumber;
    uint256 private updateValidatorNumber;
    mapping(address => bool) private validatorCandidateExists;
    
    bool public emergencyPaused;
    address public emergencyAdmin;
    uint256 private totalRewardRemainder;

    // Manual reentrancy guard
    ReentrancyGuard private _guard;

    // --- Events ---
    event ValidatorCreated(address indexed validator, address indexed rewardAddr, uint256 commissionRate);
    event ValidatorUpdated(address indexed validator, address indexed rewardAddr);
    event ValidatorUnjailed(address indexed validator);
    event Unstake(address indexed staker, address indexed validator, uint256 amount, uint256 unlockTimestamp);
    event Staking(address indexed staker, address indexed validator, uint256 amount);
    event WithdrawStaking(address indexed staker, address indexed validator, uint256 amount);
    event WithdrawRewards(address indexed validator, address indexed rewardAddress, uint256 amount, uint256 nextWithdrawTimestamp);
    event ClaimDelegatorRewards(address indexed delegator, address indexed validator, uint256 amount);
    event RewardDistributed(address[] validators, uint256[] rewards, uint256 totalAmount, uint256 remainder);
    event ValidatorSlash(address indexed validator, uint256 amount, uint256 newTotalStake);
    event ValidatorSetUpdated(address[] validators, uint256 blockNumber);
    event AddToValidatorCandidate(address indexed validator, uint256 totalStake);
    event RemoveFromValidatorCandidate(address indexed validator);
    event CommissionRateUpdated(address indexed validator, uint256 oldRate, uint256 newRate);
    event EmergencyPauseToggled(bool paused, address admin);

    // --- Modifiers ---
    modifier nonReentrant() {
        require(_guard.status != 2, "ReentrancyGuard: reentrant call");
        _guard.status = 2;
        _;
        _guard.status = 1;
    }

    modifier onlyNotRewarded() {
        require(block.number > distributedRewardNumber, "Block already rewarded");
        _;
        distributedRewardNumber = block.number;
    }

    modifier onlyNotUpdated() {
        require(block.number > updateValidatorNumber, "Validators already updated");
        _;
        updateValidatorNumber = block.number;
    }

    modifier whenNotEmergencyPaused() {
        require(!emergencyPaused, "Contract emergency paused");
        _;
    }

    modifier onlyEmergencyAdmin() {
        require(msg.sender == emergencyAdmin, "Only emergency admin");
        _;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "Invalid address");
        _;
    }

    modifier validAmount(uint256 amount) {
        require(amount > 0, "Amount must be greater than 0");
        _;
    }

    modifier validValidator(address validator) {
        require(validatorInfo[validator].status != Status.NotExist, "Validator does not exist");
        _;
    }

    // --- Core Functions Split into Smaller Functions ---
    
    function initialize(address[] calldata validators) 
        external 
        onlyNotInitialized 
    {
        require(validators.length > 0 && validators.length <= MAX_VALIDATOR_NUM, "Invalid validator count");
        
        slashContract = ISlash(SlashContractAddr);
        admin = msg.sender;
        emergencyAdmin = msg.sender;
        _guard.status = 1;

        for (uint256 i = 0; i < validators.length; i++) {
            _initializeValidator(validators[i]);
        }

        initialized = true;
    }

    function _initializeValidator(address validator) private {
        require(validator != address(0), "Invalid validator address");

        if (!validatorCandidateExists[validator]) {
            validatorCandidateSet.push(validator);
            validatorCandidateExists[validator] = true;
        }

        if (!isValidatorActivated(validator)) {
            validatorSet.push(validator);
        }

        Validator storage val = validatorInfo[validator];
        if (val.rewardAddr == address(0)) {
            val.rewardAddr = payable(validator);
        }
        if (val.status == Status.NotExist) {
            val.status = Status.Staked;
        }
        if (val.commissionRate == 0) {
            val.commissionRate = DEFAULT_COMMISSION_RATE;
        }
    }

    // Simplified create function - split logic
    function create(
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details
    ) external payable onlyInitialized whenNotPaused whenNotEmergencyPaused returns (bool) {
        return _create(rewardAddr, moniker, website, email, details, DEFAULT_COMMISSION_RATE);
    }

    function createWithCommission(
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details,
        uint256 commissionRate
    ) external payable onlyInitialized whenNotPaused whenNotEmergencyPaused returns (bool) {
        return _create(rewardAddr, moniker, website, email, details, commissionRate);
    }

    function _create(
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details,
        uint256 commissionRate
    ) private validAddress(rewardAddr) returns (bool) {
        address payable validator = payable(msg.sender);
        require(validatorInfo[validator].status == Status.NotExist, "Validator already exists");
        require(commissionRate <= MAX_COMMISSION_RATE, "Commission rate too high");

        _setupValidator(validator, rewardAddr, moniker, website, email, details, commissionRate);
        
        if (msg.value > 0) {
            return _stake(validator, validator, msg.value);
        }
        
        return true;
    }

    function _setupValidator(
        address validator,
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details,
        uint256 commissionRate
    ) private {
        require(validateDescription(moniker, website, email, details), "Invalid description");
        
        Validator storage val = validatorInfo[validator];
        val.status = Status.Created;
        val.rewardAddr = rewardAddr;
        val.description = Description(moniker, website, email, details);
        val.commissionRate = commissionRate;
        
        emit ValidatorCreated(validator, rewardAddr, commissionRate);
    }

    // Stake function optimized
    function stake(address validator) 
        external 
        payable 
        onlyInitialized 
        whenNotPaused 
        whenNotEmergencyPaused 
        returns (bool) 
    {
        return _stake(msg.sender, validator, msg.value);
    }

    function _stake(address staker, address validator, uint256 amount) 
        private 
        returns (bool) 
    {
        require(staker != address(0) && validator != address(0), "Invalid address");
        require(amount > 0, "Amount must be greater than 0");
        require(validatorInfo[validator].status != Status.NotExist, "Validator does not exist");
        
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        require(delInfo.unstakeTimestamp == 0, "Cannot stake while unstaking");

        if (delInfo.delegatedAmount == 0) {
            require(amount >= MIN_DELEGATOR_STAKE, "Initial stake below minimum");
        }

        _processStaking(staker, validator, amount);
        return true;
    }

    function _processStaking(address staker, address validator, uint256 amount) private {
        Validator storage val = validatorInfo[validator];
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        
        require(
            val.totalStaked + amount >= MIN_VALIDATOR_TOTAL_STAKE,
            "Total stake below minimum threshold"
        );

        _applyPendingSlash(staker, validator);

        if (delInfo.delegatedAmount == 0) {
            _addNewDelegator(staker, validator, amount);
        } else {
            _updateExistingDelegator(staker, validator, amount);
        }

        val.totalStaked += amount;
        delInfo.delegatedAmount += amount;
        delInfo.lastInteractionBlock = block.number;
        totalNetworkStaked += amount;

        if (val.status != Status.Staked && val.status != Status.Jailed) {
            val.status = Status.Staked;
        }

        emit Staking(staker, validator, amount);

        if (val.status == Status.Staked) {
            addToValidatorCandidate(validator, val.totalStaked);
        }
    }

    function _addNewDelegator(address staker, address validator, uint256 amount) private {
        Validator storage val = validatorInfo[validator];
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        
        delInfo.index = val.delegators.length;
        val.delegators.push(staker);
        delInfo.rewardDebt = (val.accRewardPerStake * amount) / PRECISION_FACTOR;
        delInfo.slashDebt = val.accSlashPerStake;
    }

    function _updateExistingDelegator(address staker, address validator, uint256 amount) private {
        Validator storage val = validatorInfo[validator];
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        
        if (delInfo.index == type(uint256).max) {
            delInfo.index = val.delegators.length;
            val.delegators.push(staker);
        }
        
        _updatePendingRewards(staker, validator);
        delInfo.rewardDebt += (val.accRewardPerStake * amount) / PRECISION_FACTOR;
        delInfo.slashDebt = val.accSlashPerStake;
    }

    // Unstake function optimized
    function unstake(address validator) 
        external 
        onlyInitialized 
        whenNotPaused 
        whenNotEmergencyPaused 
        validValidator(validator) 
        returns (bool) 
    {
        address staker = msg.sender;
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        
        require(delInfo.unstakeTimestamp == 0, "Already unstaking");
        require(delInfo.delegatedAmount > 0, "No stake to unstake");

        _processUnstaking(staker, validator);
        return true;
    }

    function _processUnstaking(address staker, address validator) private {
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        Validator storage val = validatorInfo[validator];
        uint256 unstakeAmount = delInfo.delegatedAmount;
        
        require(
            !(validatorSet.length == 1 && 
              isValidatorActivated(validator) && 
              val.totalStaked - unstakeAmount < MIN_VALIDATOR_TOTAL_STAKE),
            "Cannot unstake: would disable last validator"
        );

        _updatePendingRewards(staker, validator);
        _applyPendingSlash(staker, validator);
        _removeDelegatorFromList(staker, validator);

        val.totalStaked -= unstakeAmount;
        delInfo.unstakeTimestamp = block.timestamp;
        delInfo.lastInteractionBlock = block.number;
        totalNetworkStaked -= unstakeAmount;

        if (val.totalStaked < MIN_VALIDATOR_TOTAL_STAKE) {
            val.status = Status.Unstake;
        }

        uint256 unlockTimestamp = block.timestamp + STAKING_LOCK_PERIOD;
        emit Unstake(staker, validator, unstakeAmount, unlockTimestamp);

        if (val.status != Status.Staked) {
            removeFromValidatorCandidate(validator);
        }
    }

    // Withdrawal functions
    function withdrawStaking(address validator) 
        external 
        nonReentrant 
        whenNotPaused 
        whenNotEmergencyPaused 
        validValidator(validator) 
        returns (bool) 
    {
        address payable staker = payable(msg.sender);
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        
        require(delInfo.unstakeTimestamp != 0, "Must unstake first");
        require(
            block.timestamp >= delInfo.unstakeTimestamp + STAKING_LOCK_PERIOD,
            "Tokens still locked"
        );
        require(delInfo.delegatedAmount > 0, "No tokens to withdraw");

        uint256 amount = delInfo.delegatedAmount;
        delInfo.delegatedAmount = 0;
        delInfo.unstakeTimestamp = 0;
        delInfo.lastInteractionBlock = block.number;

        _safeTransfer(staker, amount);
        emit WithdrawStaking(staker, validator, amount);
        
        return true;
    }

    function claimDelegatorRewards(address validator) 
        external 
        nonReentrant 
        whenNotEmergencyPaused 
        validValidator(validator) 
        returns (bool) 
    {
        address payable delegator = payable(msg.sender);
        DelegatorInfo storage delInfo = delegatorInfo[delegator][validator];
        
        require(delInfo.delegatedAmount > 0, "No stake with validator");

        _updatePendingRewards(delegator, validator);
        
        uint256 claimable = delInfo.pendingRewards;
        require(claimable > 0, "No rewards to claim");

        delInfo.pendingRewards = 0;
        delInfo.rewardDebt = (validatorInfo[validator].accRewardPerStake * delInfo.delegatedAmount) / PRECISION_FACTOR;
        delInfo.lastInteractionBlock = block.number;

        Validator storage val = validatorInfo[validator];
        if (val.delegatorRewardPool >= claimable) {
            val.delegatorRewardPool -= claimable;
        } else {
            val.delegatorRewardPool = 0;
        }

        _safeTransfer(delegator, claimable);
        emit ClaimDelegatorRewards(delegator, validator, claimable);
        
        return true;
    }

    function withdrawRewards(address validator) 
        external 
        nonReentrant 
        whenNotEmergencyPaused 
        validValidator(validator) 
        returns (bool) 
    {
        address payable rewardAddr = payable(msg.sender);
        Validator storage val = validatorInfo[validator];
        
        require(val.rewardAddr == rewardAddr, "Not reward recipient");
        require(
            block.timestamp >= val.lastWithdrawRewardTimestamp + WITHDRAW_REWARD_PERIOD,
            "Must wait before next withdrawal"
        );
        require(val.rewardAmount > 0, "No rewards to withdraw");

        uint256 rewardAmount = val.rewardAmount;
        val.rewardAmount = 0;
        val.lastWithdrawRewardTimestamp = block.timestamp;

        _safeTransfer(rewardAddr, rewardAmount);

        uint256 nextWithdrawTimestamp = block.timestamp + WITHDRAW_REWARD_PERIOD;
        emit WithdrawRewards(validator, rewardAddr, rewardAmount, nextWithdrawTimestamp);
        
        return true;
    }

    // Reward distribution
    function distributeBlockReward() 
        external 
        payable 
        onlyCoinbase 
        onlyNotRewarded 
        onlyInitialized 
        onlyBlockEpoch 
    {
        if (msg.value > 0) {
            _distributeRewards(msg.value, address(0));
        }
    }

    function _distributeRewards(uint256 rewardAmount, address exceptAddress) private {
        if (rewardAmount == 0) return;

        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < validatorSet.length; i++) {
            if (validatorInfo[validatorSet[i]].status != Status.Jailed && 
                validatorSet[i] != exceptAddress) {
                eligibleCount++;
            }
        }
        
        if (eligibleCount == 0) return;

        _processRewardDistribution(rewardAmount, exceptAddress, eligibleCount);
    }

    function _processRewardDistribution(
        uint256 rewardAmount, 
        address exceptAddress, 
        uint256 eligibleCount
    ) private {
        address[] memory validators = new address[](eligibleCount);
        uint256[] memory rewards = new uint256[](eligibleCount);
        uint256 totalStake = 0;
        uint256 index = 0;
        
        // Calculate total stake
        for (uint256 i = 0; i < validatorSet.length; i++) {
            if (validatorInfo[validatorSet[i]].status != Status.Jailed && 
                validatorSet[i] != exceptAddress) {
                validators[index] = validatorSet[i];
                totalStake += validatorInfo[validatorSet[i]].totalStaked;
                index++;
            }
        }

        uint256 totalDistributed = 0;
        
        for (uint256 i = 0; i < eligibleCount; i++) {
            uint256 valReward;
            if (totalStake > 0) {
                valReward = (rewardAmount * validatorInfo[validators[i]].totalStaked) / totalStake;
            } else {
                valReward = rewardAmount / eligibleCount;
            }
            
            _distributeValidatorReward(validators[i], valReward);
            rewards[i] = valReward;
            totalDistributed += valReward;
        }

        _handleRemainder(rewardAmount - totalDistributed, validators, rewards);
        
        emit RewardDistributed(validators, rewards, rewardAmount, rewardAmount - totalDistributed);
    }

    function _handleRemainder(uint256 remainder, address[] memory validators, uint256[] memory rewards) private {
        if (remainder > 0 && validators.length > 0) {
            totalRewardRemainder += remainder;
            
            if (totalRewardRemainder >= REMAINDER_THRESHOLD || block.number % 100 == 0) {
                uint256 flushAmount = totalRewardRemainder;
                totalRewardRemainder = 0;
                
                uint256 perValidator = flushAmount / validators.length;
                uint256 finalRemainder = flushAmount - (perValidator * validators.length);
                
                for (uint256 i = 0; i < validators.length; i++) {
                    uint256 extra = perValidator;
                    if (i == 0) extra += finalRemainder;
                    
                    _distributeValidatorReward(validators[i], extra);
                    rewards[i] += extra;
                }
            }
        }
    }

    function _distributeValidatorReward(address validatorAddr, uint256 reward) private {
        if (reward == 0) return;
        
        Validator storage val = validatorInfo[validatorAddr];
        
        uint256 commission = (reward * val.commissionRate) / COMMISSION_BASE;
        uint256 delegatorReward = reward - commission;
        
        val.rewardAmount += commission;
        
        if (val.totalStaked > 0 && delegatorReward > 0) {
            val.delegatorRewardPool += delegatorReward;
            val.accRewardPerStake += (delegatorReward * PRECISION_FACTOR) / val.totalStaked;
        }
        
        val.lastRewardUpdateBlock = block.number;
    }

    // Slashing functions
    function slashValidator(address validator) 
        external 
        onlySlashContract 
        validAddress(validator) 
    {
        if (!isValidatorActivated(validator)) return;

        Validator storage val = validatorInfo[validator];
        val.status = Status.Jailed;
        deactivateValidator(validator);
        removeFromValidatorCandidate(validator);

        if (val.totalStaked == 0) return;

        uint256 slashAmount = VALIDATOR_SLASH_PENALTY;
        if (slashAmount > val.totalStaked) {
            slashAmount = val.totalStaked;
        }

        uint256 preStake = val.totalStaked;
        
        val.accSlashPerStake += (slashAmount * PRECISION_FACTOR) / preStake;
        val.totalStaked -= slashAmount;
        totalNetworkStaked -= slashAmount;
        val.slashAmount += slashAmount;

        _distributeRewards(slashAmount, validator);

        emit ValidatorSlash(validator, slashAmount, val.totalStaked);
    }

    function unjailValidator() 
        external 
        onlyInitialized 
        whenNotEmergencyPaused 
        returns (bool) 
    {
        address validator = msg.sender;
        require(validatorInfo[validator].status == Status.Jailed, "Validator not jailed");
        require(slashContract.clean(validator), "Failed to clean slash record");

        Validator storage val = validatorInfo[validator];
        if (val.totalStaked >= MIN_VALIDATOR_TOTAL_STAKE) {
            val.status = Status.Staked;
            addToValidatorCandidate(validator, val.totalStaked);
        } else {
            val.status = Status.Unstake;
        }

        emit ValidatorUnjailed(validator);
        return true;
    }

    // Helper functions
    function _safeTransfer(address payable to, uint256 amount) private {
        if (amount == 0) return;
        require(to != address(0), "Transfer to zero address");
        require(address(this).balance >= amount, "Insufficient balance");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function _applyPendingSlash(address staker, address validator) private {
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        Validator storage val = validatorInfo[validator];

        if (delInfo.delegatedAmount == 0) {
            delInfo.slashDebt = val.accSlashPerStake;
            return;
        }

        if (val.accSlashPerStake <= delInfo.slashDebt) return;

        uint256 deltaSlash = val.accSlashPerStake - delInfo.slashDebt;
        uint256 pendingSlash = (delInfo.delegatedAmount * deltaSlash) / PRECISION_FACTOR;
        
        if (pendingSlash == 0) {
            delInfo.slashDebt = val.accSlashPerStake;
            return;
        }

        if (pendingSlash >= delInfo.delegatedAmount) {
            totalNetworkStaked -= delInfo.delegatedAmount;
            val.totalStaked -= delInfo.delegatedAmount;
            delInfo.delegatedAmount = 0;
        } else {
            delInfo.delegatedAmount -= pendingSlash;
            totalNetworkStaked -= pendingSlash;
            val.totalStaked -= pendingSlash;
        }

        delInfo.rewardDebt = (val.accRewardPerStake * delInfo.delegatedAmount) / PRECISION_FACTOR;
        delInfo.slashDebt = val.accSlashPerStake;
    }

    function _updatePendingRewards(address staker, address validator) private {
        _applyPendingSlash(staker, validator);

        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        Validator storage val = validatorInfo[validator];

        if (delInfo.delegatedAmount > 0) {
            uint256 pending = ((delInfo.delegatedAmount * val.accRewardPerStake) / PRECISION_FACTOR) - delInfo.rewardDebt;
            
            if (pending > 0) {
                delInfo.pendingRewards += pending;
            }
        }
    }

    function _removeDelegatorFromList(address staker, address validator) private {
        DelegatorInfo storage delInfo = delegatorInfo[staker][validator];
        Validator storage val = validatorInfo[validator];
        
        require(val.delegators.length > 0, "No delegators");
        require(delInfo.index < val.delegators.length, "Invalid index");
        
        if (delInfo.index != val.delegators.length - 1) {
            val.delegators[delInfo.index] = val.delegators[val.delegators.length - 1];
            delegatorInfo[val.delegators[delInfo.index]][validator].index = delInfo.index;
        }
        val.delegators.pop();
        
        delInfo.index = type(uint256).max;
    }

    // Validator set management
    function updateActivatedValidators() 
        public 
        onlyCoinbase 
        onlyNotUpdated 
        onlyInitialized 
        onlyBlockEpoch 
        returns (address[] memory) 
    {
        require(validatorCandidateSet.length > 0, "Empty candidate set");
        require(validatorCandidateSet.length <= MAX_VALIDATOR_NUM, "Too many candidates");
        
        validatorSet = validatorCandidateSet;
        emit ValidatorSetUpdated(validatorSet, block.number);
        
        return validatorSet;
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

    function addToValidatorCandidate(address validator, uint256 staking) internal returns (bool) {
        if (validatorCandidateExists[validator]) return true;

        if (validatorCandidateSet.length < MAX_VALIDATOR_NUM) {
            validatorCandidateSet.push(validator);
            validatorCandidateExists[validator] = true;
            emit AddToValidatorCandidate(validator, staking);
            return true;
        }

        uint256 lowestStaking = validatorInfo[validatorCandidateSet[0]].totalStaked;
        uint256 lowestIndex = 0;
        
        for (uint256 i = 1; i < validatorCandidateSet.length; i++) {
            uint256 currentStake = validatorInfo[validatorCandidateSet[i]].totalStaked;
            if (currentStake < lowestStaking) {
                lowestStaking = currentStake;
                lowestIndex = i;
            }
        }

        if (staking <= lowestStaking) return false;

        address removedValidator = validatorCandidateSet[lowestIndex];
        emit RemoveFromValidatorCandidate(removedValidator);
        emit AddToValidatorCandidate(validator, staking);
        
        validatorCandidateExists[removedValidator] = false;
        validatorCandidateSet[lowestIndex] = validator;
        validatorCandidateExists[validator] = true;
        
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

    // View functions
    function getValidatorInfo(address validator) 
        public 
        view 
        returns (
            address rewardAddr,
            string memory status,
            uint256 totalStaked,
            uint256 rewardAmount,
            uint256 slashAmount,
            uint256 commissionRate
        ) 
    {
        Validator memory val = validatorInfo[validator];
        
        string memory statusStr;
        if (val.status == Status.NotExist) statusStr = "NotExist";
        else if (val.status == Status.Created) statusStr = "Created";
        else if (val.status == Status.Staked) statusStr = "Staked";
        else if (val.status == Status.Unstake) statusStr = "Unstake";
        else if (val.status == Status.Jailed) statusStr = "Jailed";

        return (
            val.rewardAddr,
            statusStr,
            val.totalStaked,
            val.rewardAmount,
            val.slashAmount,
            val.commissionRate
        );
    }

    function getPendingRewards(address staker, address validator) public view returns (uint256) {
        DelegatorInfo storage info = delegatorInfo[staker][validator];
        Validator storage val = validatorInfo[validator];

        if (info.delegatedAmount == 0) return info.pendingRewards;

        uint256 pending = ((info.delegatedAmount * val.accRewardPerStake) / PRECISION_FACTOR) - info.rewardDebt;
        
        return info.pendingRewards + pending;
    }

    function isValidatorActivated(address validator) public view returns (bool) {
        for (uint256 i = 0; i < validatorSet.length; i++) {
            if (validatorSet[i] == validator) return true;
        }
        return false;
    }

    function isValidatorCandidate(address validator) public view returns (bool) {
        return validatorCandidateExists[validator];
    }

    function isJailed(address validator) public view returns (bool) {
        return validatorInfo[validator].status == Status.Jailed;
    }

    function getActivatedValidators() public view returns (address[] memory) {
        return validatorSet;
    }

    function getTotalNetworkStaked() public view returns (uint256) {
        return totalNetworkStaked;
    }

    function validateDescription(
        string memory moniker,
        string memory website,
        string memory email,
        string memory details
    ) public pure returns (bool) {
        require(bytes(moniker).length <= 128, "Moniker too long");
        require(bytes(website).length <= 256, "Website too long");
        require(bytes(email).length <= 256, "Email too long");
        require(bytes(details).length <= 1024, "Details too long");
        return true;
    }

    // Admin functions
    function updateCommissionRate(uint256 newRate) 
        external 
        onlyInitialized 
        whenNotEmergencyPaused 
        validValidator(msg.sender) 
        returns (bool) 
    {
        require(newRate <= MAX_COMMISSION_RATE, "Commission rate too high");
        
        address validator = msg.sender;
        uint256 oldRate = validatorInfo[validator].commissionRate;
        validatorInfo[validator].commissionRate = newRate;
        
        emit CommissionRateUpdated(validator, oldRate, newRate);
        return true;
    }

    function edit(
        address payable rewardAddr,
        string calldata moniker,
        string calldata website,
        string calldata email,
        string calldata details
    ) external onlyInitialized whenNotEmergencyPaused validValidator(msg.sender) returns (bool) {
        address payable validator = payable(msg.sender);
        
        require(validateDescription(moniker, website, email, details), "Invalid description");
        
        Validator storage val = validatorInfo[validator];
        val.rewardAddr = rewardAddr;
        val.description = Description(moniker, website, email, details);
        
        emit ValidatorUpdated(validator, rewardAddr);
        
        return true;
    }

    function toggleEmergencyPause() external onlyEmergencyAdmin {
        emergencyPaused = !emergencyPaused;
        emit EmergencyPauseToggled(emergencyPaused, msg.sender);
    }

    function updateEmergencyAdmin(address newAdmin) external onlyEmergencyAdmin validAddress(newAdmin) {
        emergencyAdmin = newAdmin;
    }

    receive() external payable {}
}