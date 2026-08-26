
export function Overview() {
  return (
    <>
      <p>Thicket turns idle GPUs into a shared network for AI compute. Operators run a node, pass verification challenges, and earn <strong>THKT</strong> two ways: a rate per minute online, plus a share of what buyers paid for the jobs they actually complete. Buyers pay THKT to run inference jobs, and those payments refill the pool that pays the operators.</p>
      <p>It's a <strong>hybrid model</strong>: uptime is a subsidy so a node is worth running before work exists, and completed work is what actually pays. Bonding plus live challenges keep the network sybil-resistant without requiring ZK proofs at this stage.</p>
      <h2 id="how-it-works">How it works</h2>
      <ol>
        <li><strong>Bond &amp; register</strong> — stake THKT to register your node (skin in the game, slashable).</li>
        <li><strong>Stay online</strong> — the node sends signed heartbeats; the network credits contribution minutes.</li>
        <li><strong>Do work</strong> — completed jobs earn a share of what the buyer paid, on top of the uptime rate.</li>
        <li><strong>Pass challenges</strong> — periodic verifiable tasks prove the node is really working. Wrong answers void that window's earnings — both time and work — and repeated failures slash the bond.</li>
        <li><strong>Settle &amp; claim</strong> — each epoch the coordinator publishes a cumulative-rewards Merkle root on-chain; you claim your delta in one transaction.</li>
      </ol>
      <p>Rewards accrue off-chain and settle as one root per epoch, so per-minute earnings never require per-minute gas.</p>

      <p>Each step has a page of its own:</p>
      <ul>
        <li><a href="/docs/run-a-node">Run a node</a> — what you need and how to start.</li>
        <li><a href="/docs/verification">Challenges &amp; slashing</a> — how work is checked, and what failing costs.</li>
        <li><a href="/docs/staking">Staking &amp; delegation</a> — bonding, unbonding, and what delegation does not do.</li>
        <li><a href="/docs/claiming">Claiming rewards</a> — when earnings settle.</li>
        <li><a href="/docs/architecture">Architecture</a> — the pieces, and which of them you are trusting.</li>
      </ul>
    </>
  );
}
