const axios = require('axios');

const BLOCKSCOUT_API_URL = "https://explorer.oorthnexus.xyz/api";
const CONTRACTS = {
    VALIDATORS: "0x0000000000000000000000000000000000001000",
    SLASH: "0x0000000000000000000000000000000000001001"
};

async function testAPI() {
    console.log("Testing Blockscout API for oorthnexus...");
    console.log("API URL:", BLOCKSCOUT_API_URL);
    
    // Test 1: Basic API connectivity
    console.log("\n1. Testing basic API connectivity...");
    try {
        const response = await axios.get(`${BLOCKSCOUT_API_URL}?module=stats&action=eth_supply`, {
            timeout: 10000
        });
        console.log("✅ API is responding");
        console.log("Response:", response.data);
    } catch (error) {
        console.log("❌ API connectivity test failed");
        console.log("Error:", error.message);
        if (error.response) {
            console.log("Status:", error.response.status);
            console.log("Data:", error.response.data);
        }
    }
    
    // Test 2: Check contract source code endpoint
    console.log("\n2. Testing contract source code endpoint...");
    for (const [name, address] of Object.entries(CONTRACTS)) {
        try {
            const response = await axios.get(
                `${BLOCKSCOUT_API_URL}?module=contract&action=getsourcecode&address=${address}`,
                { timeout: 10000 }
            );
            console.log(`✅ ${name} contract query successful`);
            console.log("Response:", JSON.stringify(response.data, null, 2));
        } catch (error) {
            console.log(`❌ ${name} contract query failed`);
            console.log("Error:", error.message);
        }
    }
    
    // Test 3: Check available API modules
    console.log("\n3. Testing different API modules...");
    const testEndpoints = [
        "?module=stats&action=tokensupply",
        "?module=account&action=balance&address=" + CONTRACTS.VALIDATORS,
        "?module=proxy&action=eth_blockNumber"
    ];
    
    for (const endpoint of testEndpoints) {
        try {
            const response = await axios.get(`${BLOCKSCOUT_API_URL}${endpoint}`, {
                timeout: 5000
            });
            console.log(`✅ Endpoint ${endpoint} works`);
            console.log("Sample response:", response.data);
        } catch (error) {
            console.log(`❌ Endpoint ${endpoint} failed`);
            console.log("Error:", error.message);
        }
    }
}

async function checkExplorerWeb() {
    console.log("\n4. Testing explorer web interface...");
    try {
        const response = await axios.get("https://explorer.oorthnexus.xyz", {
            timeout: 10000
        });
        console.log("✅ Explorer web interface is accessible");
        console.log("Status:", response.status);
    } catch (error) {
        console.log("❌ Explorer web interface test failed");
        console.log("Error:", error.message);
    }
}

async function main() {
    console.log("=== oorthnexus Blockscout API Test ===\n");
    
    await testAPI();
    await checkExplorerWeb();
    
    console.log("\n=== Test Summary ===");
    console.log("If API tests fail, the verification might need to be done manually through the web interface.");
    console.log("Explorer URL: https://explorer.oorthnexus.xyz");
    console.log("Validators contract: https://explorer.oorthnexus.xyz/address/" + CONTRACTS.VALIDATORS);
    console.log("Slash contract: https://explorer.oorthnexus.xyz/address/" + CONTRACTS.SLASH);
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Test failed:", error);
            process.exit(1);
        });
}

module.exports = { testAPI, checkExplorerWeb };