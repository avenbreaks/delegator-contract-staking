require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 50,
            },
            evmVersion: "istanbul",
            metadata: {
                bytecodeHash: "none"
            }
        }
    },
    networks: {
        oorthnexus: {
            url: "https://rpc-data.oorthnexus.xyz",
        },
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 11155111,
            gas: "auto",
            gasPrice: "auto",
            timeout: 60000,
        },
        "base-sepolia": {
            url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 84532,
            gas: "auto",
            gasPrice: "auto",
            timeout: 60000,
        },
        "optimism-sepolia": {
            url: process.env.OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.optimism.io",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 11155420,
            gas: "auto",
            gasPrice: "auto",
            timeout: 60000,
        },
        "arbitrum-sepolia": {
            url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 421614,
            gasPrice: "auto",
            gas: "auto",
        },
    },
    etherscan: {
        apiKey: {
            oorthnexus: 'empty',
            sepolia: process.env.ETHERSCAN_API_KEY,
            "base-sepolia": process.env.BASESCAN_API_KEY,
            "optimism-sepolia": process.env.OPTIMISM_API_KEY,
            "arbitrum-sepolia": process.env.ARBISCAN_API_KEY,
        },
        customChains: [
            {
                network: "base-sepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org"
                }
            },
            {
                network: "optimism-sepolia",
                chainId: 11155420,
                urls: {
                    apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
                    browserURL: "https://sepolia-optimism.etherscan.io"
                }
            },
            {
                network: "oorthnexus",
                chainId: 982025,
                urls: {
                    apiURL: "https://explorer.oorthnexus.xyz/api",
                    browserURL: "https://explorer.oorthnexus.xyz"
                }
            },
            {
                network: "arbitrum-sepolia",
                chainId: 421614,
                urls: {
                    apiURL: "https://api-sepolia.arbiscan.io/api",
                    browserURL: "https://sepolia.arbiscan.io"
                }
            }
        ]
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== true,
        currency: "USD",
        gasPrice: 20,
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    },
    mocha: {
        timeout: 60000, // 60 seconds
    },
};