import { ethers } from "ethers";

// ganti dengan RPC provider (contoh: Infura, Alchemy, atau RPC publik)
const provider = new ethers.JsonRpcProvider("https://rpc-data.oorthnexus.xyz");

// daftar address yang ingin dicek
const addresses = [
  "0x0000000000000000000000000000000000001000", // Validator
  "0x0000000000000000000000000000000000001001", // Slash
  "0x0000000000000000000000000000000000000f01"  // Oracle
];

async function checkBytecode() {
  for (let addr of addresses) {
    const bytecode = await provider.getCode(addr);
    if (bytecode !== "0x") {
      console.log(`Address ${addr} memiliki kontrak (bytecode length: ${bytecode.length})`);
    } else {
      console.log(`Address ${addr} bukan kontrak (EOA)`);
    }
  }
}

checkBytecode();
