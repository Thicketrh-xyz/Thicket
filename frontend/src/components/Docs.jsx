import { Logo } from "./Logo";

const RPC = "https://rpc.testnet.chain.robinhood.com/rpc";
const COORD = "https://thicket-production.up.railway.app";
const TOKEN = "0x4D4837ddb309a8dCeC3Abe727dbfED584771aEE2";
const STAKING = "0x434A64884B7C373eE145f11Ac9b7393723Ee5059";
const DIST = "0xD5afab6f1d786be0fad6281b9c842D0662Fa88e5";

function Code({ children }) {
  return <div className="code">{children}</div>;
}

const NAV = [
  { group: "Getting started", links: [["overview", "Overview"], ["how-it-works", "How it works"], ["run-a-node", "Run a node"]] },
  { group: "Participate", links: [["staking", "Staking & delegation"], ["compute", "Run compute"], ["claim", "Claiming rewards"]] },
  { group: "Reference", links: [["tokenomics", "Tokenomics"], ["contracts", "Contracts"], ["api", "Coordinator API"], ["faq", "FAQ"]] },
];

export function Docs() {
  return (
    <>
      <header className="docs-topbar">
        <div className="container">
          <a className="brand" href="/" style={{ textDecoration: "none" }}>
            <Logo size={26} /> <span className="name">Thicket</span>
          </a>
          <span className="muted" style={{ fontWeight: 700 }}>Docs</span>
          <a className="btn sm" href="/" style={{ marginLeft: "auto" }}>Launch app</a>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="group">{g.group}</div>
              {g.links.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
            </div>
          ))}
        </aside>

        <main className="docs-main">
          <h1>Thicket documentation</h1>
          <p className="lede">A decentralized GPU network. Run a node, contribute AI compute, and earn THKT — live on Robinhood Chain testnet.</p>

          <h2 id="overview">Overview</h2>
          <p>Thicket turns idle GPUs into a shared network for AI compute. Node operators run a client, pass verification challenges, and earn <strong>THKT</strong> per verified minute online. Buyers pay THKT to run inference jobs, and those payments refill the pool that pays the operators.</p>
          <p>It's a <strong>hybrid model</strong>: reward uptime, but only pay for verified work. Bonding + live challenges keep the network sybil-resistant without requiring ZK proofs at this stage.</p>
          <div className="docs-callout">Testnet only, unaudited. THKT has no real value here. Do not put real funds behind it.</div>

          <h2 id="how-it-works">How it works</h2>
          <ol>
            <li><strong>Bond &amp; register</strong> — stake THKT to register your node (skin in the game, slashable).</li>
            <li><strong>Stay online</strong> — the node sends signed heartbeats; the network credits contribution minutes.</li>
            <li><strong>Pass challenges</strong> — periodic verifiable tasks prove the node is really working. Wrong answers void the window's earnings; repeated failures slash the bond.</li>
            <li><strong>Settle &amp; claim</strong> — each epoch the coordinator publishes a cumulative-rewards Merkle root on-chain; you claim your delta in one transaction.</li>
          </ol>
          <p>The coordinator accrues rewards off-chain and publishes one root per epoch, so per-minute rewards never require per-minute gas.</p>

          <h2 id="run-a-node">Run a node</h2>
          <p>Any PC works — no GPU required at this stage. You need a wallet with <strong>≥ 1,000 THKT</strong> (the operator bond) and a little testnet ETH for gas.</p>
          <Code>{`git clone https://github.com/Thicketrh-xyz/Thicket.git
cd Thicket/node
cp .env.example .env          # set THICKET_PRIVATE_KEY=0x...
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -u -m thicket_node.client`}</Code>
          <p>The node bonds itself on-chain, registers with the coordinator, and starts earning. Watch it live on the <a href="/#dashboard">dashboard</a>. Already bonded from the app's Stake tab? Set <code>SKIP_BOND=true</code> in <code>.env</code>.</p>

          <h2 id="staking">Staking &amp; delegation</h2>
          <p>Two ways to stake, both in the app's <a href="/#stake">Stake</a> tab:</p>
          <ul>
            <li><strong>Run a node</strong> — bond THKT (minimum 1,000) to register as an operator. Your bond is slashable if your node fails challenges.</li>
            <li><strong>Delegate</strong> — stake THKT to an existing operator and share their rewards without running hardware.</li>
          </ul>
          <p>Unbonding has a 7-day cooldown before withdrawn stake is claimable.</p>

          <h2 id="compute">Run compute</h2>
          <p>Buyers pay THKT to run a job. The payment is sent into the rewards pool via the distributor's <code>fund()</code> function, then the coordinator assigns the job to an online node, which executes it and returns the result.</p>
          <ol>
            <li>Connect a wallet in the app's <a href="/#compute">Compute</a> tab and submit a prompt.</li>
            <li>Approve + pay the price (default 10 THKT) — this funds the pool.</li>
            <li>A node picks up the job on its next heartbeat, runs it, and posts the result.</li>
          </ol>
          <div className="docs-callout">Execution is a placeholder today (a deterministic transform); a real GPU model runtime plugs in on the node side. Payment is verified on-chain before a job runs.</div>

          <h2 id="claim">Claiming rewards</h2>
          <p>Earnings accrue live but become <strong>claimable</strong> only when an epoch settles (that's when the on-chain Merkle root updates). In the <a href="/#dashboard">dashboard</a>, "Earned" ticks up continuously while "Claimable" updates each epoch. Click <strong>Claim</strong> to pull your settled THKT from the pool in one transaction. Claimable is always <code>settled − already-claimed</code>, so it nets to zero right after you claim.</p>

          <h2 id="tokenomics">Tokenomics</h2>
          <p>THKT is a <strong>fixed-supply</strong> token — there is no minting. Rewards are paid from a pre-funded pool, and compute payments refill that pool. This mirrors a launchpad token (fixed supply, no team mint).</p>
          <table className="docs-table">
            <tbody>
              <tr><th>Total supply</th><td>1,000,000,000 THKT (fixed)</td></tr>
              <tr><th>Rewards pool</th><td>350,000,000 THKT, held by the distributor</td></tr>
              <tr><th>Reward rate</th><td>1 THKT per verified minute (testnet)</td></tr>
              <tr><th>Operator bond</th><td>1,000 THKT minimum</td></tr>
              <tr><th>Refill</th><td>compute-job payments flow back into the pool</td></tr>
            </tbody>
          </table>
          <p>The loop: <em>buyers pay THKT → pool → operators earn → claim</em>. When the pool empties, claims pause until it's refilled by compute revenue — no inflation.</p>

          <h2 id="contracts">Contracts</h2>
          <p>Network: <strong>Robinhood Chain Testnet</strong> · chain ID <code>46630</code> · gas token ETH.</p>
          <table className="docs-table">
            <tbody>
              <tr><th>RPC</th><td><code>{RPC}</code></td></tr>
              <tr><th>Explorer</th><td><a href="https://explorer.testnet.chain.robinhood.com">explorer.testnet.chain.robinhood.com</a></td></tr>
              <tr><th>THKT token</th><td><code>{TOKEN}</code></td></tr>
              <tr><th>NodeStaking</th><td><code>{STAKING}</code></td></tr>
              <tr><th>RewardsDistributor</th><td><code>{DIST}</code></td></tr>
            </tbody>
          </table>

          <h2 id="api">Coordinator API</h2>
          <p>Base URL: <code>{COORD}</code></p>
          <table className="docs-table">
            <thead><tr><th>Endpoint</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>GET /health</code></td><td>Status, DRY mode, epoch cadence</td></tr>
              <tr><td><code>GET /stats</code></td><td>Nodes, active nodes, minutes, THKT earned, pool balance</td></tr>
              <tr><td><code>GET /node/{`{address}`}</code></td><td>One operator's live status + earnings + claim proof</td></tr>
              <tr><td><code>GET /claims</code></td><td>Cumulative claim table (address → amount + proof)</td></tr>
              <tr><td><code>POST /register</code></td><td>Register a node (signed; requires on-chain bond)</td></tr>
              <tr><td><code>POST /heartbeat</code></td><td>Signed heartbeat; returns challenges and assigned jobs</td></tr>
              <tr><td><code>GET /compute/price</code></td><td>Price per compute job (THKT)</td></tr>
              <tr><td><code>POST /jobs</code></td><td>Submit a paid job (payment verified on-chain)</td></tr>
              <tr><td><code>GET /jobs/{`{id}`}</code></td><td>Poll a job's status + result</td></tr>
            </tbody>
          </table>

          <h2 id="faq">FAQ</h2>
          <h3>Do I need a GPU to run a node?</h3>
          <p>Not right now — the current verification and jobs are light and run on any PC. A real GPU-model runtime is on the roadmap; that step would require actual GPUs.</p>
          <h3>Where does earned THKT come from?</h3>
          <p>A pre-funded pool held by the RewardsDistributor — tokens are transferred, never minted. Compute payments refill the pool.</p>
          <h3>Is this audited / mainnet?</h3>
          <p>No. Thicket is on testnet and unaudited. THKT has no real value here.</p>
          <h3>Is it open source?</h3>
          <p>Yes — <a href="https://github.com/Thicketrh-xyz/Thicket">github.com/Thicketrh-xyz/Thicket</a> (MIT).</p>

          <p style={{ marginTop: 40, color: "var(--text-muted)" }}>🌿 Thicket — decentralized GPU network on Robinhood Chain. Testnet · not audited.</p>
        </main>
      </div>
    </>
  );
}
