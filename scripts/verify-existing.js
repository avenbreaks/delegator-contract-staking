// scripts/verify-existing.js
async function main() {
  const contractAddress = "0x0000000000000000000000000000000000001000";
  
  await hre.run("verify:verify", {
    address: contractAddress,
    constructorArguments: [], // Sesuaikan jika ada constructor args
  });
}