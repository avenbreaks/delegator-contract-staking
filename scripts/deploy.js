// scripts/deploy.js - Main deployment script
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting deployment with Solidity 0.8.19 for pre-Shanghai Geth...\n");
  
  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await deployer.getBalance();
  console.log("Account balance:", hre.ethers.utils.formatEther(balance), "ETH\n");
  
  // Contract addresses (update these if you have specific addresses)
  const VALIDATOR_CONTRACT_ADDR = "0x0000000000000000000000000000000000001000";
  const SLASH_CONTRACT_ADDR = "0x0000000000000000000000000000000000001001";
  
  try {
    // Skip System contract as it's abstract
    // Only deploy concrete contracts: Validators and Slash
    
    // 1. Deploy Validators contract
    console.log("📝 Deploying Validators contract...");
    const Validators = await hre.ethers.getContractFactory("Validators");
    const validators = await Validators.deploy();
    await validators.deployed();
    console.log("✅ Validators deployed to:", validators.address);
    
    // 2. Deploy Slash contract
    console.log("\n📝 Deploying Slash contract...");
    const Slash = await hre.ethers.getContractFactory("Slash");
    const slash = await Slash.deploy();
    await slash.deployed();
    console.log("✅ Slash deployed to:", slash.address);
    
    // 3. Verify bytecode compatibility
    console.log("\n🔍 Verifying bytecode compatibility...");
    await verifyBytecodeCompatibility(validators.address, "Validators");
    await verifyBytecodeCompatibility(slash.address, "Slash");
    
    // 4. Initialize contracts
    console.log("\n⚙️  Initializing contracts...");
    
    // Initial validators list (update with your validators)
    const initialValidators = [
      deployer.address, // Use deployer as initial validator for testing
      // Add more validator addresses as needed
    ];
    
    // Initialize Validators contract
    console.log("Initializing Validators with", initialValidators.length, "validators...");
    const initValidatorsTx = await validators.initialize(initialValidators);
    await initValidatorsTx.wait();
    console.log("✅ Validators initialized");
    
    // Initialize Slash contract
    console.log("Initializing Slash contract...");
    const initSlashTx = await slash.initialize();
    await initSlashTx.wait();
    console.log("✅ Slash initialized");
    
    // 5. Save deployment info
    const deploymentInfo = {
      network: hre.network.name,
      chainId: hre.network.config.chainId,
      deployer: deployer.address,
      contracts: {
        validators: {
          address: validators.address,
          blockNumber: validators.deployTransaction.blockNumber,
        },
        slash: {
          address: slash.address,
          blockNumber: slash.deployTransaction.blockNumber,
        }
      },
      timestamp: new Date().toISOString()
    };
    
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }
    
    const filename = `${hre.network.name}_deployment.json`;
    fs.writeFileSync(
      path.join(deploymentsDir, filename),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log("\n✅ Deployment complete!");
    console.log("📄 Deployment info saved to:", `deployments/${filename}`);
    
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("Network:", hre.network.name);
    console.log("Chain ID:", hre.network.config.chainId);
    console.log("Validators Contract:", validators.address);
    console.log("Slash Contract:", slash.address);
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  }
}

async function verifyBytecodeCompatibility(address, contractName) {
  const bytecode = await hre.ethers.provider.getCode(address);
  
  // Check for PUSH0 opcode (0x5f)
  if (bytecode.toLowerCase().includes("5f")) {
    // More thorough check - 5f could be part of data, not opcode
    const opcodeCheck = checkForPush0Opcode(bytecode);
    if (opcodeCheck) {
      console.warn(`⚠️  WARNING: ${contractName} bytecode might contain PUSH0 opcode!`);
      console.warn("   This may not work on pre-Shanghai Geth nodes.");
      return false;
    }
  }
  
  console.log(`✅ ${contractName} bytecode is compatible with pre-Shanghai EVM`);
  return true;
}

function checkForPush0Opcode(bytecode) {
  // Remove 0x prefix if present
  const code = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  
  // PUSH0 opcode is 0x5f
  // We need to check if 5f appears as an opcode, not as data
  // This is a simplified check - a full check would require parsing the entire bytecode
  
  let i = 0;
  while (i < code.length) {
    const opcode = code.substr(i, 2);
    
    if (opcode === "5f") {
      // Found potential PUSH0
      return true;
    }
    
    // Skip PUSH operations and their data
    const opcodeNum = parseInt(opcode, 16);
    if (opcodeNum >= 0x60 && opcodeNum <= 0x7f) {
      // PUSH1 to PUSH32
      const dataLength = (opcodeNum - 0x60 + 1) * 2; // Each byte is 2 hex chars
      i += 2 + dataLength;
    } else {
      i += 2;
    }
  }
  
  return false;
}

// Run deployment
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// scripts/verify-contracts.js - Verification script
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Verifying deployed contracts...\n");
  
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
  
  console.log("Network:", deployment.network);
  console.log("Validators:", deployment.contracts.validators.address);
  console.log("Slash:", deployment.contracts.slash.address);
  console.log();
  
  // Verify each contract
  await verifyContract(deployment.contracts.validators.address, "Validators");
  await verifyContract(deployment.contracts.slash.address, "Slash");
  
  console.log("\n✅ Verification complete!");
}

async function verifyContract(address, name) {
  console.log(`\nVerifying ${name} at ${address}...`);
  
  // Get contract instance
  const contract = await hre.ethers.getContractAt(name, address);
  
  // Check basic functionality
  try {
    const initialized = await contract.initialized();
    console.log(`  ✓ Contract initialized: ${initialized}`);
    
    const paused = await contract.paused();
    console.log(`  ✓ Contract paused: ${paused}`);
    
    const admin = await contract.admin();
    console.log(`  ✓ Admin address: ${admin}`);
    
    // Check bytecode
    const bytecode = await hre.ethers.provider.getCode(address);
    const hasCode = bytecode && bytecode !== "0x";
    console.log(`  ✓ Has bytecode: ${hasCode}`);
    
    // Check for PUSH0
    const hasPush0 = bytecode.toLowerCase().includes("5f");
    if (hasPush0) {
      console.warn(`  ⚠️  WARNING: Bytecode contains "5f" - verify this is not PUSH0 opcode`);
    } else {
      console.log(`  ✓ No PUSH0 opcode detected`);
    }
    
  } catch (error) {
    console.error(`  ✗ Error verifying ${name}:`, error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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