// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./System.sol";
import "./interfaces/IValidators.sol";

/**
 * @title Slash Contract - Compatible with Pre-Shanghai Geth
 * @notice Handles validator slashing for missed blocks
 * @dev Optimized to avoid stack too deep errors
 */
contract Slash is System {
    // --- Constants ---
    uint256 public constant DEFAULT_SLASH_THRESHOLD = 48;
    uint256 public constant DEFAULT_DECREASE_RATE = 48;
    
    // --- State Variables ---
    uint256 public slashThreshold;
    uint256 public decreaseRate;

    struct SlashRecord {
        uint256 missedBlocksCounter;
        uint256 index;
        uint256 decreasePrevNumber;
        bool exist;
    }

    IValidators public validatorContract;

    mapping(address => SlashRecord) public slashRecords;
    address[] public slashValidators;

    uint256 private slashPrevNumber;
    uint256 private decreasePrevNumber;

    // --- Events ---
    event ValidatorMissedBlock(address indexed validator, uint256 missedCount);
    event ValidatorSlashed(address indexed validator, uint256 missedBlocksCounter);
    event ValidatorDecreasedMissedBlockCounter(
        address[] validators, 
        uint256[] missedBlockCounters, 
        uint256 decreasedCount
    );
    event SlashRecordCleared(address indexed validator);
    event SlashParametersUpdated(uint256 newThreshold, uint256 newDecreaseRate);

    // --- Modifiers ---
    modifier onlyNotSlashed() {
        require(block.number > slashPrevNumber, "Already slashed in this block");
        _;
        slashPrevNumber = block.number;
    }

    modifier onlyNotDecreased() {
        require(block.number > decreasePrevNumber, "Already decreased in this block");
        _;
        decreasePrevNumber = block.number;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "Invalid address");
        _;
    }

    // --- Initialization ---
    function initialize() external onlyNotInitialized {
        validatorContract = IValidators(ValidatorContractAddr);
        slashThreshold = DEFAULT_SLASH_THRESHOLD;
        decreaseRate = DEFAULT_DECREASE_RATE;
        admin = msg.sender;
        initialized = true;
    }

    // --- Core Functions ---
    function slash(address validator)
        external
        onlyCoinbase
        onlyInitialized
        onlyNotSlashed
        whenNotPaused
        validAddress(validator)
    {
        if (!validatorContract.isValidatorActivated(validator)) {
            return;
        }

        _processSlash(validator);
    }

    function _processSlash(address validator) private {
        SlashRecord storage record = slashRecords[validator];
        
        if (!record.exist) {
            record.index = slashValidators.length;
            slashValidators.push(validator);
            record.exist = true;
        }

        record.missedBlocksCounter++;
        emit ValidatorMissedBlock(validator, record.missedBlocksCounter);

        if (record.missedBlocksCounter >= slashThreshold) {
            validatorContract.slashValidator(validator);
            emit ValidatorSlashed(validator, record.missedBlocksCounter);
            record.missedBlocksCounter = 0;
        }
    }

    function decreaseMissedBlocksCounter()
        external
        onlyCoinbase
        onlyNotDecreased
        onlyInitialized
        onlyBlockEpoch
        whenNotPaused
    {
        if (slashValidators.length == 0) {
            return;
        }

        _processDecrease();
    }

    function _processDecrease() private {
        uint256 length = slashValidators.length;
        address[] memory decreasedValidators = new address[](length);
        uint256[] memory missedBlockCounters = new uint256[](length);
        uint256 decreasedCount = 0;
        uint256 decreaseAmount = slashThreshold / decreaseRate;

        for (uint256 i = 0; i < length; i++) {
            address validator = slashValidators[i];
            SlashRecord storage record = slashRecords[validator];
            
            if (record.exist && record.decreasePrevNumber < block.number) {
                record.decreasePrevNumber = block.number;
                
                if (record.missedBlocksCounter > decreaseAmount) {
                    record.missedBlocksCounter -= decreaseAmount;
                } else {
                    record.missedBlocksCounter = 0;
                }
                
                decreasedValidators[decreasedCount] = validator;
                missedBlockCounters[decreasedCount] = record.missedBlocksCounter;
                decreasedCount++;
            }
        }
        
        if (decreasedCount > 0) {
            emit ValidatorDecreasedMissedBlockCounter(
                decreasedValidators, 
                missedBlockCounters, 
                decreasedCount
            );
        }
    }

    function clean(address validator)
        public
        onlyInitialized
        onlyValidatorsContract
        validAddress(validator)
        returns (bool)
    {
        SlashRecord storage record = slashRecords[validator];
        
        if (record.exist && record.missedBlocksCounter != 0) {
            record.missedBlocksCounter = 0;
        }

        if (record.exist && slashValidators.length > 0) {
            if (record.index != slashValidators.length - 1) {
                address lastValidator = slashValidators[slashValidators.length - 1];
                slashValidators[record.index] = lastValidator;
                slashRecords[lastValidator].index = record.index;
            }
            
            slashValidators.pop();
            delete slashRecords[validator];
            
            emit SlashRecordCleared(validator);
        }

        return true;
    }

    // --- Admin Functions ---
    function updateSlashParameters(uint256 newThreshold, uint256 newDecreaseRate) 
        external 
        onlyAdmin 
        whenNotPaused 
    {
        require(newThreshold > 0 && newThreshold <= 100, "Invalid threshold");
        require(newDecreaseRate > 0 && newDecreaseRate <= 100, "Invalid decrease rate");
        require(newThreshold >= newDecreaseRate, "Threshold must be >= decrease rate");
        
        slashThreshold = newThreshold;
        decreaseRate = newDecreaseRate;
        
        emit SlashParametersUpdated(newThreshold, newDecreaseRate);
    }

    // --- View Functions ---
    function getSlashValidatorsLen() public view returns (uint256) {
        return slashValidators.length;
    }

    function getSlashRecord(address validator) public view returns (uint256) {
        return slashRecords[validator].missedBlocksCounter;
    }

    function slashRecordExists(address validator) public view returns (bool) {
        return slashRecords[validator].exist;
    }

    function getAllSlashValidators() public view returns (address[] memory) {
        return slashValidators;
    }

    function blocksUntilSlash(address validator) public view returns (uint256) {
        uint256 missedCount = slashRecords[validator].missedBlocksCounter;
        if (missedCount >= slashThreshold) {
            return 0;
        }
        return slashThreshold - missedCount;
    }
}