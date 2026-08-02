// Wallet + contract wiring via ethers v6. All calls no-op gracefully if a
// wallet or contract address is missing, so the app still runs in demo mode.
import { BrowserProvider, Contract, encodeBytes32String, parseUnits } from "ethers";
import { config } from "../config";
import { TOKEN_ABI, STAKING_ABI, DISTRIBUTOR_ABI } from "./abi";

export function hasWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connect() {
  if (!hasWallet()) throw new Error("No wallet found. Install MetaMask.");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

function contract(addr, abi, signer) {
  if (!addr) return null;
  return new Contract(addr, abi, signer);
}

export async function getTokenBalance(signer, address) {
  const t = contract(config.contracts.token, TOKEN_ABI, signer);
  if (!t) return null;
  return t.balanceOf(address);
}

// Claim accrued THKT using the coordinator-provided cumulative amount + proof.
export async function claimRewards(signer, address, cumulativeAmount, proof) {
  const d = contract(config.contracts.distributor, DISTRIBUTOR_ABI, signer);
  if (!d) throw new Error("Distributor address not configured");
  const tx = await d.claim(address, cumulativeAmount, proof);
  return tx.wait();
}

// Bond THKT to register as an operator (approve -> registerOperator).
export async function registerOperator(signer, nodeId, amountThkt) {
  const amount = parseUnits(String(amountThkt), 18);
  const token = contract(config.contracts.token, TOKEN_ABI, signer);
  const staking = contract(config.contracts.staking, STAKING_ABI, signer);
  if (!token || !staking) throw new Error("Contracts not configured");
  await (await token.approve(config.contracts.staking, amount)).wait();
  const tx = await staking.registerOperator(encodeBytes32String(nodeId.slice(0, 31)), amount);
  return tx.wait();
}

// Delegate THKT to an operator (approve -> delegate).
export async function delegate(signer, operator, amountThkt) {
  const amount = parseUnits(String(amountThkt), 18);
  const token = contract(config.contracts.token, TOKEN_ABI, signer);
  const staking = contract(config.contracts.staking, STAKING_ABI, signer);
  if (!token || !staking) throw new Error("Contracts not configured");
  await (await token.approve(config.contracts.staking, amount)).wait();
  const tx = await staking.delegate(operator, amount);
  return tx.wait();
}
