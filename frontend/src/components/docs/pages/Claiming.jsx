
export function Claiming() {
  return (
    <>
      <p>Earnings accrue live but become <strong>claimable</strong> only when an epoch settles — that's when the on-chain Merkle root updates. In the portal, "Earned" ticks up continuously while "Claimable" updates each epoch.</p>
      <div className="code">{`claimable = settled_in_latest_root − already_claimed_on_chain`}</div>
      <p>Roots are <strong>cumulative</strong>, not per-epoch: each one carries your lifetime total, and the contract pays the difference against what you've already taken. You can skip claiming for weeks and collect once — nothing expires, and there's no advantage to claiming often beyond having the tokens.</p>
      <p><strong>Why claimable can be zero</strong> when you're clearly earning:</p>
      <ul>
        <li>No epoch has closed since you started — wait one cycle.</li>
        <li>You already claimed everything in the current root; the next epoch adds more.</li>
        <li>A quorum verdict is outstanding, so you were held back this epoch and settle in the next.</li>
        <li>A failed challenge voided the window — that's the intended consequence.</li>
      </ul>
      <p><strong>To claim:</strong> connect your operator wallet in the <a href="/app#dashboard">dashboard</a> and press <em>Claim rewards</em>. One transaction; you pay gas. The proof comes from the coordinator, but the payout is enforced by the contract against the published root.</p>
      <p><strong>If the pool empties</strong>, claims revert until compute payments refill it. Your entitlement isn't lost — the root still records it — but the tokens aren't there to pay it. There is no minting, so the pool is the hard ceiling on what the network can ever pay out. Live balance is on <code>{`GET /stats`}</code> as <code>pool_thkt</code>.</p>
    </>
  );
}
