
export function Architecture() {
  return (
    <>
      <p>Four pieces. Two of them you can verify yourself; two you are trusting.</p>
      <div className="code">{`Browser  ──▶  Frontend  ──▶  Coordinator  ──▶  Contracts
Agents   ──▶  SDK       ──▶       │              (on-chain)
Nodes    ──▶  client    ──────────┘`}</div>

      <h3>The pieces</h3>
      <table className="docs-table">
        <tbody>
          <tr><th>Contracts</th><td>Three of them: the THKT token (fixed supply), NodeStaking (bonds, delegation, slashing) and RewardsDistributor (holds the pool, accepts payments, pays claims against a Merkle root). Solidity, on Robinhood Chain.</td></tr>
          <tr><th>Coordinator</th><td>A FastAPI service with a Postgres database. Registers nodes, counts heartbeats, issues challenges, routes jobs, runs quorums, and settles an epoch by publishing one root.</td></tr>
          <tr><th>Node client</th><td>Python. Bonds on-chain, heartbeats, answers challenges, and runs jobs through a local Ollama install. Outbound HTTP only — no inbound ports, so no port forwarding.</td></tr>
          <tr><th>Frontend &amp; SDK</th><td>The portal reads the coordinator and talks to the contracts through your wallet. The SDK does the same for an agent holding a private key.</td></tr>
        </tbody>
      </table>

      <h3 id="trust">What is on-chain, and what you are trusting</h3>
      <p>Worth being direct about this, because it decides what you are actually relying on.</p>
      <table className="docs-table">
        <thead><tr><th>On-chain (verifiable)</th><th>Off-chain (coordinator)</th></tr></thead>
        <tbody>
          <tr><td>Your bond and stake</td><td>Whether you were online, and for how long</td></tr>
          <tr><td>Slashes</td><td>Whether your challenge answer was right</td></tr>
          <tr><td>The cumulative rewards root, per epoch</td><td>How much you earned, and the whole claim table</td></tr>
          <tr><td>Your claim, and the pool balance</td><td>Job routing, pricing, and quorum outcomes</td></tr>
          <tr><td>Buyer payments into the pool</td><td>&nbsp;</td></tr>
        </tbody>
      </table>
      <p>The coordinator is a <strong>single trusted service</strong>. It decides what everyone earns and it holds the key that publishes roots and issues slashes. That key can publish any root it likes, so it could in principle assign the pool to itself. Nothing on-chain prevents that today — it is the largest piece of trust in the system and the reason a multisig on that key is a prerequisite for anything beyond testnet.</p>


      <h3>Why a coordinator at all</h3>
      <p>Everything the coordinator does could in principle be on-chain, and none of it would be affordable. Counting a heartbeat every 30 seconds for every node, per node, would cost more gas than the rewards are worth. So contribution is measured off-chain and <em>settled</em> on-chain once per epoch as a single cumulative root — one transaction covering every operator, however many there are.</p>
      <p>That is the trade: cheap and fast, at the cost of a component you have to trust. The honest description of Thicket today is a <strong>decentralised network with a centralised coordinator</strong>. Decentralising it is a real piece of work and it has not been done.</p>

      <h3>If the coordinator goes down</h3>
      <ul>
        <li><strong>Already-settled rewards are safe.</strong> They live in an on-chain root; you can claim them with the proof whether or not the coordinator is running.</li>
        <li><strong>Unsettled earnings pause.</strong> Minutes and work since the last epoch aren't in a root yet. State is in Postgres, so they survive a restart — but they aren't claimable until an epoch closes.</li>
        <li><strong>Nodes keep retrying.</strong> The client logs the error and carries on heartbeating; it doesn't need restarting.</li>
        <li><strong>Jobs in flight stall.</strong> A buyer's job that was assigned but not returned is requeued after 3 minutes once the coordinator is back.</li>
        <li><strong>Your bond is untouched.</strong> It's on-chain and independent of the coordinator.</li>
      </ul>

      <h3>Where the code is</h3>
      <p>All of it is MIT-licensed and public — <a href="https://github.com/Thicketrh-xyz/Thicket">github.com/Thicketrh-xyz/Thicket</a>. <code>contracts/</code> is Foundry, <code>coordinator/</code> the service, <code>node/</code> the client, <code>sdk/</code> the agent SDK. <code>coordinator/sim.py</code> runs the verification scenarios end to end without a server, a chain, or a model.</p>
    </>
  );
}
