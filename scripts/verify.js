const { ethers } = require("hardhat");

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: npx hardhat run scripts/verify.js --network <network> -- <contract_address> <contract_name>");
    console.log("Example: npx hardhat run scripts/verify.js --network sepolia -- 0x123... Validators");
    process.exit(1);
  }

  const contractAddress = args[0];
  const contractName = args[1] || "Validators";
  
  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "ChainId:", network.chainId.toString());
  console.log("Verifying contract:", contractName);
  console.log("Contract address:", contractAddress);

  try {
    // Verify the contract
    console.log("Starting verification...");
    
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [], // Both contracts have no constructor arguments
    });

    console.log("Contract verified successfully!");

  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("Contract is already verified!");
    } else {
      console.error("Verification failed:");
      console.error(error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;