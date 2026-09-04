// Minimal ABIs — only the functions the webapp calls.
export const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export const STAKING_ABI = [
  "function minOperatorStake() view returns (uint256)",
  "function registerOperator(bytes32 nodeId, uint256 amount)",
  "function delegate(address operator, uint256 amount)",
  "function operators(address) view returns (bool registered, uint256 selfStake, uint256 delegatedStake, bytes32 nodeId)",
];

export const DISTRIBUTOR_ABI = [
  "function claim(address account, uint256 cumulativeAmount, bytes32[] proof)",
  "function claimed(address) view returns (uint256)",
  "function fund(uint256 amount)",
  "function poolBalance() view returns (uint256)",
];

// NodeRelic — the ERC721 itself. `multiplierFor` returns the *best* multiplier
// an address holds, not the sum, which is the same call settlement makes.
export const RELIC_ABI = [
  "function available(uint256 tokenId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function multiplierFor(address account) view returns (uint256)",
  "function minted() view returns (uint256)",
];

// RelicSale — burn and mint. The error fragments matter: the contract goes out
// of its way to revert with a readable reason, and without them here ethers
// surfaces an undecodable blob instead of "that pass was just claimed".
export const RELIC_SALE_ABI = [
  "function availability() view returns (bool[50])",
  "function priceOf(uint256 tokenId) pure returns (uint256)",
  "function buy(uint256 tokenId, uint256 maxPriceWei)",
  "function open() view returns (bool)",
  "function totalBurned() view returns (uint256)",
  "error SaleClosed()",
  "error NotAvailable(uint256 tokenId)",
  "error PriceChanged(uint256 expectedWei, uint256 actualWei)",
  "error InsufficientBalance(uint256 has, uint256 needs)",
  "error InsufficientAllowance(uint256 has, uint256 needs)",
];
