import { CHAIN_ID, DEXSCREENER, EXPLORER, RPC, TOKEN } from "../shared";

export function BuyThkt() {
  return (
    <>
      <div className="callout">
        <strong>Only one contract address is THKT.</strong> Check it character by character
        against the one below before you swap. Anyone can deploy a token called "Thicket"
        with the symbol THKT — the address is the only thing that distinguishes the real one,
        and it is the one detail a scam cannot copy.
      </div>

      <h2 id="address">The contract address</h2>
      <div className="code">{TOKEN}</div>
      <p>Verify it independently on the explorer rather than trusting this page:{" "}
        <a href={`${EXPLORER}/token/${TOKEN}`}>{EXPLORER.replace("https://", "")}</a>.
        The same address is in{" "}
        <a href="https://github.com/Thicketrh-xyz/Thicket/blob/main/deployments/robinhood-mainnet.json">
          the repository
        </a>, so two independent sources have to agree before you send anything.</p>

      <h2 id="network">The network</h2>
      <table className="docs-table">
        <tbody>
          <tr><th>Chain</th><td>Robinhood Chain</td></tr>
          <tr><th>Chain ID</th><td><code>{CHAIN_ID}</code></td></tr>
          <tr><th>RPC</th><td><code>{RPC}</code></td></tr>
          <tr><th>Explorer</th><td><a href={EXPLORER}>{EXPLORER.replace("https://", "")}</a></td></tr>
          <tr><th>Gas token</th><td>ETH</td></tr>
        </tbody>
      </table>
      <p>Connecting a wallet in the <a href="/app">app</a> prompts you to add or switch to this
        network automatically, which is easier than entering it by hand.</p>

      <h2 id="buying">Buying</h2>
      <ol>
        <li><strong>Add Robinhood Chain</strong> to your wallet — connect on the{" "}
          <a href="/app">app</a> and approve the prompt.</li>
        <li><strong>Get some ETH on that chain</strong> for gas. Swaps cost a fraction of a
          cent, but a balance of exactly zero means nothing will go through.</li>
        <li><strong>Open the pair</strong> on{" "}
          <a href={DEXSCREENER} target="_blank" rel="noreferrer">DexScreener</a> and use the
          linked DEX to swap.</li>
        <li><strong>Check the address again</strong> in the swap interface before confirming.</li>
      </ol>

      <h2 id="after">What you can do with it</h2>
      <ul>
        <li><strong>Run a node</strong> — bond 1,000 THKT and earn for uptime plus a share of
          what buyers pay for jobs you complete. See <a href="/docs/run-a-node">Run a node</a>.</li>
        <li><strong>Delegate</strong> — stake behind an operator without running hardware and
          take a share of what it earns. See <a href="/docs/staking">Staking &amp; delegation</a>.</li>
        <li><strong>Buy compute</strong> — pay THKT for inference, which flows into the pool
          that pays operators. See <a href="/docs/compute">Run compute</a>.</li>
      </ul>

      <h2 id="care">Worth knowing before you buy</h2>
      <p>Being straight about this, because it is easier to read now than to discover later.</p>
      <ul>
        <li><strong>The contracts have not been audited.</strong> Nobody independent has
          reviewed the staking or rewards code.</li>
        <li><strong>The owner key can move the rewards pool.</strong> <code>recover()</code> can
          transfer the pool's balance in one transaction. That is a deliberate wind-down
          mechanism and it is also a risk you are accepting.</li>
        <li><strong>The coordinator is a single service.</strong> It decides what every operator
          earned; nothing on-chain checks its arithmetic. See{" "}
          <a href="/docs/architecture">Architecture</a>.</li>
        <li><strong>Nobody will ever DM you about THKT.</strong> Not to offer an allocation, not
          to help you claim, not to "verify" a wallet. Never share a private key or seed phrase
          — see <a href="/docs/security">Private key security</a>.</li>
      </ul>
      <p>Everything the network does is in{" "}
        <a href="https://github.com/Thicketrh-xyz/Thicket">the repository</a>, coordinator
        included, so you can read exactly how earnings are calculated rather than take our word
        for it.</p>
    </>
  );
}
