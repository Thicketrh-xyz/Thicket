export function Faq() {
  return (
    <>
      <p>Short answers. If something is actually broken, start with{" "}
        <a href="/docs/troubleshooting">Troubleshooting</a> instead.</p>

      <h3>Is this audited, or on mainnet?</h3>
      <p><strong>No, and no.</strong> Thicket runs on Robinhood Chain <strong>testnet</strong> and
        no contract has been audited. THKT here has no monetary value and testnet gas is free.
        Nothing you stake is real money. What would have to change is written down in{" "}
        <a href="/docs/migration">Testnet → mainnet</a>.</p>

      <h3>Do I need a GPU?</h3>
      <p>No, but memory matters more than you'd think. Uptime and challenges are CPU work. Serving
        paid jobs means running a real model, and a node sizes its context window to the job — up
        to 32k tokens on a long document, which is where the RAM goes. 8GB handles text; vision
        wants 16GB. See <a href="/docs/run-a-node">Run a node</a>.</p>

      <h3>How much can I earn?</h3>
      <p>Two components: a rate per minute online, plus 70% of what buyers paid for jobs you
        completed. On testnet the uptime rate is 1 THKT/minute, which currently dwarfs what work
        pays — that balance is expected to change. Read the live values from{" "}
        <code>/node/{`{address}`}</code> rather than trusting a number in prose.</p>

      <h3>Where does earned THKT come from?</h3>
      <p>A pre-funded pool held by the RewardsDistributor. Tokens are transferred, never minted,
        and compute payments refill the pool. When it empties, claims pause until more revenue
        arrives — there is no inflation to fall back on.</p>

      <h3>Does delegating earn me anything?</h3>
      <p>No. The contract tracks delegated stake but no rewards flow to delegators, and there is no
        commission split. See <a href="/docs/staking">Staking &amp; delegation</a>.</p>

      <h3>Is all the work verified?</h3>
      <p>No — a sampled share is cross-checked by three nodes, and the rest is policed by the risk
        of being sampled. That is spot-checking, not proof. The honest description is on{" "}
        <a href="/docs/verification">Challenges &amp; slashing</a>.</p>

      <h3>Can I choose which jobs my node runs?</h3>
      <p>Not yet. Beyond capability routing — a text-only node never receives vision work — whatever
        a buyer sends runs on your machine. There is no content policy and no opt-out. Worth knowing
        before you point hardware at it.</p>

      <h3>Can I get a refund for a failed job?</h3>
      <p>No. Payment enters the rewards pool on-chain before the work starts and nothing can pull it
        back out.</p>

      <h3>What happens if the coordinator disappears?</h3>
      <p>Settled rewards stay claimable — they're in an on-chain root and the contract honours them
        without the coordinator. Unsettled earnings pause. Your bond is untouched. See{" "}
        <a href="/docs/architecture">Architecture</a>.</p>

      <h3>Is it open source?</h3>
      <p>Yes, MIT —{" "}
        <a href="https://github.com/Thicketrh-xyz/Thicket">github.com/Thicketrh-xyz/Thicket</a>.
        That includes the coordinator, so you can read exactly how earnings are calculated.</p>
    </>
  );
}
