require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.19", // CRITICAL: Use 0.8.19, NOT 0.8.20
        settings: {
            optimizer: {
                enabled: true,
                runs: 200, // Lower runs for smaller bytecode
                details: {
                    yul: true,
                    yulDetails: {
                        stackAllocation: true,
                        optimizerSteps: "dhfoDgvulfnTUtnIf"
                    }
                }
            },
            evmVersion: "istanbul", // IMPORTANT: Target Istanbul EVM
            metadata: {
                bytecodeHash: "none" // Reduce bytecode size
            }
        }
    }, networks: {
        hardhat: {
            accounts: {
                count: 10,
                accountsBalance: "10000000000000000000000" // 10,000 ETH per account
            }
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 1337,
            gasPrice: 20000000000,
            gas: 30000000
        },
        oxt: {
            url: "https://rpc-data.oorthnexus.xyz",
            chainId: 982025,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            gas: 6721975,
            gasPrice: 20000000000,
        }
    },
    etherscan: {
        apiKey: {
            oxt: 'process.env.ETHERSCAN_API_KEY'
        },
        customChains: [
            {
                network: "oxt",
                chainId: 982025,
                urls: {
                    apiURL: "https://explorer.oorthnexus.xyz/api",
                    browserURL: "https://explorer.oorthnexus.xyz"
                }
            }
        ],
    },

    // Gas reporter configuration
    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
        gasPrice: 20,
        outputFile: "gas-report.txt",
        noColors: true
    },

    // Path configurations to match current structure
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },

    // Mocha timeout
    mocha: {
        timeout: 100000
    }
};
