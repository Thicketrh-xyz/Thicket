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

// The public node list. Everything the node page shows in one call.
export function fetchNodes({ limit = 50, offset = 0, sort = "earned", status = "all",
                             dir = "desc" } = {}) {
  return get(`/nodes?limit=${limit}&offset=${offset}&sort=${sort}&status=${status}&dir=${dir}`);
}

// Real network-wide stats for the landing page.
export function fetchStats() {
  return get("/stats");
}

// --- pay-for-compute ---
export function fetchComputePrice() {
  return get("/compute/price");
}

export async function submitJob(prompt, payer, paymentTx, paymentThkt, kind = "text", image = null, imagePixels = 0) {
  try {
    const r = await fetch(`${config.coordinatorBase}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, payer, payment_tx: paymentTx, payment_thkt: paymentThkt, kind, image, image_pixels: imagePixels }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// --- bulk: one payment, many items ---
export async function submitBatch(kind, instruction, items, payer, paymentTx, paymentThkt) {
  try {
    const r = await fetch(`${config.coordinatorBase}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind, instruction, payer,
        items: items.map((prompt) => ({ prompt })),
        payment_tx: paymentTx, payment_thkt: paymentThkt,
      }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function fetchBatch(id) {
  return get(`/batches/${id}`);
}

export function fetchJob(id) {
  return get(`/jobs/${id}`);
}

// A buyer's own job history (results persist beyond the browser session).
export function fetchMyJobs(payer) {
  return get(`/jobs?payer=${payer}`);
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
