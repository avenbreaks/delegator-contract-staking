// scripts/fix-cli-compatibility.js
// Script to ensure contracts are compatible with CoinEx CLI

const { ethers } = require("hardhat");

async function main() {
  console.log("🔧 Fixing Contract State for CLI Compatibility\n");
  console.log("=" + "=".repeat(70) + "\n");

  const [deployer, validator1, validator2, ...accounts] = await ethers.getSigners();
  
  // Update these with your actual deployed addresses
  const VALIDATORS_ADDRESS = process.env.VALIDATORS_ADDRESS || "0x0000000000000000000000000000000000001000";
  const SLASH_ADDRESS = process.env.SLASH_ADDRESS || "0x0000000000000000000000000000000000001001";

  const validators = await ethers.getContractAt("Validators", VALIDATORS_ADDRESS);
  const slash = await ethers.getContractAt("Slash", SLASH_ADDRESS);

  console.log("Current State Check:");
  console.log("-".repeat(71));

  // Check initialization
  const isInitialized = await validators.initialized();
  if (!isInitialized) {
    console.log("❌ Contract not initialized. Initializing...");
    
    const initTx = await validators.initialize([
      validator1.address,
      validator2.address
    ]);
    await initTx.wait();
    console.log("✅ Validators contract initialized");
    
    const slashInitTx = await slash.initialize();
    await slashInitTx.wait();
    console.log("✅ Slash contract initialized");
  } else {
    console.log("✅ Contracts already initialized");
  }

  // Check current validators
  console.log("\nChecking current validators...");
  const activeValidators = await validators.getActivatedValidators();
  console.log(`Found ${activeValidators.length} active validators`);

  // Check validator candidates
  try {
    const [candidates, stakings, count] = await validators.getValidatorCandidate();
    console.log(`\nValidator candidates with Status.Staked: ${count}`);
    
    if (count == 0) {
      console.log("\n⚠️  No validators with Status.Staked found!");
      console.log("This is why the CLI command is failing.\n");
      
      console.log("Attempting to fix...\n");
      
      // Create and stake validators to ensure they have Status.Staked
      for (let i = 0; i < Math.min(2, accounts.length); i++) {
        const account = accounts[i];
        const validatorAddress = account.address;
        
        console.log(`\nProcessing validator ${i + 1}: ${validatorAddress}`);
        
        // Check if validator exists
        const info = await validators.getValidatorInfo(validatorAddress);
        const status = info[1].toNumber();
        
        if (status == 0) { // NotExist
          console.log("  Creating new validator...");
          
          try {
            const createTx = await validators.connect(account).create(
              account.address, // rewardAddr
              `Validator${i + 1}`,
              `https://validator${i + 1}.com`,
              `validator${i + 1}@example.com`,
              `Test Validator ${i + 1}`,
              { value: ethers.utils.parseEther("10000") } // MinimalStakingCoin
            );
            await createTx.wait();
            console.log("  ✅ Validator created and staked");
          } catch (error) {
            console.log(`  ❌ Failed to create: ${error.message}`);
          }
        } else if (status == 1) { // Created
          console.log("  Validator exists but not staked. Staking...");
          
          try {
            const stakeTx = await validators.connect(account).stake(
              validatorAddress,
              { value: ethers.utils.parseEther("10000") }
            );
            await stakeTx.wait();
            console.log("  ✅ Validator staked");
          } catch (error) {
            console.log(`  ❌ Failed to stake: ${error.message}`);
          }
        } else if (status == 2) { // Staked
          console.log("  ✅ Already staked");
        } else if (status == 3) { // Unstake
          console.log("  ⚠️  Validator is unstaked. Need to stake again.");
          
          try {
            const stakeTx = await validators.connect(account).stake(
              validatorAddress,
              { value: ethers.utils.parseEther("10000") }
            );
            await stakeTx.wait();
            console.log("  ✅ Validator re-staked");
          } catch (error) {
            console.log(`  ❌ Failed to re-stake: ${error.message}`);
          }
        } else if (status == 4) { // Jailed
          console.log("  ⚠️  Validator is jailed. Attempting to unjail...");
          
          try {
            const unjailTx = await validators.connect(account).unjailed();
            await unjailTx.wait();
            console.log("  ✅ Validator unjailed");
          } catch (error) {
            console.log(`  ❌ Failed to unjail: ${error.message}`);
          }
        }
      }
      
      // Verify the fix
      console.log("\n" + "=".repeat(71));
      console.log("Verifying fix...");
      
      const [newCandidates, newStakings, newCount] = await validators.getValidatorCandidate();
      console.log(`\n✅ Validator candidates with Status.Staked: ${newCount}`);
      
      if (newCount > 0) {
        console.log("\nCandidates:");
        for (let i = 0; i < newCount; i++) {
          console.log(`  ${i + 1}. ${newCandidates[i]}`);
          console.log(`     Staking: ${ethers.utils.formatEther(newStakings[i])} ETH`);
        }
        
        console.log("\n✅ Issue should be resolved! Try the CLI command again:");
        console.log("   cetd validator.candidators.query --node http://127.0.0.1:8545");
      } else {
        console.log("\n❌ Still no candidates with Status.Staked");
        console.log("   Manual intervention may be required");
      }
    } else {
      console.log("\n✅ Validators are properly configured");
      console.log("   The CLI command should work");
    }
    
  } catch (error) {
    console.log(`\n❌ Error checking candidates: ${error.message}`);
    console.log("\nPossible issues:");
    console.log("1. Contracts not properly deployed");
    console.log("2. Contracts at wrong addresses");
    console.log("3. Contract ABI mismatch");
  }

  // Additional debugging info
  console.log("\n" + "=".repeat(71));
  console.log("📋 Summary:");
  console.log("-".repeat(71));
  console.log("Contract Addresses:");
  console.log(`  Validators: ${VALIDATORS_ADDRESS}`);
  console.log(`  Slash: ${SLASH_ADDRESS}`);
  
  console.log("\nStatus Codes:");
  console.log("  0 = NotExist");
  console.log("  1 = Created");
  console.log("  2 = Staked (required for candidacy)");
  console.log("  3 = Unstake");
  console.log("  4 = Jailed");
  
  console.log("\nCLI Commands to test:");
  console.log("  cetd validator.candidators.query --node http://127.0.0.1:8545");
  console.log("  cetd validator.activated.query --node http://127.0.0.1:8545");
  console.log("  cetd validator.info <validator_address> --node http://127.0.0.1:8545");
}

// Run the fix
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});