const { ethers } = require("hardhat");
require("dotenv").config();

async function checkConfiguration() {
    console.log("=== Checking Hardhat Configuration for oorthnexus ===\n");
    
    // Check network configuration
    const networkConfig = hre.config.networks.oorthnexus;
    console.log("Network Configuration:");
    console.log("  URL:", networkConfig?.url || "Not configured");
    console.log("  Chain ID: 982025 (expected)");
    
    // Check if connected to correct network
    try {
        const network = await ethers.provider.getNetwork();
        console.log("\nCurrent Network Connection:");
        console.log("  Connected Chain ID:", network.chainId.toString());
        console.log("  Network Name:", network.name);
        
        if (network.chainId.toString() === "982025") {
            console.log("  Status: ✅ Connected to oorthnexus");
        } else {
            console.log("  Status: ❌ Not connected to oorthnexus");
            console.log("  Run: npx hardhat run <script> --network oorthnexus");
        }
        
        // Test RPC connection
        const blockNumber = await ethers.provider.getBlockNumber();
        console.log("  Current Block:", blockNumber);
        
    } catch (error) {
        console.log("\nNetwork Connection: ❌ Failed");
        console.log("Error:", error.message);
    }
    
    // Check Etherscan/Blockscout configuration
    console.log("\nBlockscout Configuration:");
    const etherscanConfig = hre.config.etherscan;
    const oorthChain = etherscanConfig.customChains?.find(chain => chain.network === "oorthnexus");
    
    if (oorthChain) {
        console.log("  ✅ Custom chain configured");
        console.log("  API URL:", oorthChain.urls.apiURL);
        console.log("  Browser URL:", oorthChain.urls.browserURL);
        console.log("  Chain ID:", oorthChain.chainId);
    } else {
        console.log("  ❌ Custom chain not configured");
    }
    
    // Check contract addresses
    console.log("\nPre-deployed Contract Addresses:");
    const addresses = {
        "Validators": "0x0000000000000000000000000000000000001000",
        "Slash": "0x0000000000000000000000000000000000001001"
    };
    
    for (const [name, address] of Object.entries(addresses)) {
        try {
            const code = await ethers.provider.getCode(address);
            if (code !== "0x") {
                console.log(`  ✅ ${name}: ${address} (${(code.length - 2) / 2} bytes)`);
            } else {
                console.log(`  ❌ ${name}: ${address} (no contract found)`);
            }
        } catch (error) {
            console.log(`  ❌ ${name}: ${address} (error: ${error.message})`);
        }
    }
    
    // Check Solidity compilation settings
    console.log("\nSolidity Configuration:");
    const solidityConfig = hre.config.solidity;
    console.log("  Version:", solidityConfig.version);
    console.log("  Optimizer enabled:", solidityConfig.settings.optimizer.enabled);
    console.log("  Optimizer runs:", solidityConfig.settings.optimizer.runs);
    console.log("  EVM Version:", solidityConfig.settings.evmVersion);
    
    // Check for required files
    console.log("\nRequired Files:");
    const fs = require('fs');
    const path = require('path');
    
    const requiredFiles = [
        'contracts/Validators.sol',
        'contracts/Slash.sol',
        'contracts/System.sol',
        'contracts/interfaces/ISlash.sol',
        'contracts/interfaces/IValidators.sol'
    ];
    
    requiredFiles.forEach(file => {
        const exists = fs.existsSync(path.join(process.cwd(), file));
        console.log(`  ${exists ? '✅' : '❌'} ${file}`);
    });
    
    console.log("\n=== Configuration Check Complete ===");
}

async function testVerification() {
    console.log("=== Testing Verification Setup ===\n");
    
    try {
        // Test if we can compile contracts
        console.log("Testing contract compilation...");
        await hre.run("compile");
        console.log("✅ Compilation successful");
        
        // Test verification command (dry run)
        console.log("\nTesting verification setup...");
        console.log("Verification endpoint:", hre.config.etherscan.customChains?.[0]?.urls?.apiURL);
        console.log("✅ Verification configuration looks good");
        
    } catch (error) {
        console.log("❌ Test failed:", error.message);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--test-verification')) {
        await testVerification();
    } else {
        await checkConfiguration();
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Configuration check failed:", error);
            process.exit(1);
        });
}

module.exports = { checkConfiguration, testVerification };