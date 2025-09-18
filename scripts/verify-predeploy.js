const { ethers } = require("hardhat");

// Alamat kontrak pre-deploy di oorthnexus (sesuaikan dengan alamat aktual Anda)
const PREDEPLOY_ADDRESSES = {
    VALIDATORS: "0x0000000000000000000000000000000000001000",
    SLASH: "0x0000000000000000000000000000000000001001"
};

async function verifyContract(contractAddress, contractName, constructorArgs = []) {
    console.log(`\n=== Verifying ${contractName} Contract ===`);
    console.log(`Address: ${contractAddress}`);
    
    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: constructorArgs,
            contract: `contracts/${contractName}.sol:${contractName}`
        });
        
        console.log(`✅ ${contractName} verified successfully!`);
        return true;
        
    } catch (error) {
        if (error.message.toLowerCase().includes("already verified")) {
            console.log(`✅ ${contractName} is already verified!`);
            return true;
        } else {
            console.error(`❌ ${contractName} verification failed:`);
            console.error(error.message);
            return false;
        }
    }
}

async function main() {
    console.log("Starting verification of pre-deployed contracts on oorthnexus...");
    
    // Get network information
    const network = await ethers.provider.getNetwork();
    console.log("Network:", network.name);
    console.log("Chain ID:", network.chainId.toString());
    
    // Verify that we're on oorthnexus network
    if (network.chainId.toString() !== "982025") {
        console.error("❌ Not connected to oorthnexus network!");
        console.error("Current chain ID:", network.chainId.toString());
        console.error("Expected chain ID: 982025");
        process.exit(1);
    }
    
    console.log("✅ Connected to oorthnexus network");
    
    // Check if contracts exist at pre-deploy addresses
    console.log("\n=== Checking Pre-deployed Contracts ===");
    
    const validatorsCode = await ethers.provider.getCode(PREDEPLOY_ADDRESSES.VALIDATORS);
    const slashCode = await ethers.provider.getCode(PREDEPLOY_ADDRESSES.SLASH);
    
    if (validatorsCode === "0x") {
        console.error(`❌ No contract found at Validators address: ${PREDEPLOY_ADDRESSES.VALIDATORS}`);
    } else {
        console.log(`✅ Validators contract found at: ${PREDEPLOY_ADDRESSES.VALIDATORS}`);
        console.log(`   Bytecode size: ${(validatorsCode.length - 2) / 2} bytes`);
    }
    
    if (slashCode === "0x") {
        console.error(`❌ No contract found at Slash address: ${PREDEPLOY_ADDRESSES.SLASH}`);
    } else {
        console.log(`✅ Slash contract found at: ${PREDEPLOY_ADDRESSES.SLASH}`);
        console.log(`   Bytecode size: ${(slashCode.length - 2) / 2} bytes`);
    }
    
    // Verify contracts
    const results = [];
    
    if (validatorsCode !== "0x") {
        const validatorsResult = await verifyContract(
            PREDEPLOY_ADDRESSES.VALIDATORS, 
            "Validators",
            [] // No constructor arguments
        );
        results.push({ contract: "Validators", success: validatorsResult });
    }
    
    if (slashCode !== "0x") {
        const slashResult = await verifyContract(
            PREDEPLOY_ADDRESSES.SLASH,
            "Slash", 
            [] // No constructor arguments
        );
        results.push({ contract: "Slash", success: slashResult });
    }
    
    // Summary
    console.log("\n=== Verification Summary ===");
    console.log("Network: oorthnexus");
    console.log("Explorer: https://explorer.oorthnexus.xyz");
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Successfully verified: ${successful.length}/${results.length}`);
    successful.forEach(r => {
        const address = r.contract === "Validators" ? PREDEPLOY_ADDRESSES.VALIDATORS : PREDEPLOY_ADDRESSES.SLASH;
        console.log(`   - ${r.contract}: https://explorer.oorthnexus.xyz/address/${address}`);
    });
    
    if (failed.length > 0) {
        console.log(`❌ Failed to verify: ${failed.length}/${results.length}`);
        failed.forEach(r => console.log(`   - ${r.contract}`));
    }
    
    console.log("\n🎉 Verification process completed!");
}

// Function to verify individual contract (for manual use)
async function verifyIndividual(contractName, contractAddress) {
    console.log(`Verifying individual contract: ${contractName} at ${contractAddress}`);
    
    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [],
            contract: `contracts/${contractName}.sol:${contractName}`
        });
        console.log("✅ Verification successful!");
    } catch (error) {
        console.error("❌ Verification failed:", error.message);
    }
}

// Handle command line arguments for individual verification
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 2) {
        // Manual verification: node verify-predeploy.js <contractName> <address>
        const [contractName, contractAddress] = args;
        verifyIndividual(contractName, contractAddress)
            .then(() => process.exit(0))
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    } else {
        // Default: verify all pre-deployed contracts
        main()
            .then(() => process.exit(0))
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    }
}

module.exports = { verifyContract, verifyIndividual, PREDEPLOY_ADDRESSES };