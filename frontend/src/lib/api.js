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

// This account's claim (amount + Merkle proof) for the on-chain claim tx.
export async function fetchClaimFor(address) {
  const claims = await fetchClaims();
  if (!claims) return null;
  const key = Object.keys(claims).find(
    (k) => k.toLowerCase() === address.toLowerCase()
  );
  return key ? claims[key] : null;
}
