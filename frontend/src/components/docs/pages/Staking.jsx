
export function Staking() {
  return (
    <>
      <p>Two ways to stake, both in the portal's <a href="/app#stake">Stake</a> tab:</p>
      <ul>
        <li><strong>Run a node</strong> — bond THKT (minimum 1,000) to register as an operator. Your bond is slashable if your node fails challenges.</li>
        <li><strong>Delegate</strong> — stake THKT to an existing operator. <strong>Delegation does not currently earn rewards.</strong> The staking contract tracks delegated stake, but the coordinator pays only the operator address that ran the work — there is no commission split implemented yet. Delegate only if you intend to signal support for an operator; you will not receive a share.</li>
      </ul>
      <p>Unbonding has a 7-day cooldown before withdrawn stake is claimable. The period and the minimum bond are both owner-adjustable on the contract.</p>
      <p><strong>Where slashed stake goes.</strong> A slash transfers the amount out of the operator's self-stake to the contract owner (the treasury). It is not burned and it does not go back into the rewards pool.</p>
      <div className="callout"><strong>Known gap.</strong> The coordinator checks your bond when you <em>register</em>, not on every heartbeat. An operator who unbonds after registering keeps earning until the coordinator is restarted or they re-register. This is a hole in the anti-sybil model, not a feature — it will be closed by re-checking the bond periodically.</div>
    </>
  );
}
