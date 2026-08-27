
export function Verification() {
  return (
    <>
      <p>A node could take payment and return nonsense. Two mechanisms make that expensive.</p>
      <ul>
        <li><strong>Challenges</strong> — the coordinator issues a deterministic task it can check. Below three online nodes it verifies by recomputing the answer itself.</li>
        <li><strong>Quorum</strong> — with three or more nodes online, the same task goes to <strong>three randomly chosen nodes</strong> and the majority decides. Nodes aren't told they're being cross-checked or who else has the task. Agreeing nodes keep their earnings and split the job's operator share; a node that disagrees has that window's earnings voided and takes a strike, and three strikes slash the bond.</li>
      </ul>
      <p>A sampled share of <em>paid</em> jobs runs this way too, and when it does the buyer receives the answer the majority agreed on rather than whatever the fastest node returned. Verifying everything would triple the network's compute, so most work is policed by the risk of being sampled rather than by being checked.</p>
      <div className="callout">Being honest about the limit: this is <strong>spot-checking, not proof</strong>. If all three nodes disagree the result is inconclusive and nobody is punished — an honest node must never be penalised for legitimate variation. An attacker controlling most of the network could outvote honest nodes; random selection plus the bond is what makes that expensive, and ZK proofs are the eventual answer. Check the live rate at <code>/stats</code>.</div>
      <h3>The numbers behind the loop</h3>
      <p>All of these are coordinator settings and can change; the live values are the ones the coordinator is running with, not necessarily the defaults below.</p>
      <table className="docs-table">
        <tbody>
          <tr><th>Heartbeat</th><td>Every 30s by default. Miss <strong>90s</strong> and you count as offline the gap earns nothing, and time only accrues <em>between</em> two heartbeats.</td></tr>
          <tr><th>Challenge interval</th><td>About every <strong>10 minutes</strong> per node.</td></tr>
          <tr><th>Challenge deadline</th><td><strong>60s</strong> to answer. Missing it is treated as <em>absent</em>, not wrong, no strike.</td></tr>
          <tr><th>Wrong answer</th><td>Voids <strong>everything unsettled</strong> in that window both minutes online and work earnings and adds a strike.</td></tr>
          <tr><th>Slash threshold</th><td><strong>3 strikes</strong>. A passed challenge resets the counter, so the three are effectively consecutive.</td></tr>
          <tr><th>Slash amount</th><td><strong>100 THKT</strong> from self-stake, capped at whatever is staked.</td></tr>
          <tr><th>Epoch</th><td><strong>60s</strong> on the live coordinator. At each close the coordinator publishes one cumulative Merkle root on-chain.</td></tr>
          <tr><th>Held back</th><td>A node awaiting a quorum verdict is skipped that epoch and settles the next one, so a verdict can still void its earnings.</td></tr>
        </tbody>
      </table>

      <h3>What a strike actually costs</h3>
      <p>Three separate things happen when a node is found to have answered wrongly:</p>
      <ol>
        <li><strong>The window is voided.</strong> Everything unsettled, minutes online, <em>and</em> work earnings is zeroed. Anything already settled into a published root is safe; the contract has it and it cannot be revoked off-chain.</li>
        <li><strong>A strike is recorded.</strong> Passing a later challenge resets the counter to zero, so the three that trigger a slash are effectively consecutive.</li>
        <li><strong>At three strikes, the bond is slashed.</strong> 100 THKT moves out of your self-stake to the treasury, capped at whatever you have staked. The counter then resets.</li>
      </ol>
      <p>Three things deliberately do <em>not</em> cost you anything:</p>
      <ul>
        <li><strong>Not answering.</strong> A missed deadline is absence, not a wrong answer.</li>
        <li><strong>An inconclusive quorum.</strong> If all three nodes disagree, nobody is punished — an honest node must never be penalised for legitimate variation between machines.</li>
        <li><strong>Being offline.</strong> You earn nothing for that time, but nothing is taken.</li>
      </ul>
      <p>You can read every recent cross-check, including which nodes agreed, at <a href="/docs/api">GET /quorums</a>.</p>
    </>
  );
}
