const { execSync } = require("child_process");

const networks = ["base-sepolia", "arbitrum-sepolia", "sepolia", "optimism-sepolia"];

async function main() {
  console.log("🌍 Starting multi-network deployment...");
  console.log("Networks:", networks.join(", "));

  const results = [];

  for (const net of networks) {
    console.log(`\n🚀 Deploying to ${net}...`);
    try {
      execSync(`npx hardhat run scripts/deploy-simple.js --network ${net}`, {
        stdio: "inherit",
      });
      results.push({ network: net, status: "✅ Success" });
    } catch (err) {
      results.push({ network: net, status: "❌ Failed", error: err.message });
    }
  }

  console.log("\n📊 Deployment Summary:");
  console.log("==================================================");
  results.forEach((r) => {
    console.log(`${r.status} ${r.network}${r.error ? " - " + r.error : ""}`);
  });
  console.log("\n🎉 Multi-network deployment completed!");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ Script failed:", err);
    process.exit(1);
  });
}
