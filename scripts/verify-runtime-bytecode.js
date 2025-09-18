// scripts/verify-runtime-bytecode.js
// Compare runtime bytecode across compiled, expected (bin-runtime), and on-chain deployed contracts

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// Color codes for CLI
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

async function main() {
  console.log(colors.cyan + "\n🔍 Runtime Bytecode Verification Tool" + colors.reset);

  const deploymentsDir = path.join(__dirname, "../deployments");
  const artifactsDir = path.join(__dirname, "../artifacts/contracts");
  const bytecodeDir = path.join(__dirname, "../bytecode");
  const report = [];

  // Mapping chainId -> RPC
  const RPCS = {
    "84532": "https://sepolia.base.org",
    "421614": "https://sepolia-rollup.arbitrum.io/rpc",
    "11155111": "https://ethereum-sepolia-rpc.publicnode.com",
    "11155420": "https://sepolia.optimism.io",
  };

  const deploymentFiles = fs.readdirSync(deploymentsDir).filter(f => f.endsWith(".json"));

  for (const file of deploymentFiles) {
    const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, file), "utf8"));
    const { chainId, network, contracts } = deployment;
    const rpcUrl = RPCS[chainId];
    if (!rpcUrl) {
      console.log(colors.yellow + `⚠️  No RPC configured for chain ${chainId} (${network})` + colors.reset);
      continue;
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    console.log(`\n📂 Network: ${network} (ChainId: ${chainId})`);

    for (const [name, address] of Object.entries(contracts)) {
      console.log(`  🔎 Checking ${name} at ${address}`);

      // Load compiled artifact
      const artifactPath = path.join(artifactsDir, `${name}.sol/${name}.json`);
      if (!fs.existsSync(artifactPath)) {
        console.log(colors.red + `    ❌ Artifact not found: ${artifactPath}` + colors.reset);
        continue;
      }
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      const compiledRuntime = artifact.deployedBytecode.replace(/^0x/, "");

      // Load expected runtime from bytecode folder
      const binRuntimePath = path.join(bytecodeDir, `${name}.bin-runtime`);
      if (!fs.existsSync(binRuntimePath)) {
        console.log(colors.red + `    ❌ Bin-runtime not found: ${binRuntimePath}` + colors.reset);
        continue;
      }
      const expectedRuntime = fs.readFileSync(binRuntimePath, "utf8").trim().replace(/^0x/, "");

      // Fetch on-chain runtime
      const onchainRuntime = (await provider.getCode(address)).replace(/^0x/, "");

      // Compare
      const matchesCompiled = onchainRuntime === compiledRuntime;
      const matchesExpected = onchainRuntime === expectedRuntime;
      const compiledVsExpected = compiledRuntime === expectedRuntime;

      if (matchesCompiled && matchesExpected && compiledVsExpected) {
        console.log(colors.green + `    ✅ Bytecode matches (compiled, expected, and on-chain)` + colors.reset);
      } else {
        console.log(colors.red + `    ❌ Bytecode mismatch!` + colors.reset);
        if (!matchesCompiled) console.log("      - On-chain vs Compiled differ");
        if (!matchesExpected) console.log("      - On-chain vs Expected differ");
        if (!compiledVsExpected) console.log("      - Compiled vs Expected differ");

        // Print small prefix of differences for debugging
        console.log("      on-chain  :", onchainRuntime.slice(0, 20) + "...");
        console.log("      compiled  :", compiledRuntime.slice(0, 20) + "...");
        console.log("      expected  :", expectedRuntime.slice(0, 20) + "...");
      }

      // Save to report
      report.push({
        network,
        chainId,
        contract: name,
        address,
        matches: { compiled: matchesCompiled, expected: matchesExpected, compiledVsExpected },
        sizes: {
          onchain: onchainRuntime.length / 2,
          compiled: compiledRuntime.length / 2,
          expected: expectedRuntime.length / 2,
        },
      });
    }
  }

  // Save report
  const reportPath = path.join(__dirname, "../reports/verify-runtime-bytecode-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);
}

main().catch(err => {
  console.error(colors.red + "\n❌ Verification script failed:" + colors.reset, err);
  process.exit(1);
});
