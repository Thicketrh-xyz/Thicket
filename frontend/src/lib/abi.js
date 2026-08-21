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
