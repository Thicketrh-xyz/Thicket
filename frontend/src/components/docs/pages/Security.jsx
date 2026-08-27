export function Security() {
  return (
    <>
      <p>Your private key controls your bond, your earnings, and everything else that wallet
        holds. There is no password reset, no support line, and no way to reverse a transfer.
        This is the one mistake on this network that cannot be undone.</p>

      <h2 id="never">Nobody will ever ask for it</h2>
      <p>Not the Thicket team, not a moderator, not an "admin" in a DM, not a support form, not
        a wallet-verification page, not an airdrop checker. There is no situation in which a
        legitimate person needs your private key or seed phrase. If someone asks, they are
        stealing from you — no exceptions, however plausible the story.</p>
      <div className="callout"><strong>Also never paste it into an AI assistant, a chat window,
        a GitHub issue, a screenshot, or a pastebin.</strong> Anything you paste somewhere may be
        logged, indexed, or read later by someone you did not expect.</div>

      <h2 id="storing">Storing it</h2>
      <table className="docs-table">
        <thead><tr><th>Method</th><th>Verdict</th></tr></thead>
        <tbody>
          <tr><td><code>--save-key</code> (macOS Keychain)</td><td><strong>Best.</strong> Encrypted at rest, unlocked with your login. macOS collects it at its own prompt, so it never reaches the command line, the process list, or your shell history.</td></tr>
          <tr><td>Interactive prompt</td><td><strong>Fine.</strong> Hidden input, nothing stored. You retype it on every start.</td></tr>
          <tr><td><code>node/.env</code></td><td><strong>Acceptable, with care.</strong> Plaintext on disk. Run <code>chmod 600 node/.env</code> so only you can read it. It is gitignored — keep it that way. The only option off macOS.</td></tr>
          <tr><td><code>--key 0x…</code> on the command line</td><td><strong>Avoid.</strong> Lands in your shell history and is visible in the process list to anyone else on that machine.</td></tr>
        </tbody>
      </table>
      <div className="code">{`.venv/bin/python -m thicket_node.client --save-key     # store it once
.venv/bin/python -m thicket_node.client --forget-key   # remove it`}</div>

      <h2 id="separation">Use a wallet that only does this</h2>
      <p>Generate a fresh wallet for your node rather than reusing one that holds anything you
        care about. It needs the bond plus a little gas and nothing else. If that key is ever
        exposed, your exposure is bounded by what is in it.</p>
      <div className="code">{`.venv/bin/python -m thicket_node.client --new-wallet`}</div>
      <p>Running several machines? Give each its own wallet — that is required anyway, since a
        node is identified by its address, and it also means one compromised machine does not
        cost you the others.</p>

      <h2 id="exposed">If you think it is exposed</h2>
      <p>Assume the funds are already gone; automated sweepers watch for leaked keys and empty
        wallets within seconds. Still, in order:</p>
      <ol>
        <li>Move anything liquid in that wallet to a new one, immediately.</li>
        <li>Queue your stake for unbonding. It is subject to the unbonding cooldown, so whoever
          holds the key can also queue it — but they cannot shorten the wait.</li>
        <li>Generate a new wallet, bond it, and point your node at it.</li>
        <li>Run <code>--forget-key</code>, then remove any <code>.env</code> copy and clear the
          key from your shell history.</li>
      </ol>
      <p>Because bonded stake cannot be withdrawn instantly, a leaked operator key is slightly
        less catastrophic than a leaked hot wallet. Do not rely on that — the cooldown buys you
        a little time, not safety.</p>

      <h2 id="scope">What is actually at risk</h2>
      <p>Being precise, so you can judge it yourself. Your key can: withdraw your unbonded THKT,
        queue your stake for unbonding, sign heartbeats as your node, and claim your settled
        rewards. It cannot: publish reward roots, slash anyone, or touch the rewards pool —
        those need the coordinator's key, which is a different wallet entirely.</p>
      <p>On testnet none of this is worth money. Build the habit now anyway, because the same
        commands and the same key handling are what you would use if it ever were.</p>
    </>
  );
}
