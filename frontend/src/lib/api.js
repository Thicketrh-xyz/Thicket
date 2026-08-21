// Coordinator API client. Returns null on failure so the UI can fall back to
// demo data instead of crashing.
import { config } from "../config";

async function get(path) {
  try {
    const r = await fetch(`${config.coordinatorBase}${path}`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Full claim table: { address: { cumulativeAmount, proof } }.
export function fetchClaims() {
  return get("/claims");
}

// Live status + earnings for one operator (dashboard polls this).
export function fetchNode(address) {
  return get(`/node/${address}`);
}

// Real network-wide stats for the landing page.
export function fetchStats() {
  return get("/stats");
}

// --- pay-for-compute ---
export function fetchComputePrice() {
  return get("/compute/price");
}

export async function submitJob(prompt, payer, paymentTx, paymentThkt) {
  try {
    const r = await fetch(`${config.coordinatorBase}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, payer, payment_tx: paymentTx, payment_thkt: paymentThkt }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function fetchJob(id) {
  return get(`/jobs/${id}`);
}

// This account's claim (amount + Merkle proof) for the on-chain claim tx.
export async function fetchClaimFor(address) {
  const claims = await fetchClaims();
  if (!claims) return null;
  const key = Object.keys(claims).find(
    (k) => k.toLowerCase() === address.toLowerCase()
  );
  return key ? claims[key] : null;
}
