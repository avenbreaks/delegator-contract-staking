const { verifyContract, PREDEPLOY_ADDRESSES } = require('./verify-predeploy');
const { ethers } = require("hardhat");

// Daftar kontrak dan alamatnya untuk verifikasi batch
const CONTRACTS_TO_VERIFY = [
    {
        name: "Validators",
        address: PREDEPLOY_ADDRESSES.VALIDATORS,
        constructorArgs: []
    },
    {
        name: "Slash", 
        address: PREDEPLOY_ADDRESSES.SLASH,
        constructorArgs: []
    }
];

async function verifyAllContracts() {
    console.log("Starting batch verification of all pre-deployed contracts...");
    
    // Verify network
    const network = await ethers.provider.getNetwork();
    if (network.chainId.toString() !== "982025") {
        throw new Error(`Wrong network! Expected oorthnexus (982025), got ${network.chainId}`);
    }
    
    console.log("Connected to oorthnexus network");
    console.log("Blockscout Explorer: https://explorer.oorthnexus.xyz");
    
    const results = [];
    
    for (const contract of CONTRACTS_TO_VERIFY) {
        console.log(`\n--- Verifying ${contract.name} ---`);
        
        // Check if contract exists
        const code = await ethers.provider.getCode(contract.address);
        if (code === "0x") {
            console.log(`⚠️  No contract found at ${contract.address}, skipping...`);
            results.push({ 
                name: contract.name, 
                address: contract.address, 
                success: false, 
                reason: "No contract found" 
            });
            continue;
        }
        
        try {
            const success = await verifyContract(
                contract.address, 
                contract.name, 
                contract.constructorArgs
            );
            
            results.push({ 
                name: contract.name, 
                address: contract.address, 
                success: success,
                reason: success ? "Verified" : "Verification failed"
            });
            
            // Wait between verifications to avoid rate limiting
            if (CONTRACTS_TO_VERIFY.indexOf(contract) < CONTRACTS_TO_VERIFY.length - 1) {
                console.log("Waiting 3 seconds before next verification...");
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
        } catch (error) {
            console.error(`Error verifying ${contract.name}:`, error.message);
            results.push({ 
                name: contract.name, 
                address: contract.address, 
                success: false,
                reason: error.message
            });
        }
    }
    
    // Print summary
    console.log("\n=== Batch Verification Summary ===");
    console.log(`Total contracts: ${results.length}`);
    console.log(`Successfully verified: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);
    
    console.log("\nDetailed Results:");
    results.forEach(result => {
        const status = result.success ? "✅" : "❌";
        console.log(`${status} ${result.name}`);
        console.log(`   Address: ${result.address}`);
        console.log(`   Status: ${result.reason}`);
        if (result.success) {
            console.log(`   Explorer: https://explorer.oorthnexus.xyz/address/${result.address}`);
        }
        console.log("");
    });
    
    return results;
}

// Check verification status of contracts
async function checkVerificationStatus() {
    console.log("Checking verification status of pre-deployed contracts...");
    
    for (const contract of CONTRACTS_TO_VERIFY) {
        console.log(`\n--- Checking ${contract.name} ---`);
        console.log(`Address: ${contract.address}`);
        console.log(`Explorer: https://explorer.oorthnexus.xyz/address/${contract.address}`);
        
        const code = await ethers.provider.getCode(contract.address);
        if (code === "0x") {
            console.log("Status: ❌ No contract found");
        } else {
            console.log("Status: ✅ Contract exists");
            console.log(`Bytecode size: ${(code.length - 2) / 2} bytes`);
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--check-status')) {
        await checkVerificationStatus();
    } else {
        await verifyAllContracts();
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Batch verification failed:", error);
            process.exit(1);
        });
}

module.exports = { verifyAllContracts, checkVerificationStatus, CONTRACTS_TO_VERIFY };