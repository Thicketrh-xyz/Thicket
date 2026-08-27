export function Migration() {
  return (
    <>
      <div className="callout"><strong>This has not happened.</strong> Thicket is on testnet and
        there is no mainnet deployment, no mainnet address, and no date. This page exists so the
        conditions are written down in public before anyone is asked to trust them — not to
        suggest a launch is close. See <a href="/docs/status">What's live now</a>.</div>

      <h2 id="blockers">What has to be true first</h2>
      <p>Three of these are prerequisites in the strict sense: without them, asking anyone to
        stake real value would be dishonest rather than merely early.</p>
      <ol>
        <li><strong>An external audit</strong> of all three contracts. The token is
          straightforward; NodeStaking and RewardsDistributor hold everyone's money and are not.</li>
        <li><strong>A multisig on the publisher and owner keys.</strong> Today a single
          externally-owned account can publish reward roots and slash operators. Whoever holds it
          can assign the whole rewards pool to an address of their choosing, and nothing on-chain
          stops that. This is the largest unmitigated risk in the system.</li>
        <li><strong>Legal review</strong> of what the token is and how it is offered.</li>
        <li><strong>The bond re-check closed.</strong> Bonds are verified at registration and never
          again, so the stake behind a node is not continuously enforced.</li>
        <li><strong>Delegated stake carries no slash risk.</strong> Delegation now earns, but
          <code>slash()</code> only touches an operator's own bond — so a delegator takes the
          upside without the downside. Closing that needs a new NodeStaking, and leaving it open
          on mainnet means delegation is risk-free yield paid out of a finite pool.</li>
        <li><strong>An answer for the coordinator being a single point of trust.</strong> At minimum
          published roots should be independently reproducible, so anyone can check the numbers
          rather than take them on faith.</li>
      </ol>

      <h2 id="economics">Economic decisions that are not yet made</h2>
      <ul>
        <li><strong>The uptime rate.</strong> 1 THKT/minute is a testnet figure. At mainnet prices
          it would drain the pool quickly, and it currently dwarfs what work pays.</li>
        <li><strong>Pool sustainability.</strong> Nothing ties published roots to the pool balance.
          If entitlements outrun the pool, claims simply start reverting.</li>
        <li><strong>Pricing.</strong> Jobs are priced by input size, while cost is driven by output
          length — a 128× spread between the cheapest and dearest work per second of compute.
          Measurements are in <code>ECONOMICS.md</code>.</li>
      </ul>

      <h2 id="what-changes">What would actually change</h2>
      <p>For anyone running a node today, the mechanical part is small — the software is the same,
        pointed at a different chain.</p>
      <table className="docs-table">
        <tbody>
          <tr><th>Contracts</th><td>Redeployed at new addresses. Testnet contracts would keep running for testing; they are not migrated.</td></tr>
          <tr><th>Tokens</th><td>Testnet THKT is <strong>not</strong> transferable to mainnet and carries no claim on mainnet supply. Anyone promising a testnet-to-mainnet conversion is lying.</td></tr>
          <tr><th>Your node</th><td>New RPC, new contract addresses, a new bond in real THKT. Same client, same commands.</td></tr>
          <tr><th>Earnings</th><td>Testnet earnings stay on testnet. They do not carry over.</td></tr>
          <tr><th>The portal</th><td>Points at the mainnet chain; your wallet prompts to switch networks.</td></tr>
        </tbody>
      </table>

      <h2 id="watch">How to know it is real</h2>
      <p>When it happens, it will be visible in the repository first: a new deployment file
        alongside <code>deployments/robinhood-testnet.json</code>, with addresses you can check on
        a block explorer, and an audit report you can read. Until all of that exists, treat any
        mainnet announcement — including one that looks like it came from us — as unverified.</p>
    </>
  );
}
