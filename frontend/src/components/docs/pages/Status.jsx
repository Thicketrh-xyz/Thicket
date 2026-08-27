import { CHAIN_ID, COORD, EXPLORER, NETWORK, RPC } from "../shared";

export function Status() {
  return (
    <>
      <p>One page that says exactly what exists, so nothing here has to be inferred from
        marketing copy. If a claim about Thicket contradicts this page, this page is right.</p>

      <h2 id="network">The network</h2>
      <table className="docs-table">
        <tbody>
          <tr><th>Network</th><td><strong>{NETWORK}</strong> — mainnet</td></tr>
          <tr><th>Chain ID</th><td><code>{CHAIN_ID}</code></td></tr>
          <tr><th>RPC</th><td><code>{RPC}</code></td></tr>
          <tr><th>Explorer</th><td><a href={EXPLORER}>{EXPLORER.replace("https://", "")}</a></td></tr>
          <tr><th>Coordinator</th><td><a href={`${COORD}/health`}>{COORD.replace("https://", "")}</a></td></tr>
          <tr><th>Gas</th><td>ETH on Robinhood Chain</td></tr>
          <tr><th>Audit</th><td><strong>None.</strong> No contract has been audited by anyone</td></tr>
          <tr><th>Value of THKT</th><td>THKT is live. Treat it as real value and act accordingly</td></tr>
        </tbody>
      </table>
      <p>These are the only official addresses. Any other token claiming to be THKT is not ours —
        check anything you are unsure about against
        <a href="https://github.com/Thicketrh-xyz/Thicket">the repository</a> before sending funds.</p>

      <h2 id="working">What works end to end</h2>
      <ul>
        <li><strong>Bonding and registration</strong> — stake THKT on-chain, register a node with a signed message.</li>
        <li><strong>Heartbeats and contribution</strong> — signed, replay-resistant, credited per minute.</li>
        <li><strong>Challenges</strong> — issued on a schedule and verified, by quorum where enough nodes are online and by recomputation otherwise.</li>
        <li><strong>Quorum verification</strong> — the same task on three random nodes, settled by majority, wired to the strike and slash path.</li>
        <li><strong>Real AI jobs</strong> — text and vision through Ollama, routed only to nodes that can run them.</li>
        <li><strong>Paid compute</strong> — priced by size, verified on-chain before the work starts, single jobs and bulk batches.</li>
        <li><strong>Work-based rewards</strong> — operators earn uptime plus a share of what buyers paid for jobs they completed.</li>
        <li><strong>Delegation rewards</strong> — delegators earn a stake-weighted share of their operator's earnings, minus the operator's commission, claimed from the same root.</li>
        <li><strong>Epoch settlement and claims</strong> — a cumulative Merkle root per epoch, claimed in one transaction.</li>
        <li><strong>Agent SDK</strong> — buy compute from a wallet in one call, with spend guards.</li>
      </ul>

      <h2 id="not">What does not work, or is not there</h2>
      <ul>
        <li><strong>The bond is only checked at registration.</strong> An operator who unbonds afterwards keeps earning until the coordinator restarts. A real hole in the anti-sybil model.</li>
        <li><strong>Operators cannot refuse jobs.</strong> Whatever a buyer sends runs on their machine. There is no content policy and no opt-out.</li>
        <li><strong>Most work is not verified.</strong> Paid jobs are cross-checked only at the sampling rate in <code>spot_check_rate</code> on <code>{`GET /stats`}</code> — at zero, none are. Challenges are always verified; paid output is spot-checked at best, never proven.</li>
        <li><strong>The coordinator is a single point of trust and failure.</strong> One service decides what everyone earned.</li>
        <li><strong>No refunds.</strong> Payment enters the pool before the work runs and cannot be pulled back, including for a failed job.</li>
        <li><strong>No image generation.</strong> Vision means image-to-text. Generation needs a diffusion runtime that is not wired up.</li>
      </ul>

      <h2 id="honest">The short version</h2>
      <p>The compute is real — actual models producing actual output, paid for with real on-chain
        transactions on a test network. The verification is real but partial. The economics are
        real but unproven, and it runs on unaudited contracts with an owner key that can move the
        entire rewards pool in one transaction.</p>
      <p>It is a working system, live on mainnet, and it is early. Nothing here has been audited.
        Judge it on what this page says rather than on anything more confident you read elsewhere.</p>
    </>
  );
}
