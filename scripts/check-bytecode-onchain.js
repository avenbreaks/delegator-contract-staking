// scripts/check-bytecode-genesis.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

function normalizeAddr(a) {
  if (!a) return "";
  return a.toLowerCase().replace(/^0x/, "");
}

function findBestCodeInAlloc(allocEntry) {
  // allocEntry can be string or object. If object, choose the longest hex-string property.
  if (!allocEntry) return null;
  if (typeof allocEntry === "string") {
    return allocEntry.startsWith("0x") ? allocEntry : "0x" + allocEntry;
  }
  let best = null;
  for (const [k, v] of Object.entries(allocEntry)) {
    if (typeof v === "string" && v.startsWith("0x")) {
      if (!best || v.length > best.length) best = v;
    }
  }
  return best;
}

async function main() {
  const root = path.join(__dirname, "..");
  const genesisPath = path.join(root, "genesis.json");

  if (!fs.existsSync(genesisPath)) {
    console.error("❌ genesis.json not found at", genesisPath);
    process.exit(1);
  }

  const genesis = JSON.parse(fs.readFileSync(genesisPath, "utf8"));
  const alloc = genesis.alloc || genesis.Alloc || genesis.allocations || genesis.accounts;
  if (!alloc) {
    console.error("❌ Could not find 'alloc' section in genesis.json");
    process.exit(1);
  }

  // Build normalized map of genesis alloc keys -> entry
  const genesisMap = {};
  for (const rawKey of Object.keys(alloc)) {
    const normalized = normalizeAddr(rawKey);
    genesisMap[normalized] = alloc[rawKey];
  }

  // Determine current network and load only the matching deployment file(s)
  const network = await ethers.provider.getNetwork();
  const deploymentsDir = path.join(root, "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    console.error("❌ deployments/ directory not found");
    process.exit(1);
  }

  const files = fs.readdirSync(deploymentsDir).filter((f) => f.endsWith(".json"));
  const deployments = files.map((f) => {
    try {
      return {
        file: f,
        data: JSON.parse(fs.readFileSync(path.join(deploymentsDir, f), "utf8")),
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  // Filter to deployments that match the current network name or chainId
  const targetDeployments = deployments.filter(d =>
    (d.data.network && d.data.network === network.name) ||
    (d.data.chainId && String(d.data.chainId) === String(network.chainId))
  );

  if (targetDeployments.length === 0) {
    console.warn("⚠️ No deployment files found for current network:", network.name, network.chainId);
    console.log("Available deployment files:", files.join(", "));
    process.exit(0);
  }

  console.log("🔍 Checking bytecode on network:", network.name, `(chainId ${network.chainId})`);
  const report = {
    network: network.name,
    chainId: network.chainId,
    checks: [],
    summary: { match: 0, mismatch: 0, not_in_genesis: 0, no_onchain_code: 0 },
  };

  for (const d of targetDeployments) {
    const deployment = d.data;
    console.log(`\n📂 Deployment file: ${d.file} (network: ${deployment.network} chainId: ${deployment.chainId})`);

    for (const [contractName, contractAddress] of Object.entries(deployment.contracts || {})) {
      console.log(`  🔎 ${contractName} at ${contractAddress}`);
      const normalizedAddr = normalizeAddr(contractAddress);

      // find genesis alloc entry (exact or by fallback endsWith)
      let allocEntry = genesisMap[normalizedAddr];
      if (!allocEntry) {
        // fallback: try to find keys that endWith the address (some genesis use different padding)
        const keys = Object.keys(genesisMap);
        const endsWithMatches = keys.filter(k => k.endsWith(normalizedAddr));
        if (endsWithMatches.length === 1) {
          allocEntry = genesisMap[endsWithMatches[0]];
        } else if (endsWithMatches.length > 1) {
          // pick the exact length match if found, otherwise first
          const exactLen = endsWithMatches.find(k => k.length === normalizedAddr.length);
          allocEntry = genesisMap[exactLen || endsWithMatches[0]];
        }
      }

      if (!allocEntry) {
        console.log(`    ⚠️ No code found in genesis.json for ${contractAddress}`);
        report.checks.push({
          contract: contractName,
          address: contractAddress,
          status: "NOT_IN_GENESIS",
        });
        report.summary.not_in_genesis++;
        continue;
      }

      // Extract expected runtime code from alloc entry
      const expectedCode = findBestCodeInAlloc(allocEntry);
      if (!expectedCode) {
        console.log(`    ⚠️ Genesis alloc entry found but no code field detected for ${contractAddress}`);
        report.checks.push({
          contract: contractName,
          address: contractAddress,
          status: "NO_GENESIS_CODE_FIELD",
        });
        report.summary.not_in_genesis++;
        continue;
      }

      // get on-chain runtime code
      const onChainCode = (await ethers.provider.getCode(contractAddress)).toLowerCase();
      if (!onChainCode || onChainCode === "0x") {
        console.log(`    ❌ No on-chain runtime code found at ${contractAddress}`);
        report.checks.push({
          contract: contractName,
          address: contractAddress,
          status: "NO_ONCHAIN_CODE",
          expectedLength: expectedCode.length,
        });
        report.summary.no_onchain_code++;
        continue;
      }

      if (onChainCode === expectedCode.toLowerCase()) {
        console.log("    ✅ Bytecode MATCHES genesis.json");
        report.checks.push({
          contract: contractName,
          address: contractAddress,
          status: "MATCH",
          length: onChainCode.length,
        });
        report.summary.match++;
      } else {
        console.log("    ❌ Bytecode MISMATCH!");
        console.log("       On-chain (prefix):", onChainCode.slice(0, 40) + "...");
        console.log("       Genesis  (prefix):", expectedCode.slice(0, 40) + "...");
        report.checks.push({
          contract: contractName,
          address: contractAddress,
          status: "MISMATCH",
          onChainLength: onChainCode.length,
          expectedLength: expectedCode.length,
        });
        report.summary.mismatch++;
      }
    }
  }

  // Save report
  const outDir = path.join(root, "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `bytecode-genesis-check-${network.name}-${network.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report written to: ${outFile}`);

  console.log("\n📊 Summary:", report.summary);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
