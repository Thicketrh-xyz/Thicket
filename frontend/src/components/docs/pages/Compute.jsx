import { COORD } from "../shared";

export function Compute() {
  return (
    <>
      <p>Buyers pay THKT to run a job. The payment goes into the rewards pool via the distributor's <code>fund()</code> function, then the coordinator assigns the job to an online node, which executes it and returns the result.</p>
      <ol>
        <li>Connect a wallet in the portal's <a href="/app#compute">Compute</a> tab and submit a prompt.</li>
        <li>Approve and pay the quoted price — this funds the pool. Pricing is <strong>5 THKT base + 2 per 1,000 characters</strong>, plus 4 for an image. You are quoted before you pay, and the price is recalculated server-side on submit.</li>
        <li>A node picks up the job on its next heartbeat, runs it, and posts the result.</li>
      </ol>
      <p>Two kinds of job are supported today:</p>
      <ul>
        <li><strong>Text</strong> — send a prompt, get generated text back.</li>
        <li><strong>Image → text</strong> — upload an image and ask about it (captioning, description).</li>
      </ul>
      <div className="callout">Jobs are only routed to nodes that advertise the matching capability, so a text-only node never receives vision work. Payment is verified on-chain before a job runs. Image <em>generation</em> needs a diffusion runtime and isn't supported yet.</div>
      <p><strong>Input size.</strong> A single job is capped at <strong>95,000 characters</strong> — the most a node can actually read in one pass. Anything longer is refused before you pay, rather than accepted and quietly truncated. Split larger work into a <a href="/app#compute">bulk batch</a>.</p>
      <h3>Job states</h3>
      <table className="docs-table">
        <tbody>
          <tr><th><code>pending</code></th><td>Paid and queued; waiting for a capable node's next heartbeat.</td></tr>
          <tr><th><code>assigned</code></th><td>A node has it. Unreturned after <strong>3 minutes</strong> it goes back to <code>pending</code> for someone else.</td></tr>
          <tr><th><code>verifying</code></th><td>Spot-checked: several nodes are running it and the majority will decide the answer.</td></tr>
          <tr><th><code>done</code></th><td>Finished. <code>result</code> holds the output.</td></tr>
          <tr><th><code>failed</code></th><td>The node reported it couldn't complete it; <code>result</code> carries the reason.</td></tr>
        </tbody>
      </table>

      <h3>When things go wrong</h3>
      <p>Be aware of what the network does <em>not</em> do today:</p>
      <ul>
        <li><strong>There are no refunds.</strong> Payment goes into the rewards pool on-chain before the job runs, and nothing can pull it back out. A job that ends <code>failed</code> is not refunded.</li>
        <li><strong>A stalled job is retried, not lost.</strong> Requeued after 3 minutes, repeatedly, until a node completes it.</li>
        <li><strong>Nothing expires.</strong> With no capable node online a job sits <code>pending</code> indefinitely. Check <code>capabilities</code> on <code>/stats</code> before paying.</li>
        <li><strong>Oversized input is refused before payment</strong> — <code>413</code>, not a truncated answer.</li>
      </ul>

      <h3>Calling it directly</h3>
      <p>Quote first — no wallet needed, and it tells you the price and whether the input fits:</p>
      <div className="code">{`curl -X POST ${COORD}/compute/quote \\
  -H 'Content-Type: application/json' \\
  -d '{"kind":"text","prompt":"Summarise this."}'

{"price_thkt": 5.03, "chars": 16, "max_chars": 95000, "too_large": false}`}</div>
      <p>Then pay on-chain and submit the transaction hash. The coordinator re-prices server-side and verifies the payment before accepting:</p>
      <div className="code">{`curl -X POST ${COORD}/jobs \\
  -H 'Content-Type: application/json' \\
  -d '{"kind":"text","prompt":"Summarise this.",
   "payer":"0xYOUR_ADDRESS","payment_tx":"0xTX_HASH","payment_thkt":5.03}'

{"id": "1e2d447e4805116b", "status": "pending", "price_thkt": 5.03, "verified": false}`}</div>
      <p>Then poll <code>GET /jobs/{`{id}`}</code> until <code>status</code> is <code>done</code> or <code>failed</code>. The <a href="/docs/sdk">SDK</a> does all of this in one call, including the on-chain payment.</p>
    </>
  );
}
