// Wallet + contract wiring via ethers v6. All calls no-op gracefully if a
// wallet or contract address is missing, so the app still runs in demo mode.
import { BrowserProvider, Contract, JsonRpcProvider, id, parseUnits } from "ethers";
import { config } from "../config";
import { TOKEN_ABI, STAKING_ABI, DISTRIBUTOR_ABI } from "./abi";

export function hasWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

// Ensure the wallet is on Robinhood Chain — switch, or add it if unknown.
export async function ensureNetwork() {
  if (!hasWallet()) return;
  const { chainIdHex, chainName, rpcUrls, blockExplorerUrls, nativeCurrency } = config.chain;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (e) {
    // 4902 = chain not added to the wallet yet
    if (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902)) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: chainIdHex, chainName, rpcUrls, blockExplorerUrls, nativeCurrency }],
      });
    } else {
      throw e;
    }
  }
}

// Ask the wallet to forget this site. Not all wallets implement revoke, so the
// app always clears its own session regardless of the outcome.
export async function disconnect() {
  try {
    await window.ethereum?.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* wallet doesn't support revoke — clearing local session is enough */
  }
}

export async function connect() {
  if (!hasWallet()) throw new Error("No wallet found. Install MetaMask.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureNetwork();
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

function contract(addr, abi, signer) {
  if (!addr) return null;
  return new Contract(addr, abi, signer);
}

// Read-only provider over the public RPC. Every other read here takes a signer,
// which is fine inside the portal but wrong for a public page: the node list has
// to render for a visitor with no wallet installed at all.
export function publicProvider() {
  try {
    return new JsonRpcProvider(config.chain.rpcUrls[0], config.chain.chainId);
  } catch {
    return null;
  }
}

// On-chain `claimed(address)` for a page of operators, so the reader can check
// the coordinator's numbers against the contract instead of trusting them.
//
// Chunked rather than one big Promise.all: this is a public RPC and fifty
// simultaneous eth_calls is how you get rate-limited. A failed chunk yields
// nulls for those rows — the column renders as unknown, the page still works.
export async function getClaimedFor(addresses, distributorAddr) {
  const out = new Map();
  const provider = publicProvider();
  if (!provider || !distributorAddr || !addresses.length) return out;
  const d = new Contract(distributorAddr, DISTRIBUTOR_ABI, provider);

  const CHUNK = 8;
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK);
    const vals = await Promise.all(
      chunk.map((a) => d.claimed(a).catch(() => null))
    );
    chunk.forEach((a, j) => out.set(a.toLowerCase(), vals[j]));
  }
  return out;
}

export async function getTokenBalance(signer, address) {
  const t = contract(config.contracts.token, TOKEN_ABI, signer);
  if (!t) return null;
  return t.balanceOf(address);
}

// On-chain rewards state: THKT wallet balance + total claimed-to-date.
export async function getRewardsInfo(signer, address) {
  const d = contract(config.contracts.distributor, DISTRIBUTOR_ABI, signer);
  const t = contract(config.contracts.token, TOKEN_ABI, signer);
  if (!d || !t) return null;
  const [claimed, balance] = await Promise.all([d.claimed(address), t.balanceOf(address)]);
  return { claimed, balance }; // both bigint (wei)
}

// One read for everything the Stake panel needs: THKT balance, the min bond,
// current operator status, and how much THKT is already approved.
export async function getStakingInfo(signer, address) {
  const token = contract(config.contracts.token, TOKEN_ABI, signer);
  const staking = contract(config.contracts.staking, STAKING_ABI, signer);
  if (!token || !staking) return null;
  const [balance, minStake, op, allowance] = await Promise.all([
    token.balanceOf(address),
    staking.minOperatorStake(),
    staking.operators(address),
    token.allowance(address, config.contracts.staking),
  ]);
  return {
    balance,
    minStake,
    allowance,
    registered: op.registered,
    selfStake: op.selfStake,
    delegatedStake: op.delegatedStake,
  };
}

// Claim accrued THKT using the coordinator-provided cumulative amount + proof.
export async function claimRewards(signer, address, cumulativeAmount, proof) {
  const d = contract(config.contracts.distributor, DISTRIBUTOR_ABI, signer);
  if (!d) throw new Error("Distributor address not configured");
  const tx = await d.claim(address, cumulativeAmount, proof);
  return tx.wait();
}

// Approve THKT for the staking contract only if the current allowance is short.
// onStatus reports each step so the UI can show "Approving…" then "Bonding…".
async function approveIfNeeded(token, owner, amount, onStatus) {
  const allowance = await token.allowance(owner, config.contracts.staking);
  if (allowance < amount) {
    onStatus("Approving THKT…");
    await (await token.approve(config.contracts.staking, amount)).wait();
  }
}

// Bond THKT to register as an operator. nodeId is hashed to bytes32 the same
// way the node client does (keccak256), so a UI-bonded operator matches its node.
export async function registerOperator(signer, nodeId, amountThkt, onStatus = () => {}) {
  const amount = parseUnits(String(amountThkt), 18);
  const token = contract(config.contracts.token, TOKEN_ABI, signer);
  const staking = contract(config.contracts.staking, STAKING_ABI, signer);
  if (!token || !staking) throw new Error("Contracts not configured");
  await approveIfNeeded(token, await signer.getAddress(), amount, onStatus);
  onStatus("Bonding…");
  const receipt = await (await staking.registerOperator(id(nodeId), amount)).wait();
  return receipt.hash;
}

// Pay THKT for a compute job — the payment funds the rewards pool via fund().
export async function payForCompute(signer, amountThkt, onStatus = () => {}) {
  const amount = parseUnits(String(amountThkt), 18);
  const token = contract(config.contracts.token, TOKEN_ABI, signer);
  const dist = contract(config.contracts.distributor, DISTRIBUTOR_ABI, signer);
  if (!token || !dist) throw new Error("Contracts not configured");
  const owner = await signer.getAddress();
  const allowance = await token.allowance(owner, config.contracts.distributor);
  if (allowance < amount) {
    onStatus("Approving THKT…");
    await (await token.approve(config.contracts.distributor, amount)).wait();
  }
  onStatus("Paying into the pool…");
  const receipt = await (await dist.fund(amount)).wait();
  return receipt.hash;
}

export async function getPoolBalance(signer) {
  const dist = contract(config.contracts.distributor, DISTRIBUTOR_ABI, signer);
  if (!dist) return null;
  return dist.poolBalance();
}

// Delegate THKT to an operator (approve -> delegate).
export async function delegate(signer, operator, amountThkt, onStatus = () => {}) {
  const amount = parseUnits(String(amountThkt), 18);
  const token = contract(config.contracts.token, TOKEN_ABI, signer);
  const staking = contract(config.contracts.staking, STAKING_ABI, signer);
  if (!token || !staking) throw new Error("Contracts not configured");
  await approveIfNeeded(token, await signer.getAddress(), amount, onStatus);
  onStatus("Delegating…");
  const receipt = await (await staking.delegate(operator, amount)).wait();
  return receipt.hash;
}
