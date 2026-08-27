import { DIST, RPC, STAKING, TOKEN } from "../shared";

export function Tokenomics() {
  return (
    <>
      <p>THKT is a <strong>fixed-supply</strong> token — there is no minting. Rewards are paid from a pool held by the distributor contract, and that pool is topped up over time rather than issued all at once. This mirrors a launchpad token (fixed supply, no team mint).</p>
      <table className="docs-table">
        <tbody>
          <tr><th>Total supply</th><td>1,000,000,000 THKT (fixed)</td></tr>
          <tr><th>Rewards pool target</th><td><strong>350,000,000 THKT</strong> — the size the pool is intended to reach, <em>not</em> a starting balance. It opens far lower and grows; see below.</td></tr>
          <tr><th>Pool balance now</th><td>Whatever the distributor address actually holds. It is shown live at the top of the <a href="/app">portal</a> and returned as <code>pool_thkt</code> by <code>{`GET /stats`}</code> — read it there rather than trusting a number written down here.</td></tr>
          <tr><th>Uptime rate</th><td>1 THKT per verified minute (testnet)</td></tr>
          <tr><th>Work share</th><td>70% of what the buyer paid, to the node that did the job</td></tr>
          <tr><th>Operator bond</th><td>1,000 THKT minimum</td></tr>
          <tr><th>Refill</th><td>compute-job payments, plus buybacks funded by the team</td></tr>
          <tr><th>Treasury</th><td>Everything not yet in the rewards pool, held by the deploying wallet. No separate team, investor, or advisor allocation has been carved out of it.</td></tr>
          <tr><th>Live figures</th><td>Pool balance and total earned are on <code>{`GET /stats`}</code>; the token contract is on the explorer below.</td></tr>
        </tbody>
      </table>
      <h2 id="pool">How the pool grows</h2>
      <p>350M is a <strong>ceiling, not an opening balance</strong>. The pool is seeded with a
        fraction of that at launch — the rest stays in the treasury — and fills from two
        sources. Both move real tokens that already exist; nothing is minted to pay rewards,
        ever. The live balance in the portal is always the real figure.</p>
      <ul>
        <li><strong>Paid compute.</strong> Every job payment goes straight into the distributor,
          so demand for compute is what funds the operators serving it. This is automatic and
          enforced by the contract: a job is not accepted until its payment is verified on-chain.</li>
        <li><strong>Buybacks.</strong> The team adds to the pool from the treasury. This is a
          discretionary transfer, not a protocol rule — there is no schedule in the contracts
          committing anyone to it, and you should read it as intent rather than a guarantee.</li>
      </ul>
      <p>The loop: <em>buyers pay THKT → pool → operators and delegators earn → claim</em>. When
        the pool empties, claims pause until it is refilled — no inflation. Because rewards can
        only ever be paid from tokens actually sitting in the distributor, the balance shown in
        the portal is the real limit on what the network can pay out today.</p>
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
