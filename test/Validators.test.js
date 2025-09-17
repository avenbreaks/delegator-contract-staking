// test/Validators.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("Validators Contract", function () {
  let validators;
  let slash;
  let owner;
  let validator1;
  let validator2;
  let delegator1;
  let delegator2;
  let coinbase;
  let addrs;

  // Constants from contract
  const MIN_DELEGATOR_STAKE = ethers.utils.parseEther("1000");
  const MIN_VALIDATOR_TOTAL_STAKE = ethers.utils.parseEther("10000");
  const VALIDATOR_SLASH_PENALTY = ethers.utils.parseEther("500");
  const DEFAULT_COMMISSION_RATE = 500; // 5%
  const MAX_COMMISSION_RATE = 1000; // 10%
  const STAKING_LOCK_PERIOD = 86400; // 24 hours
  const WITHDRAW_REWARD_PERIOD = 28800; // 8 hours

  beforeEach(async function () {
    [owner, validator1, validator2, delegator1, delegator2, coinbase, ...addrs] = await ethers.getSigners();

    // Deploy Validators contract
    const Validators = await ethers.getContractFactory("Validators");
    validators = await Validators.deploy();
    await validators.deployed();

    // Deploy Slash contract
    const Slash = await ethers.getContractFactory("Slash");
    slash = await Slash.deploy();
    await slash.deployed();

    // Initialize with initial validators
    await validators.initialize([validator1.address, validator2.address]);
    await slash.initialize();
  });

  describe("Deployment & Initialization", function () {
    it("Should set the correct initial state", async function () {
      expect(await validators.initialized()).to.equal(true);
      expect(await validators.paused()).to.equal(false);
      expect(await validators.admin()).to.equal(owner.address);
      expect(await validators.emergencyAdmin()).to.equal(owner.address);
    });

    it("Should have correct initial validators", async function () {
      const activeValidators = await validators.getActivatedValidators();
      expect(activeValidators.length).to.equal(2);
      expect(activeValidators[0]).to.equal(validator1.address);
      expect(activeValidators[1]).to.equal(validator2.address);
    });

    it("Should not allow re-initialization", async function () {
      await expect(
        validators.initialize([addrs[0].address])
      ).to.be.revertedWith("the contract already initialized");
    });
  });

  describe("Validator Creation", function () {
    it("Should create a new validator", async function () {
      const stakeAmount = ethers.utils.parseEther("10000");
      
      await expect(
        validators.connect(addrs[0]).create(
          addrs[0].address,
          "TestValidator",
          "https://test.com",
          "test@test.com",
          "Test validator details",
          { value: stakeAmount }
        )
      ).to.emit(validators, "ValidatorCreated")
        .withArgs(addrs[0].address, addrs[0].address, DEFAULT_COMMISSION_RATE);

      const info = await validators.getValidatorInfo(addrs[0].address);
      expect(info.status).to.equal("Staked");
      expect(info.totalStaked).to.equal(stakeAmount);
    });

    it("Should create validator with custom commission rate", async function () {
      const stakeAmount = ethers.utils.parseEther("10000");
      const customCommission = 800; // 8%
      
      await validators.connect(addrs[0]).createWithCommission(
        addrs[0].address,
        "TestValidator",
        "https://test.com",
        "test@test.com",
        "Test details",
        customCommission,
        { value: stakeAmount }
      );

      const info = await validators.getValidatorInfo(addrs[0].address);
      expect(info.commissionRate).to.equal(customCommission);
    });

    it("Should reject commission rate above maximum", async function () {
      await expect(
        validators.connect(addrs[0]).createWithCommission(
          addrs[0].address,
          "TestValidator",
          "https://test.com",
          "test@test.com",
          "Test details",
          1001, // Above MAX_COMMISSION_RATE
          { value: ethers.utils.parseEther("10000") }
        )
      ).to.be.revertedWith("Commission rate too high");
    });

    it("Should reject duplicate validator creation", async function () {
      await validators.connect(addrs[0]).create(
        addrs[0].address,
        "TestValidator",
        "https://test.com",
        "test@test.com",
        "Test details",
        { value: ethers.utils.parseEther("10000") }
      );

      await expect(
        validators.connect(addrs[0]).create(
          addrs[0].address,
          "TestValidator2",
          "https://test2.com",
          "test2@test.com",
          "Test details 2",
          { value: ethers.utils.parseEther("10000") }
        )
      ).to.be.revertedWith("Validator already exists");
    });
  });

  describe("Staking", function () {
    beforeEach(async function () {
      // Create a validator first
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Validator 1 details",
        { value: ethers.utils.parseEther("5000") }
      );
    });

    it("Should allow staking to a validator", async function () {
      const stakeAmount = ethers.utils.parseEther("2000");
      
      await expect(
        validators.connect(delegator1).stake(validator1.address, { value: stakeAmount })
      ).to.emit(validators, "Staking")
        .withArgs(delegator1.address, validator1.address, stakeAmount);

      const info = await validators.getValidatorInfo(validator1.address);
      expect(info.totalStaked).to.equal(ethers.utils.parseEther("7000")); // 5000 + 2000
    });

    it("Should enforce minimum initial stake for delegators", async function () {
      const belowMinimum = ethers.utils.parseEther("999");
      
      await expect(
        validators.connect(delegator1).stake(validator1.address, { value: belowMinimum })
      ).to.be.revertedWith("Initial stake below minimum");
    });

    it("Should allow additional stakes below minimum after initial", async function () {
      // First stake above minimum
      await validators.connect(delegator1).stake(
        validator1.address, 
        { value: ethers.utils.parseEther("1000") }
      );

      // Additional stake can be below minimum
      await expect(
        validators.connect(delegator1).stake(
          validator1.address, 
          { value: ethers.utils.parseEther("100") }
        )
      ).to.not.be.reverted;
    });

    it("Should track total network staked", async function () {
      const initialTotal = await validators.getTotalNetworkStaked();
      const stakeAmount = ethers.utils.parseEther("2000");
      
      await validators.connect(delegator1).stake(validator1.address, { value: stakeAmount });
      
      const newTotal = await validators.getTotalNetworkStaked();
      expect(newTotal.sub(initialTotal)).to.equal(stakeAmount);
    });

    it("Should reject staking to non-existent validator", async function () {
      await expect(
        validators.connect(delegator1).stake(
          addrs[5].address, 
          { value: ethers.utils.parseEther("1000") }
        )
      ).to.be.revertedWith("Validator does not exist");
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      // Setup validator with stake
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Details",
        { value: ethers.utils.parseEther("10000") }
      );
      
      // Add delegator stake
      await validators.connect(delegator1).stake(
        validator1.address,
        { value: ethers.utils.parseEther("2000") }
      );
    });

    it("Should allow unstaking", async function () {
      await expect(
        validators.connect(delegator1).unstake(validator1.address)
      ).to.emit(validators, "Unstake");

      // Check delegation info
      const [amount, timestamp] = await validators.getStakingInfo(
        delegator1.address,
        validator1.address
      );
      
      expect(amount).to.equal(ethers.utils.parseEther("2000"));
      expect(timestamp).to.be.gt(0);
    });

    it("Should not allow unstaking twice", async function () {
      await validators.connect(delegator1).unstake(validator1.address);
      
      await expect(
        validators.connect(delegator1).unstake(validator1.address)
      ).to.be.revertedWith("Already unstaking");
    });

    it("Should not allow staking while unstaking", async function () {
      await validators.connect(delegator1).unstake(validator1.address);
      
      await expect(
        validators.connect(delegator1).stake(
          validator1.address,
          { value: ethers.utils.parseEther("1000") }
        )
      ).to.be.revertedWith("Cannot stake while unstaking");
    });
  });

  describe("Withdrawal", function () {
    beforeEach(async function () {
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Details",
        { value: ethers.utils.parseEther("10000") }
      );
      
      await validators.connect(delegator1).stake(
        validator1.address,
        { value: ethers.utils.parseEther("2000") }
      );
      
      await validators.connect(delegator1).unstake(validator1.address);
    });

    it("Should not allow withdrawal before lock period", async function () {
      await expect(
        validators.connect(delegator1).withdrawStaking(validator1.address)
      ).to.be.revertedWith("Tokens still locked");
    });

    it("Should allow withdrawal after lock period", async function () {
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [STAKING_LOCK_PERIOD + 1]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await delegator1.getBalance();
      
      await expect(
        validators.connect(delegator1).withdrawStaking(validator1.address)
      ).to.emit(validators, "WithdrawStaking")
        .withArgs(delegator1.address, validator1.address, ethers.utils.parseEther("2000"));

      const balanceAfter = await delegator1.getBalance();
      expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(
        ethers.utils.parseEther("2000"),
        ethers.utils.parseEther("0.01") // Account for gas
      );
    });

    it("Should not allow double withdrawal", async function () {
      await ethers.provider.send("evm_increaseTime", [STAKING_LOCK_PERIOD + 1]);
      await ethers.provider.send("evm_mine");

      await validators.connect(delegator1).withdrawStaking(validator1.address);
      
      await expect(
        validators.connect(delegator1).withdrawStaking(validator1.address)
      ).to.be.revertedWith("No tokens to withdraw");
    });
  });

  describe("Commission and Rewards", function () {
    it("Should update commission rate", async function () {
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Details",
        { value: ethers.utils.parseEther("10000") }
      );

      const newRate = 700; // 7%
      
      await expect(
        validators.connect(validator1).updateCommissionRate(newRate)
      ).to.emit(validators, "CommissionRateUpdated")
        .withArgs(validator1.address, DEFAULT_COMMISSION_RATE, newRate);

      const info = await validators.getValidatorInfo(validator1.address);
      expect(info.commissionRate).to.equal(newRate);
    });

    it("Should reject commission rate update above maximum", async function () {
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Details",
        { value: ethers.utils.parseEther("10000") }
      );

      await expect(
        validators.connect(validator1).updateCommissionRate(1001)
      ).to.be.revertedWith("Commission rate too high");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to pause contract", async function () {
      await validators.pause();
      expect(await validators.paused()).to.equal(true);

      // Should reject operations when paused
      await expect(
        validators.connect(delegator1).stake(
          validator1.address,
          { value: ethers.utils.parseEther("1000") }
        )
      ).to.be.revertedWith("Contract is paused");
    });

    it("Should allow admin to unpause contract", async function () {
      await validators.pause();
      await validators.unpause();
      expect(await validators.paused()).to.equal(false);
    });

    it("Should allow admin change", async function () {
      await expect(
        validators.changeAdmin(addrs[0].address)
      ).to.emit(validators, "AdminChanged")
        .withArgs(owner.address, addrs[0].address);

      expect(await validators.admin()).to.equal(addrs[0].address);
    });

    it("Should reject admin functions from non-admin", async function () {
      await expect(
        validators.connect(addrs[0]).pause()
      ).to.be.revertedWith("Only admin can call this function");
    });

    it("Should allow emergency pause toggle", async function () {
      await expect(
        validators.toggleEmergencyPause()
      ).to.emit(validators, "EmergencyPauseToggled");

      expect(await validators.emergencyPaused()).to.equal(true);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Validator 1 details",
        { value: ethers.utils.parseEther("10000") }
      );
    });

    it("Should return validator info correctly", async function () {
      const info = await validators.getValidatorInfo(validator1.address);
      
      expect(info.rewardAddr).to.equal(validator1.address);
      expect(info.status).to.equal("Staked");
      expect(info.totalStaked).to.equal(ethers.utils.parseEther("10000"));
      expect(info.rewardAmount).to.equal(0);
      expect(info.slashAmount).to.equal(0);
    });

    it("Should validate description correctly", async function () {
      expect(await validators.validateDescription(
        "Valid",
        "https://valid.com",
        "valid@test.com",
        "Valid details"
      )).to.equal(true);

      // Test length limits
      const longString = "a".repeat(1025);
      await expect(
        validators.validateDescription(
          "Valid",
          "https://valid.com",
          "valid@test.com",
          longString
        )
      ).to.be.revertedWith("Details too long");
    });

    it("Should check if validator is activated", async function () {
      expect(await validators.isValidatorActivated(validator1.address)).to.equal(true);
      expect(await validators.isValidatorActivated(addrs[5].address)).to.equal(false);
    });

    it("Should check if validator is jailed", async function () {
      expect(await validators.isJailed(validator1.address)).to.equal(false);
    });

    it("Should return pending rewards", async function () {
      await validators.connect(delegator1).stake(
        validator1.address,
        { value: ethers.utils.parseEther("1000") }
      );

      const pending = await validators.getPendingRewards(
        delegator1.address,
        validator1.address
      );
      expect(pending).to.equal(0); // No rewards distributed yet
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero address properly", async function () {
      await expect(
        validators.connect(validator1).create(
          ethers.constants.AddressZero,
          "Validator",
          "https://test.com",
          "test@test.com",
          "Details",
          { value: ethers.utils.parseEther("10000") }
        )
      ).to.be.revertedWith("Invalid address");
    });

    it("Should handle zero stake amount", async function () {
      await validators.connect(validator1).create(
        validator1.address,
        "Validator1",
        "https://val1.com",
        "val1@test.com",
        "Details",
        { value: ethers.utils.parseEther("10000") }
      );

      await expect(
        validators.connect(delegator1).stake(validator1.address, { value: 0 })
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should prevent disabling last validator", async function () {
      // This test would need more complex setup with only one validator
      // and attempting to bring its stake below minimum
    });
  });
});