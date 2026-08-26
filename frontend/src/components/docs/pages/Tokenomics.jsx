import { DIST, RPC, STAKING, TOKEN } from "../shared";

export function Tokenomics() {
  return (
    <>
      <p>THKT is a <strong>fixed-supply</strong> token — there is no minting. Rewards are paid from a pre-funded pool, and compute payments refill that pool. This mirrors a launchpad token (fixed supply, no team mint).</p>
      <table className="docs-table">
        <tbody>
          <tr><th>Total supply</th><td>1,000,000,000 THKT (fixed)</td></tr>
          <tr><th>Rewards pool</th><td>350,000,000 THKT, held by the distributor</td></tr>
          <tr><th>Uptime rate</th><td>1 THKT per verified minute (testnet)</td></tr>
          <tr><th>Work share</th><td>70% of what the buyer paid, to the node that did the job</td></tr>
          <tr><th>Operator bond</th><td>1,000 THKT minimum</td></tr>
          <tr><th>Refill</th><td>compute-job payments flow back into the pool</td></tr>
          <tr><th>Treasury</th><td>650,000,000 THKT — everything not in the rewards pool, held by the deploying wallet. No separate team, investor, or advisor allocation has been carved out of it.</td></tr>
          <tr><th>Live figures</th><td>Pool balance and total earned are on <code>{`GET /stats`}</code>; the token contract is on the explorer below.</td></tr>
        </tbody>
      </table>
      <p>The loop: <em>buyers pay THKT → pool → operators earn → claim</em>. When the pool empties, claims pause until compute revenue refills it — no inflation.</p>
      <p>Paying operators a share of real revenue rather than an open-ended rate per job is deliberate: the pool is finite, so a rate that scales with demand would be an unbounded claim on it. Uptime is the subsidy that keeps a node worth running before demand exists; work is what should pay once it does.</p>
      <h2 id="contracts">Contracts</h2>
      <p>Network: <strong>Robinhood Chain Testnet</strong> · chain ID <code>46630</code> · gas token ETH.</p>
      <table className="docs-table">
        <tbody>
          <tr><th>RPC</th><td><code>{RPC}</code></td></tr>
          <tr><th>Explorer</th><td><a href="https://explorer.testnet.chain.robinhood.com">explorer.testnet.chain.robinhood.com</a></td></tr>
          <tr><th>THKT token</th><td><code>{TOKEN}</code></td></tr>
          <tr><th>NodeStaking</th><td><code>{STAKING}</code></td></tr>
          <tr><th>RewardsDistributor</th><td><code>{DIST}</code></td></tr>
        </tbody>
      </table>
    </>
  );
}
