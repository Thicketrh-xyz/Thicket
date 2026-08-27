
export function Staking() {
  return (
    <>
      <p>Two ways to stake, both in the portal's <a href="/app#stake">Stake</a> tab:</p>
      <ul>
        <li><strong>Run a node</strong> — bond THKT (minimum 1,000) to register as an operator. Your bond is slashable if your node fails challenges.</li>
        <li><strong>Delegate</strong> — stake THKT to an existing operator and earn a share of what it makes, without running hardware.</li>
      </ul>

      <h2 id="delegating">What delegating earns</h2>
      <p>An operator's epoch earnings — uptime and completed work together — are split by
        the stake backing it. Each side is paid in proportion to what it staked, and the
        operator takes a <strong>20% commission</strong> on the delegators' portion, which is
        what pays for the hardware and the slash risk it carries alone.</p>
      <div className="code">{`operator self-stake   1,000 THKT
your delegation       1,000 THKT
operator earns this epoch      10 THKT

  half follows delegated stake   5 THKT
  minus 20% commission          -1 THKT
  you receive                    4 THKT
  operator receives              6 THKT`}</div>
      <p>Delegated stake is read from the chain each epoch, so a delegation starts earning
        from the next settlement and stops when you unbond. Nothing is minted to pay it: the
        split divides what the operator already earned.</p>
      <p>Rewards land in the same Merkle root operators claim from, so you claim exactly the
        way they do — connect the wallet you delegated with and press claim. Check what you
        are owed at <code>{`GET /delegations/{address}`}</code>.</p>

      <div className="callout"><strong>Delegated stake is not slashed.</strong> The contract's
        <code>slash()</code> only reduces an operator's own bond, so a delegator earns the
        upside without carrying the downside. That asymmetry is a property of the deployed
        contract rather than a decision — changing it would need a new NodeStaking. It does
        mean choosing a reliable operator matters for your <em>returns</em>: an operator that
        fails challenges has its window voided, and a voided window pays its delegators
        nothing.</div>

      <h2 id="unbonding">Unbonding</h2>
      <p>Withdrawing stake — your own bond or a delegation — queues it for a cooldown before
        it can be claimed. The cooldown exists so a node can't bond, misbehave, and pull its
        stake before the network catches it, which is what makes the bond meaningfully at
        risk. Both the cooldown and the minimum bond are adjustable by the contract owner;
        the live value is on <a href="/docs/status">What's live now</a>.</p>
      <p><strong>Where slashed stake goes.</strong> A slash transfers the amount out of the operator's self-stake to the contract owner (the treasury). It is not burned and it does not go back into the rewards pool.</p>
      <div className="callout"><strong>Known gap.</strong> The coordinator checks your bond when you <em>register</em>, not on every heartbeat. An operator who unbonds after registering keeps earning until the coordinator is restarted or they re-register. This is a hole in the anti-sybil model, not a feature — it will be closed by re-checking the bond periodically.</div>
    </>
  );
}
