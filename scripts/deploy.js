const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment...");
  
  // Get the deployer account with error handling
  const signers = await ethers.getSigners();
  
  if (!signers || signers.length === 0) {
    throw new Error("No signers available. Please check your private key configuration in .env file.");
  }
  
  const deployer = signers[0];
  
  if (!deployer) {
    throw new Error("Deployer account not found. Please check your PRIVATE_KEY in .env file.");
  }
  
  console.log("Deploying contracts with account:", deployer.address);
  
  // Get balance with retry mechanism
  let balance;
  try {
    balance = await deployer.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");
    
    // Check if account has sufficient balance
    if (balance === 0n) {
      console.warn("⚠️  Warning: Account balance is 0 ETH. Make sure you have funds for gas fees.");
    }
  } catch (error) {
    console.warn("⚠️  Could not fetch account balance:", error.message);
  }

  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "ChainId:", network.chainId.toString());

  try {
    // Deploy Validators contract first
    console.log("\n=== Deploying Validators Contract ===");
    const Validators = await ethers.getContractFactory("Validators");
    const validators = await Validators.deploy();
    await validators.waitForDeployment();
    const validatorsAddress = await validators.getAddress();
    console.log("Validators contract deployed to:", validatorsAddress);

    // Deploy Slash contract
    console.log("\n=== Deploying Slash Contract ===");
    const Slash = await ethers.getContractFactory("Slash");
    const slash = await Slash.deploy();
    await slash.waitForDeployment();
    const slashAddress = await slash.getAddress();
    console.log("Slash contract deployed to:", slashAddress);

    // Wait for a few confirmations
    console.log("\nWaiting for confirmations...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Initialize Validators contract
    console.log("\n=== Initializing Validators Contract ===");
    // Initialize with the deployer as the first validator
    const initValidators = [deployer.address];
    const initTx = await validators.initialize(initValidators);
    await initTx.wait();
    console.log("Validators contract initialized with validators:", initValidators);

    // Initialize Slash contract
    console.log("\n=== Initializing Slash Contract ===");
    const slashInitTx = await slash.initialize();
    await slashInitTx.wait();
    console.log("Slash contract initialized");

    // Verify contract states
    console.log("\n=== Verifying Deployment ===");
    
    const isValidatorsInitialized = await validators.initialized();
    const isSlashInitialized = await slash.initialized();
    const validatorAdmin = await validators.admin();
    const slashAdmin = await slash.admin();
    
    console.log("Validators initialized:", isValidatorsInitialized);
    console.log("Slash initialized:", isSlashInitialized);
    console.log("Validators admin:", validatorAdmin);
    console.log("Slash admin:", slashAdmin);

    // Get validator info
    const validatorInfo = await validators.getValidatorInfo(deployer.address);
    console.log("Initial validator info:");
    console.log("  Reward Address:", validatorInfo[0]);
    console.log("  Status:", validatorInfo[1].toString());
    console.log("  Staking Amount:", ethers.formatEther(validatorInfo[2]), "ETH");

    // Display deployment summary
    console.log("\n=== Deployment Summary ===");
    console.log("Network:", network.name);
    console.log("Chain ID:", network.chainId.toString());
    console.log("Deployer:", deployer.address);
    console.log("Validators Contract:", validatorsAddress);
    console.log("Slash Contract:", slashAddress);
    
    // Save deployment info to file
    const deploymentInfo = {
      network: network.name,
      chainId: network.chainId.toString(),
      deployer: deployer.address,
      contracts: {
        Validators: validatorsAddress,
        Slash: slashAddress
      },
      timestamp: new Date().toISOString(),
      blockNumber: await ethers.provider.getBlockNumber()
    };

    const fs = require('fs');
    const path = require('path');
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    // Save deployment info
    const deploymentFile = path.join(deploymentsDir, `${network.name}-${network.chainId}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to:", deploymentFile);

    console.log("\n✅ Deployment completed successfully!");

  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;