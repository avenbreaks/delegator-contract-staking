const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting deployment...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "ChainId:", network.chainId.toString());

  // === Fee data ===
  const feeData = await ethers.provider.getFeeData();

  function buildTxOptions(extra = {}) {
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      return {
        gasLimit: 8_000_000,
        maxFeePerGas: feeData.maxFeePerGas * 110n / 100n, // +10% bump
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        ...extra,
      };
    } else {
      return {
        gasLimit: 8_000_000,
        gasPrice: (feeData.gasPrice ?? ethers.parseUnits("2", "gwei")) * 110n / 100n, // +10%
        ...extra,
      };
    }
  }

  async function deployContract(name) {
    const nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
    console.log(`📦 Deploying ${name}... (nonce=${nonce})`);
    const Factory = await ethers.getContractFactory(name);
    const contract = await Factory.deploy(buildTxOptions({ nonce }));
    console.log(`${name} tx:`, contract.deploymentTransaction().hash);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`✅ ${name} deployed at:`, address);
    return address;
  }

  const validatorsAddress = await deployContract("Validators");

  // Delay untuk menghindari "replacement transaction underpriced"
  console.log("⏳ Waiting before deploying next contract...");
  await new Promise((res) => setTimeout(res, 5000));

  const slashAddress = await deployContract("Slash");

  // === Save deployment info ===
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    contracts: {
      Validators: validatorsAddress,
      Slash: slashAddress,
    },
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const deploymentFile = path.join(deploymentsDir, `${network.name}-${network.chainId}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n📊 Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("\n🎉 Deployment completed successfully!");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ Deployment failed:", err);
    process.exit(1);
  });
}

module.exports = main;
