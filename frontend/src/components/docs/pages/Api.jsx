import { COORD } from "../shared";

export function Api() {
  return (
    <>
      <p>Base URL: <code>{COORD}</code></p>
      <table className="docs-table">
        <thead><tr><th>Endpoint</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>GET /health</code></td><td>Status, DRY mode, epoch cadence</td></tr>
          <tr><td><code>GET /stats</code></td><td>Nodes, active nodes, tasks, jobs, pool balance</td></tr>
          <tr><td><code>GET /node/{`{address}`}</code></td><td>One operator's live status, earnings, and claim proof</td></tr>
          <tr><td><code>GET /claims</code></td><td>Cumulative claim table (address → amount + proof)</td></tr>
          <tr><td><code>POST /register</code></td><td>Register a node (signed; requires on-chain bond)</td></tr>
          <tr><td><code>POST /heartbeat</code></td><td>Signed heartbeat; returns challenges and assigned jobs</td></tr>
          <tr><td><code>GET /compute/price</code></td><td>Pricing parameters and the input size limit</td></tr>
          <tr><td><code>POST /compute/quote</code></td><td>Price a job before paying for it</td></tr>
          <tr><td><code>GET /quorums</code></td><td>Recent cross-checks and how each one landed</td></tr>
          <tr><td><code>POST /jobs</code></td><td>Submit a paid job (payment verified on-chain)</td></tr>
          <tr><td><code>GET /jobs/{`{id}`}</code></td><td>Poll a job's status and result</td></tr>
          <tr><td><code>POST /batches</code></td><td>Submit many items under one payment</td></tr>
          <tr><td><code>GET /batches/{`{id}`}</code></td><td>Batch progress and every result</td></tr>
        </tbody>
      </table>

      <h3>Errors you'll actually hit</h3>
      <table className="docs-table">
        <tbody>
          <tr><th><code>400</code></th><td>Malformed job — empty prompt, a vision job with no image, or a payment tx already used.</td></tr>
          <tr><th><code>402</code></th><td>Payment missing, short of the server-side price, or not verifiable on-chain.</td></tr>
          <tr><th><code>413</code></th><td>Input longer than <code>max_chars</code>. Split it into a bulk batch.</td></tr>
          <tr><th><code>404</code></th><td>No such job or batch.</td></tr>
          <tr><th><code>401</code> / <code>403</code></th><td>Node endpoints only: bad signature, or not bonded on-chain.</td></tr>
        </tbody>
      </table>
      <p>Buyer endpoints need no key or auth — payment is the authorisation, and it's checked on-chain. Node endpoints (<code>/register</code>, <code>/heartbeat</code>, result submission) require an EIP-191 signature from the operator wallet, and heartbeats carry a timestamp that must be fresh, so a captured one can't be replayed.</p>
    </>
  );
}
