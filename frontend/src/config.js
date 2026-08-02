// Thicket frontend config. Fill addresses after deploying to Robinhood Chain.
export const config = {
  coordinatorBase: "/api", // proxied to the FastAPI coordinator in dev
  chain: {
    // Robinhood Chain — fill in real values before testnet.
    chainId: 0, // e.g. 0x... hex or decimal
    chainName: "Robinhood Chain",
    rpcUrls: [import.meta.env.VITE_RPC_URL || ""],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  },
  contracts: {
    token: import.meta.env.VITE_TOKEN_ADDRESS || "",
    staking: import.meta.env.VITE_STAKING_ADDRESS || "",
    distributor: import.meta.env.VITE_DISTRIBUTOR_ADDRESS || "",
  },
};

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
