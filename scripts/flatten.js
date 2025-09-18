const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("📝 Flattening contracts for manual verification...\n");

  // Contracts yang mau diflatten
  const contracts = [
    "contracts/System.sol",
    "contracts/Validators.sol",
    "contracts/Slash.sol"
  ];

  const outDir = path.join(__dirname, "../verify");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  contracts.forEach((contractPath) => {
    const name = path.basename(contractPath, ".sol");
    const outFile = path.join(outDir, `${name}_flat.sol`);

    console.log(`📌 Flattening ${contractPath} → ${outFile}`);
    try {
      const flattened = execSync(`npx hardhat flatten ${contractPath}`, {
        encoding: "utf8"
      });

      // Bersihkan SPDX license duplikat
      const cleaned = flattened.replace(/SPDX-License-Identifier:/g, "SPDX-License-Identifier (flattened):");

      fs.writeFileSync(outFile, cleaned);
      console.log(`✅ Done: ${outFile}\n`);
    } catch (err) {
      console.error(`❌ Failed to flatten ${contractPath}:`, err.message);
    }
  });

  console.log("🎉 All contracts flattened!");
  console.log(`\n👉 Upload files in ./verify/ to explorer.oorthnexus.xyz for manual verification.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
