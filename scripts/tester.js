// scripts/test-deployment.js - Test basic functionality
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🧪 Testing deployed contracts...\n");
  
  const [deployer, user1, user2] = await hre.ethers.getSigners();
  
  // Load deployment info
  const deploymentFile = path.join(
    __dirname,
    `../deployments/${hre.network.name}_deployment.json`
  );
  
  if (!fs.existsSync(deploymentFile)) {
    console.error("❌ Deployment file not found. Run deploy script first.");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  
  // Get contract instances
  const validators = await hre.ethers.getContractAt(
    "Validators",
    deployment.contracts.validators.address
  );
  
  const slash = await hre.ethers.getContractAt(
    "Slash",
    deployment.contracts.slash.address
  );
  
  console.log("Testing Validators contract...");
  
  try {
    // Test 1: Check initial state
    console.log("\n1. Checking initial state:");
    const initialized = await validators.initialized();
    console.log(`   ✓ Initialized: ${initialized}`);
    
    const totalStaked = await validators.getTotalNetworkStaked();
    console.log(`   ✓ Total network staked: ${hre.ethers.utils.formatEther(totalStaked)} ETH`);
    
    const activeValidators = await validators.getActivatedValidators();
    console.log(`   ✓ Active validators: ${activeValidators.length}`);
    
    // Test 2: Create a validator
    console.log("\n2. Creating a validator:");
    const tx = await validators.connect(user1).create(
      user1.address,
      "TestValidator",
      "https://test.com",
      "test@test.com",
      "Test validator",
      { value: hre.ethers.utils.parseEther("10000") }
    );
    await tx.wait();
    console.log(`   ✓ Validator created by ${user1.address}`);
    
    // Test 3: Check validator info
    console.log("\n3. Checking validator info:");
    const validatorInfo = await validators.getValidatorInfo(user1.address);
    console.log(`   ✓ Status: ${validatorInfo.status}`);
    console.log(`   ✓ Total staked: ${hre.ethers.utils.formatEther(validatorInfo.totalStaked)} ETH`);
    
    // Test 4: Stake to validator
    console.log("\n4. Staking to validator:");
    const stakeTx = await validators.connect(user2).stake(
      user1.address,
      { value: hre.ethers.utils.parseEther("1000") }
    );
    await stakeTx.wait();
    console.log(`   ✓ ${user2.address} staked 1000 ETH`);
    
    // Test 5: Check slash contract
    console.log("\n5. Testing Slash contract:");
    const slashThreshold = await slash.slashThreshold();
    console.log(`   ✓ Slash threshold: ${slashThreshold.toString()}`);
    
    const decreaseRate = await slash.decreaseRate();
    console.log(`   ✓ Decrease rate: ${decreaseRate.toString()}`);
    
    console.log("\n✅ All tests passed!");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});