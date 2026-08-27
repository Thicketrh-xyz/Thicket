import { COORD } from "../shared";

export function Troubleshooting() {
  return (
    <>
      <p>Symptoms first, in roughly the order people hit them. Two commands answer most
        questions: the first says whether the coordinator is alive, the second says what it
        thinks of your node.</p>
      <div className="code">{`curl ${COORD}/health
curl ${COORD}/node/0xYOUR_ADDRESS`}</div>

      <h2 id="node">Running a node</h2>

      <h3>It says "operator not bonded on-chain"</h3>
      <p>Registration checks your bond and yours is below the 1,000 THKT minimum, or on a
        different address than the one signing. Confirm the wallet holds the bond, that you
        bonded on the right network, and that the address in the client's first log line is the
        one you staked from. If you bonded through the portal, add <code>--skip-bond</code> so
        the client doesn't try again.</p>

      <h3>Registered, but the dashboard says offline</h3>
      <p>Offline means no heartbeat in 90 seconds. In order: is the process still running and
        printing lines; can it reach the coordinator; and <strong>is the machine's clock
        right</strong>. Heartbeats are signed with a timestamp and a badly-skewed clock is
        rejected as stale — an easy one to miss because everything else looks fine.</p>

      <h3>"stale timestamp" or "bad signature"</h3>
      <p>Stale timestamp is nearly always clock drift; enable network time. Bad signature means
        the message signed didn't match — usually a client old enough that the message format has
        moved on. Pull the latest and reinstall.</p>

      <h3>My minutes aren't going up</h3>
      <p>Time accrues <em>between</em> two heartbeats, so a node that just started shows zero
        until its second one. If it stays at zero, the heartbeats aren't landing, see offline
        above. If minutes reset to zero, a challenge was failed and the window was voided.</p>

      <h3>A challenge failed</h3>
      <p>The answer didn't match. Almost always a modified or outdated client: the node's solver
        has to match the coordinator's exactly, so any edit to it fails every challenge. Pull the
        latest. If you were one of three nodes cross-checking a task, a failure can also mean the
        other two agreed with each other and not with you. Not answering at all is not a failure,
        that counts as absent and costs nothing.</p>

      <h3>I'm online but never get jobs</h3>
      <p>Jobs only go to nodes advertising the matching capability. If the client said <em>no
        model runtime found</em> at startup, install <a href="https://ollama.com">Ollama</a>, pull
        a model, and restart, capabilities are detected at registration, not continuously. Check
        what the coordinator thinks you can do:</p>
      <div className="code">{`curl ${COORD}/node/0xYOUR_ADDRESS`}</div>
      <p>Beyond that, there may simply be no demand right now. <code>jobs_running</code> on{" "}
        <code>/stats</code> tells you.</p>

      <h3>Jobs fail with "inference failed"</h3>
      <p>Ollama isn't reachable or the model isn't pulled. Check <code>ollama list</code> and that
        the daemon is running. Out-of-memory on a long document is the other common cause, a node
        sizes its context window to the job, so lower the ceiling with <code>THICKET_MAX_CTX</code>
        (try 8192) if the machine is tight. A crashed inference is not treated as a wrong answer
        and carries no strike.</p>

      <h3>The node stopped and I don't know why</h3>
      <p>Heartbeat errors are logged and retried; the client is meant to survive a coordinator
        outage. If the process died, restart it, nothing is lost. Bond, settled earnings and
        unsettled minutes all survive.</p>

      <h2 id="rewards">Rewards and claiming</h2>

      <h3>Claimable is zero although I'm earning</h3>
      <p>Most often no epoch has closed since you started. Otherwise: you already claimed
        everything in the current root; a quorum verdict is outstanding, so you were held back
        this epoch and settle next; or a failed challenge voided the window. See{" "}
        <a href="/docs/claiming">Claiming rewards</a>.</p>

      <h3>The claim transaction reverts</h3>
      <p>Either you're claiming more than the published root allows, refresh so the portal
        re-reads the proof — or the rewards pool is empty. Pool balance is <code>pool_thkt</code>{" "}
        on <code>/stats</code>. An empty pool doesn't lose your entitlement; the root still
        records it and it becomes claimable when compute payments refill the pool.</p>

      <h3>I delegated and earned nothing</h3>
      <p>Delegated stake is read from the chain at each epoch close, so a fresh delegation
        earns from the <em>next</em> settlement, not the one in progress. If it still shows
        zero after that, check <code>{`GET /delegations/{address}`}</code> — an operator that
        was offline, or had a window voided by a failed challenge, earned nothing that epoch
        and so paid its delegators nothing. Your stake is unaffected either way.</p>

      <h3>I unbonded — where is my THKT?</h3>
      <p>Queued for the unbonding cooldown, then withdrawable. Unbonding below the 1,000 minimum also unregisters
        your operator record on-chain, so re-register before running a node again.</p>

      <h2 id="wallet">Wallet and network</h2>

      <h3>Wrong network, or transactions vanish</h3>
      <p>The portal offers to add or switch to the right chain. If a transaction succeeds in your
        wallet but nothing appears on the explorer, you're on a different network. Node-side,
        check <code>ROBINHOOD_RPC</code> in <code>node/.env</code>. Chain ID, RPC and explorer are
        on <a href="/docs/status">What's live now</a>.</p>

      <h3>A setting in .env is being ignored</h3>
      <p>Env values must not carry inline comments <code>KEY=  # note</code> is read as the
        literal comment text. Put comments on their own line.</p>

      <h3>Can one wallet run several machines?</h3>
      <p>No. A node is identified by its address, so two machines signing as the same wallet
        overwrite each other's heartbeats and a challenge issued to one may be answered by the
        other. Use a separate wallet per machine, each bonded separately.</p>

      <h2 id="buying">Buying compute</h2>

      <h3>413 — input too large</h3>
      <p>Longer than a node can read in one pass. Split it into a bulk batch. This is refused
        before payment rather than accepted and quietly truncated.</p>

      <h3>402 — payment not verified</h3>
      <p>The coordinator re-prices server-side and checks the transaction on-chain: it must be a
        confirmed payment into the pool, from the address in <code>payer</code>, for at least the
        quoted price, and not already used for another job. Quote first with{" "}
        <code>/compute/quote</code>.</p>

      <h3>My job is stuck on pending</h3>
      <p>No capable node is online. Check <code>capabilities</code> on <code>/stats</code> before
        paying, a vision job needs a node advertising vision. Jobs don't expire; it will run when
        one appears.</p>

      <h3>Still stuck?</h3>
      <p>Open an issue with what you ran, what you expected, and the log lines around it —{" "}
        <a href="https://github.com/Thicketrh-xyz/Thicket/issues">github.com/Thicketrh-xyz/Thicket</a>.
        Never include your private key, and check that logs and screenshots don't contain one.</p>
    </>
  );
}
