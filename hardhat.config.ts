import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

dotenv.config();

function loadAccounts() {
  return process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];
}

const config: HardhatUserConfig = {
  solidity: "0.8.9",
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: loadAccounts(),
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: loadAccounts(),
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: loadAccounts(),
    },
    bsctest: {
      url: `https://data-seed-prebsc-1-s2.binance.org:8545/`,
      accounts: loadAccounts(),
    },
    bsc: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts: loadAccounts(),
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: loadAccounts(),
    },
    mumbai: {
      url: `https://rpc-mumbai.maticvigil.com/`,
      accounts: loadAccounts(),
      gasPrice: 8000000000, // We need to have a number here. See issue: https://github.com/nomiclabs/hardhat/issues/1828
    },
    polygon: {
      url: `https://polygon-rpc.com`,
      accounts: loadAccounts(),
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
