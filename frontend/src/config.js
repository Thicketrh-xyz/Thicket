// Thicket frontend config. Fill addresses after deploying to Robinhood Chain.
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 46630); // Robinhood Chain Testnet

export const config = {
  // Dev: "/api" is proxied to localhost:8000 (vite.config.js).
  // Prod: set VITE_COORDINATOR_URL to the deployed coordinator (Railway) URL,
  // or leave "/api" and add a Vercel rewrite (see vercel.json).
  coordinatorBase: import.meta.env.VITE_COORDINATOR_URL || "/api",
  chain: {
    chainId: CHAIN_ID,
    chainIdHex: "0x" + CHAIN_ID.toString(16), // 46630 -> 0xb626
    chainName: "Robinhood Chain Testnet",
    rpcUrls: [import.meta.env.VITE_RPC_URL || "https://rpc.testnet.chain.robinhood.com/rpc"],
    blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  contracts: {
    token: import.meta.env.VITE_TOKEN_ADDRESS || "",
    staking: import.meta.env.VITE_STAKING_ADDRESS || "",
    distributor: import.meta.env.VITE_DISTRIBUTOR_ADDRESS || "",
  },
};

export const explorerTx = (hash) => `${config.chain.blockExplorerUrls[0]}/tx/${hash}`;
export const explorerAddr = (addr) => `${config.chain.blockExplorerUrls[0]}/address/${addr}`;

// True only once contracts are deployed and their addresses are in the env.
export const CONTRACTS_LIVE = Boolean(
  config.contracts.token && config.contracts.staking && config.contracts.distributor
);

// When no wallet/coordinator/contracts are wired, the app runs in demo mode
// so it still renders something real-looking for screenshots and design.
export const DEMO = {
  address: "0x1a642f0E3c3aF545E7AcBD38b0251b3F0F6B0C0a",
  online: true,
  contributionMinutes: 1284.6,
  challengesPassed: 42,
  earnings: 1284.6,
  networkTflops: 22864,
  activeNodes: 282,
  tasksExecuted: 633703,
};
