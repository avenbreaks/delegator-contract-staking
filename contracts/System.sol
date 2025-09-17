// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title System Base Contract
 * @notice Base contract for Validators and Slash contracts
 */
abstract contract System {
    bool public initialized;
    bool public paused;
    address public admin;

    address public constant ValidatorContractAddr = 0x0000000000000000000000000000000000001000;
    address public constant SlashContractAddr = 0x0000000000000000000000000000000000001001;
    uint256 public constant BlockEpoch = 200;

    event Paused();
    event Unpaused();
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier onlyCoinbase() {
        require(msg.sender == block.coinbase, "the message sender must be the block producer");
        _;
    }

    modifier onlyNotInitialized() {
        require(!initialized, "the contract already initialized");
        _;
    }

    modifier onlyInitialized() {
        require(initialized, "the contract not init yet");
        _;
    }

    modifier onlySlashContract() {
        require(msg.sender == SlashContractAddr, "the message sender must be slash contract");
        _;
    }

    modifier onlyValidatorsContract() {
        require(msg.sender == ValidatorContractAddr, "the message sender must be validator contract");
        _;
    }

    modifier onlyBlockEpoch() {
        require(block.number % BlockEpoch == 0, "Block epoch only");
        _;
    }

    function pause() external onlyAdmin {
        require(!paused, "Already paused");
        paused = true;
        emit Paused();
    }

    function unpause() external onlyAdmin {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused();
    }

    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin address");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }
}