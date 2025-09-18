const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment...");
  
  try {
    // Get network information first
    const network = await ethers.provider.getNetwork();
    console.log("Connected to network:", network.name, "ChainId:", network.chainId.toString());
    
    // Test provider connection
    console.log("Testing provider connection...");
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log("Current block number:", blockNumber);
    
    // Get the deployer account with error handling
    const signers = await ethers.getSigners();
    
    if (!signers || signers.length === 0) {
      throw new Error("No signers available. Please check your private key configuration in .env file.");
    }
    
    const deployer = signers[0];
    
    if (!deployer) {
      throw new Error("Deployer account not found. Please check your PRIVATE_KEY in .env file.");
    }
    
    console.log("Deployer account:", deployer.address);
    
    // Get balance with retry mechanism
    let balance;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        balance = await deployer.provider.getBalance(deployer.address);
        console.log("Account balance:", ethers.formatEther(balance), "ETH");
        
        // Check if account has sufficient balance
        if (balance === 0n) {
          throw new Error("Account balance is 0 ETH. Please add funds to your account.");
        }
        
        // Minimum balance check (0.01 ETH)
        const minBalance = ethers.parseEther("0.01");
        if (balance < minBalance) {
          console.warn("Warning: Low balance. You might not have enough ETH for deployment.");
        }
        
        break; // Success, exit retry loop
      } catch (error) {
        attempts++;
        console.log(`Balance check attempt ${attempts} failed:`, error.message);
        
        if (attempts === maxAttempts) {
          throw new Error(`Failed to get balance after ${maxAttempts} attempts: ${error.message}`);
        }
        
        console.log("Retrying in 3 seconds...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Get gas price for estimation
    let gasPrice;
    try {
      gasPrice = await ethers.provider.getFeeData();
      console.log("Gas price (gwei):", ethers.formatUnits(gasPrice.gasPrice || 0n, "gwei"));
    } catch (error) {
      console.warn("Could not fetch gas price:", error.message);
    }

    // Deploy Validators contract first with retry mechanism
    console.log("\n=== Deploying Validators Contract ===");
    let validators;
    attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const Validators = await ethers.getContractFactory("Validators");
        
        // Deploy with a reasonable gas limit since estimation is failing
        console.log("Deploying Validators contract...");
        
        validators = await Validators.deploy({
          gasLimit: 8000000, // Set a generous gas limit
        });
        
        console.log("Validators deployment transaction sent:", validators.deploymentTransaction().hash);
        console.log("Waiting for deployment confirmation...");
        
        await validators.waitForDeployment();
        const validatorsAddress = await validators.getAddress();
        console.log("Validators contract deployed to:", validatorsAddress);
        break;
        
      } catch (error) {
        attempts++;
        console.log(`Validators deployment attempt ${attempts} failed:`, error.message);
        
        if (attempts === maxAttempts) {
          throw new Error(`Failed to deploy Validators after ${maxAttempts} attempts: ${error.message}`);
        }
        
        console.log("Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Deploy Slash contract with retry mechanism
    console.log("\n=== Deploying Slash Contract ===");
    let slash;
    attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const Slash = await ethers.getContractFactory("Slash");
        
        // Deploy with a reasonable gas limit since estimation is failing
        console.log("Deploying Slash contract...");
        
        slash = await Slash.deploy({
          gasLimit: 3000000, // Set a reasonable gas limit for Slash
        });
        
        console.log("Slash deployment transaction sent:", slash.deploymentTransaction().hash);
        console.log("Waiting for deployment confirmation...");
        
        await slash.waitForDeployment();
        const slashAddress = await slash.getAddress();
        console.log("Slash contract deployed to:", slashAddress);
        break;
        
      } catch (error) {
        attempts++;
        console.log(`Slash deployment attempt ${attempts} failed:`, error.message);
        
        if (attempts === maxAttempts) {
          throw new Error(`Failed to deploy Slash after ${maxAttempts} attempts: ${error.message}`);
        }
        
        console.log("Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Wait for additional confirmations
    console.log("\nWaiting for additional confirmations...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Initialize Validators contract with retry
    console.log("\n=== Initializing Validators Contract ===");
    attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const initValidators = [deployer.address];
        
        // Initialize with reasonable gas limit
        const initTx = await validators.initialize(initValidators, {
          gasLimit: 2000000, // Set a reasonable gas limit for initialization
        });
        
        console.log("Initialization transaction sent:", initTx.hash);
        await initTx.wait();
        console.log("Validators contract initialized with validators:", initValidators);
        break;
        
      } catch (error) {
        attempts++;
        console.log(`Validators initialization attempt ${attempts} failed:`, error.message);
        
        if (attempts === maxAttempts) {
          throw new Error(`Failed to initialize Validators after ${maxAttempts} attempts: ${error.message}`);
        }
        
        console.log("Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Initialize Slash contract with retry
    console.log("\n=== Initializing Slash Contract ===");
    attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        // Initialize with reasonable gas limit
        const slashInitTx = await slash.initialize({
          gasLimit: 1000000, // Set a reasonable gas limit for Slash initialization
        });
        
        console.log("Initialization transaction sent:", slashInitTx.hash);
        await slashInitTx.wait();
        console.log("Slash contract initialized");
        break;
        
      } catch (error) {
        attempts++;
        console.log(`Slash initialization attempt ${attempts} failed:`, error.message);
        
        if (attempts === maxAttempts) {
          throw new Error(`Failed to initialize Slash after ${maxAttempts} attempts: ${error.message}`);
        }
        
        console.log("Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

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
    try {
      const validatorInfo = await validators.getValidatorInfo(deployer.address);
      console.log("Initial validator info:");
      console.log("  Reward Address:", validatorInfo[0]);
      console.log("  Status:", validatorInfo[1].toString());
      console.log("  Staking Amount:", ethers.formatEther(validatorInfo[2]), "ETH");
    } catch (error) {
      console.warn("Could not fetch validator info:", error.message);
    }

    // Get final addresses
    const validatorsAddress = await validators.getAddress();
    const slashAddress = await slash.getAddress();

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
    console.error("Error message:", error.message);
    
    if (error.code) {
      console.error("Error code:", error.code);
    }
    
    if (error.reason) {
      console.error("Error reason:", error.reason);
    }
    
    // Provide helpful suggestions based on error type
    if (error.message.includes("insufficient funds")) {
      console.error("\n💡 Suggestion: Add more ETH to your account for gas fees");
    } else if (error.message.includes("timeout") || error.message.includes("network")) {
      console.error("\n💡 Suggestion: Try using a different RPC endpoint or check your internet connection");
    } else if (error.message.includes("private key") || error.message.includes("signer")) {
      console.error("\n💡 Suggestion: Check your PRIVATE_KEY in the .env file");
    }
    
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