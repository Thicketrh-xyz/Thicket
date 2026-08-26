import { CHAIN_ID, COORD, EXPLORER, NETWORK, RPC } from "../shared";

export function Status() {
  return (
    <>
      <p>One page that says exactly what exists, so nothing here has to be inferred from
        marketing copy. If a claim about Thicket contradicts this page, this page is right.</p>

      <h2 id="network">The network</h2>
      <table className="docs-table">
        <tbody>
          <tr><th>Network</th><td><strong>{NETWORK}</strong> — testnet, not mainnet</td></tr>
          <tr><th>Chain ID</th><td><code>{CHAIN_ID}</code></td></tr>
          <tr><th>RPC</th><td><code>{RPC}</code></td></tr>
          <tr><th>Explorer</th><td><a href={EXPLORER}>{EXPLORER.replace("https://", "")}</a></td></tr>
          <tr><th>Coordinator</th><td><a href={`${COORD}/health`}>{COORD.replace("https://", "")}</a></td></tr>
          <tr><th>Gas</th><td>Testnet ETH, free from a faucet</td></tr>
          <tr><th>Audit</th><td><strong>None.</strong> No contract has been audited by anyone</td></tr>
          <tr><th>Value of THKT</th><td><strong>None.</strong> Testnet tokens are not money</td></tr>
        </tbody>
      </table>
      <p>There is no Thicket mainnet. There are no mainnet contract addresses. If you encounter
        a site, token, or "Thicket mainnet" that says otherwise, treat it as a scam and check it
        against <a href="https://github.com/Thicketrh-xyz/Thicket">the repository</a>.</p>

      <h2 id="working">What works end to end</h2>
      <ul>
        <li><strong>Bonding and registration</strong> — stake THKT on-chain, register a node with a signed message.</li>
        <li><strong>Heartbeats and contribution</strong> — signed, replay-resistant, credited per minute.</li>
        <li><strong>Challenges</strong> — issued on a schedule and verified, by quorum where enough nodes are online and by recomputation otherwise.</li>
        <li><strong>Quorum verification</strong> — the same task on three random nodes, settled by majority, wired to the strike and slash path.</li>
        <li><strong>Real AI jobs</strong> — text and vision through Ollama, routed only to nodes that can run them.</li>
        <li><strong>Paid compute</strong> — priced by size, verified on-chain before the work starts, single jobs and bulk batches.</li>
        <li><strong>Work-based rewards</strong> — operators earn uptime plus a share of what buyers paid for jobs they completed.</li>
        <li><strong>Epoch settlement and claims</strong> — a cumulative Merkle root per epoch, claimed in one transaction.</li>
        <li><strong>Agent SDK</strong> — buy compute from a wallet in one call, with spend guards.</li>
      </ul>

      <h2 id="not">What does not work, or is not there</h2>
      <ul>
        <li><strong>Delegation earns nothing.</strong> The contract tracks delegated stake, but no rewards flow to delegators — there is no commission split implemented. See <a href="/docs/staking">Staking</a>.</li>
        <li><strong>The bond is only checked at registration.</strong> An operator who unbonds afterwards keeps earning until the coordinator restarts. A real hole in the anti-sybil model.</li>
        <li><strong>Operators cannot refuse jobs.</strong> Whatever a buyer sends runs on their machine. There is no content policy and no opt-out.</li>
        <li><strong>Most work is not verified.</strong> Only a sampled share of paid jobs is cross-checked; the rest is policed by the risk of being sampled. Spot-checking, not proof.</li>
        <li><strong>The coordinator is a single point of trust and failure.</strong> One service decides what everyone earned.</li>
        <li><strong>No refunds.</strong> Payment enters the pool before the work runs and cannot be pulled back, including for a failed job.</li>
        <li><strong>No image generation.</strong> Vision means image-to-text. Generation needs a diffusion runtime that is not wired up.</li>
      </ul>

      <h2 id="honest">The short version</h2>
      <p>The compute is real — actual models producing actual output, paid for with real on-chain
        transactions on a test network. The verification is real but partial. The economics are
        real but unproven, and the whole thing runs on testnet with unaudited contracts and a
        coordinator key that could, today, assign the entire rewards pool to itself.</p>
      <p>It is a working system worth running and worth reading. It is not something to put money
        behind, and nothing on this site should be read as inviting you to.</p>
    </>
  );
}
