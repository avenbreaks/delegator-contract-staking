const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// List network yang mau diverifikasi
const networks = [
  { name: "base-sepolia", chainId: 84532 },
  { name: "arbitrum-sepolia", chainId: 421614 },
  { name: "sepolia", chainId: 11155111 },
  { name: "optimism-sepolia", chainId: 11155420 },
];

async function main() {
  console.log("🌍 Starting batch verification...");
  for (const net of networks) {
    const filePath = path.join(__dirname, "..", "deployments", `${net.name}-${net.chainId}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Deployment file not found for ${net.name}`);
      continue;
    }

    const deployment = JSON.parse(fs.readFileSync(filePath, "utf8"));
    console.log(`\n🔍 Verifying on ${net.name} (ChainId: ${net.chainId})`);

    for (const [contractName, contractAddress] of Object.entries(deployment.contracts)) {
      try {
        console.log(`📦 Verifying ${contractName} at ${contractAddress}`);
        const cmd = `
          npx hardhat verify --network ${net.name} \
          --contract "contracts/${contractName}.sol:${contractName}" \
          ${contractAddress}
        `;
        console.log("➡️ Running:", cmd);
        execSync(cmd, { stdio: "inherit" });
        console.log(`✅ ${contractName} verified on ${net.name}`);
      } catch (err) {
        console.error(`❌ Failed to verify ${contractName} on ${net.name}`);
      }
    }
  }
  console.log("\n🎉 Batch verification finished!");
}

main().catch((err) => {
  console.error("❌ Batch verification error:", err);
  process.exit(1);
});
