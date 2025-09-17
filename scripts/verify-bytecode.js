// scripts/verify-bytecode.js
// Script to verify that compiled contracts don't contain PUSH0 opcode (0x5f)
// which is incompatible with pre-Shanghai Ethereum nodes

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

async function main() {
  console.log(colors.cyan + "\n🔍 Bytecode Verification Tool" + colors.reset);
  console.log("Checking for PUSH0 opcode (0x5f) compatibility with pre-Shanghai EVM\n");
  console.log("=" + "=".repeat(70) + "\n");

  // Get all contract artifacts
  const artifactsPath = path.join(__dirname, "../artifacts/contracts");
  
  if (!fs.existsSync(artifactsPath)) {
    console.error(colors.red + "❌ No compiled contracts found. Run 'npx hardhat compile' first." + colors.reset);
    process.exit(1);
  }

  const results = [];
  const contractsToCheck = [
    "Validators.sol/Validators.json",
    "Slash.sol/Slash.json",
    "System.sol/System.json" // Even though abstract, we check it
  ];

  for (const contractPath of contractsToCheck) {
    const fullPath = path.join(artifactsPath, contractPath);
    
    if (fs.existsSync(fullPath)) {
      const artifact = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const contractName = artifact.contractName;
      
      console.log(colors.blue + `Checking ${contractName}...` + colors.reset);
      
      const result = await checkContract(artifact);
      results.push({
        name: contractName,
        ...result
      });
      
      // Print result immediately
      if (result.hasPush0) {
        console.log(colors.red + `  ❌ PUSH0 opcode detected!` + colors.reset);
        console.log(`     Locations: ${result.push0Locations.slice(0, 5).join(", ")}${result.push0Locations.length > 5 ? "..." : ""}`);
      } else if (result.suspicious) {
        console.log(colors.yellow + `  ⚠️  Contains "5f" but might not be PUSH0 opcode` + colors.reset);
        console.log(`     Suspicious locations: ${result.suspiciousLocations.slice(0, 5).join(", ")}${result.suspiciousLocations.length > 5 ? "..." : ""}`);
      } else {
        console.log(colors.green + `  ✅ Compatible with pre-Shanghai EVM` + colors.reset);
      }
      
      // Additional info
      console.log(`     Bytecode size: ${result.bytecodeSize} bytes`);
      console.log(`     Deployed size: ${result.deployedSize} bytes`);
      console.log(`     Compiler: Solidity ${artifact.metadata ? JSON.parse(artifact.metadata).compiler.version : "unknown"}`);
      console.log();
    } else {
      console.log(colors.yellow + `⚠️  ${contractPath} not found` + colors.reset);
    }
  }

  // Summary
  console.log("\n" + "=" + "=".repeat(70));
  console.log(colors.cyan + "\n📊 SUMMARY" + colors.reset);
  console.log("=" + "=".repeat(70) + "\n");

  const incompatible = results.filter(r => r.hasPush0);
  const suspicious = results.filter(r => r.suspicious && !r.hasPush0);
  const compatible = results.filter(r => !r.hasPush0 && !r.suspicious);

  if (incompatible.length > 0) {
    console.log(colors.red + `❌ Incompatible contracts (${incompatible.length}):` + colors.reset);
    incompatible.forEach(c => console.log(`   - ${c.name}`));
    console.log();
  }

  if (suspicious.length > 0) {
    console.log(colors.yellow + `⚠️  Suspicious contracts (${suspicious.length}):` + colors.reset);
    suspicious.forEach(c => console.log(`   - ${c.name}`));
    console.log();
  }

  if (compatible.length > 0) {
    console.log(colors.green + `✅ Compatible contracts (${compatible.length}):` + colors.reset);
    compatible.forEach(c => console.log(`   - ${c.name}`));
    console.log();
  }

  // Recommendations
  if (incompatible.length > 0) {
    console.log(colors.red + "\n⚠️  RECOMMENDATIONS:" + colors.reset);
    console.log("1. Ensure you're using Solidity 0.8.19 or lower");
    console.log("2. Set evmVersion to 'istanbul' or 'berlin' in hardhat.config.js");
    console.log("3. Recompile with: npx hardhat clean && npx hardhat compile");
    console.log("4. If using OpenZeppelin, ensure version compatibility");
    
    // Check current config
    console.log("\n" + colors.cyan + "Current Configuration:" + colors.reset);
    checkCurrentConfig();
  } else if (suspicious.length > 0) {
    console.log(colors.yellow + "\n⚠️  Some contracts contain '5f' in bytecode." + colors.reset);
    console.log("This might be data, not PUSH0 opcode. Deploy to testnet first to verify.");
  } else {
    console.log(colors.green + "\n✅ All contracts are compatible with pre-Shanghai EVM!" + colors.reset);
    console.log("You can safely deploy to networks running older Geth versions.");
  }

  // Save report
  const reportPath = path.join(__dirname, "../bytecode-verification-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // Exit with appropriate code
  process.exit(incompatible.length > 0 ? 1 : 0);
}

function checkContract(artifact) {
  const bytecode = artifact.bytecode;
  const deployedBytecode = artifact.deployedBytecode;
  
  const result = {
    hasPush0: false,
    suspicious: false,
    push0Locations: [],
    suspiciousLocations: [],
    bytecodeSize: bytecode.length / 2 - 1, // Remove 0x, divide by 2
    deployedSize: deployedBytecode.length / 2 - 1
  };

  // Check both creation and deployed bytecode
  const push0InBytecode = findPush0Opcodes(bytecode);
  const push0InDeployed = findPush0Opcodes(deployedBytecode);
  
  if (push0InBytecode.definite.length > 0 || push0InDeployed.definite.length > 0) {
    result.hasPush0 = true;
    result.push0Locations = [
      ...push0InBytecode.definite.map(loc => `bytecode:${loc}`),
      ...push0InDeployed.definite.map(loc => `deployed:${loc}`)
    ];
  }
  
  if (push0InBytecode.suspicious.length > 0 || push0InDeployed.suspicious.length > 0) {
    result.suspicious = true;
    result.suspiciousLocations = [
      ...push0InBytecode.suspicious.map(loc => `bytecode:${loc}`),
      ...push0InDeployed.suspicious.map(loc => `deployed:${loc}`)
    ];
  }
  
  return result;
}

function findPush0Opcodes(bytecode) {
  const result = {
    definite: [],
    suspicious: []
  };
  
  if (!bytecode || bytecode === "0x") {
    return result;
  }
  
  // Remove 0x prefix
  const code = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  
  // Parse bytecode to identify actual opcodes vs data
  let i = 0;
  while (i < code.length) {
    const byte = code.substr(i, 2);
    
    if (byte === "5f") {
      // Found potential PUSH0
      // Try to determine if it's an opcode or data
      if (isLikelyOpcode(code, i)) {
        result.definite.push(i / 2); // Position in bytes
      } else {
        result.suspicious.push(i / 2);
      }
    }
    
    // Skip PUSH operations and their data
    const opcode = parseInt(byte, 16);
    if (opcode >= 0x60 && opcode <= 0x7f) {
      // PUSH1 to PUSH32
      const dataBytes = (opcode - 0x60 + 1);
      i += 2 + (dataBytes * 2); // Skip opcode + data
    } else {
      i += 2;
    }
  }
  
  return result;
}

function isLikelyOpcode(code, position) {
  // Heuristic to determine if a byte is likely an opcode
  // This is not 100% accurate but helps reduce false positives
  
  // Check if it appears after a valid opcode sequence
  if (position > 0) {
    const prevByte = code.substr(position - 2, 2);
    const prevOpcode = parseInt(prevByte, 16);
    
    // If previous byte is a STOP, RETURN, REVERT, or INVALID, less likely to be opcode
    if (prevOpcode === 0x00 || prevOpcode === 0xf3 || prevOpcode === 0xfd || prevOpcode === 0xfe) {
      return false;
    }
  }
  
  // Check context around the potential PUSH0
  if (position < code.length - 2) {
    const nextByte = code.substr(position + 2, 2);
    const nextOpcode = parseInt(nextByte, 16);
    
    // Common opcodes that might follow PUSH0
    const validFollowers = [
      0x01, 0x02, 0x03, 0x04, // ADD, MUL, SUB, DIV
      0x10, 0x11, 0x12, 0x13, // LT, GT, SLT, SGT
      0x14, 0x15, 0x16, // EQ, ISZERO, AND
      0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, // POP, MLOAD, MSTORE, etc.
      0x80, 0x81, 0x82, // DUP1, DUP2, DUP3
      0x90, 0x91, 0x92  // SWAP1, SWAP2, SWAP3
    ];
    
    if (validFollowers.includes(nextOpcode)) {
      return true;
    }
  }
  
  // Default to suspicious if we can't determine
  return false;
}

function checkCurrentConfig() {
  try {
    const configPath = path.join(__dirname, "../hardhat.config.js");
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf8");
      
      // Check Solidity version
      const versionMatch = configContent.match(/version:\s*["']([^"']+)["']/);
      if (versionMatch) {
        const version = versionMatch[1];
        console.log(`  Solidity version: ${version}`);
        
        if (version >= "0.8.20") {
          console.log(colors.red + "    ⚠️  Version 0.8.20+ uses PUSH0 by default!" + colors.reset);
        }
      }
      
      // Check EVM version
      const evmMatch = configContent.match(/evmVersion:\s*["']([^"']+)["']/);
      if (evmMatch) {
        console.log(`  EVM version: ${evmMatch[1]}`);
      } else {
        console.log(`  EVM version: default (latest)`);
        console.log(colors.yellow + "    ⚠️  Consider setting to 'istanbul' or 'berlin'" + colors.reset);
      }
      
      // Check optimizer
      const optimizerMatch = configContent.match(/optimizer:\s*{[^}]*enabled:\s*(true|false)/);
      if (optimizerMatch) {
        console.log(`  Optimizer: ${optimizerMatch[1]}`);
      }
    }
  } catch (error) {
    console.log("  Could not read hardhat.config.js");
  }
}

// Run the verification
main().catch((error) => {
  console.error(colors.red + "\n❌ Verification failed:" + colors.reset, error);
  process.exitCode = 1;
});