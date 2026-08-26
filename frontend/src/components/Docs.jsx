import { SiteHeader, SiteFooter, SectionLabel } from "./SiteChrome";
import "../ref-landing.css";
import "../app-docs.css";

const RPC = "https://rpc.testnet.chain.robinhood.com/rpc";
const COORD = "https://thicket-production.up.railway.app";
const TOKEN = "0x4D4837ddb309a8dCeC3Abe727dbfED584771aEE2";
const STAKING = "0x434A64884B7C373eE145f11Ac9b7393723Ee5059";
const DIST = "0xD5afab6f1d786be0fad6281b9c842D0662Fa88e5";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/#verification", label: "How it works" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: "/app", label: "Portal" },
];

const SIDE = [
  { group: "Getting started", links: [["overview", "Overview"], ["how-it-works", "How it works"], ["run-a-node", "Run a node"]] },
  { group: "Participate", links: [["staking", "Staking & delegation"], ["compute", "Run compute"], ["verification", "How work is verified"], ["claim", "Claiming rewards"]] },
  { group: "Build", links: [["sdk", "Agent SDK"], ["api", "Coordinator API"]] },
  { group: "Reference", links: [["tokenomics", "Tokenomics"], ["contracts", "Contracts"], ["faq", "FAQ"]] },
];

export function Docs() {
  return (
    <div id="top" className="site-shell">
      <SiteHeader links={NAV} />

      <div className="docs-layout">
        <aside className="docs-side">
          {SIDE.map((g) => (
            <div key={g.group}>
              <div className="docs-side__group">{g.group}</div>
              {g.links.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
            </div>
          ))}
        </aside>

        <main className="docs-main">
          <SectionLabel>Documentation</SectionLabel>
          <h1>Thicket documentation</h1>
          <p className="lede">
            A decentralized GPU network. Run a node, contribute AI compute, and earn THKT —
            live on Robinhood Chain testnet.
          </p>

          <h2 id="overview">Overview</h2>
          <p>Thicket turns idle GPUs into a shared network for AI compute. Operators run a node, pass verification challenges, and earn <strong>THKT</strong> two ways: a rate per minute online, plus a share of what buyers paid for the jobs they actually complete. Buyers pay THKT to run inference jobs, and those payments refill the pool that pays the operators.</p>
          <p>It's a <strong>hybrid model</strong>: uptime is a subsidy so a node is worth running before work exists, and completed work is what actually pays. Bonding plus live challenges keep the network sybil-resistant without requiring ZK proofs at this stage.</p>
          <div className="callout">Testnet only, unaudited. THKT has no real value here. Do not put real funds behind it.</div>

          <h2 id="how-it-works">How it works</h2>
          <ol>
            <li><strong>Bond &amp; register</strong> — stake THKT to register your node (skin in the game, slashable).</li>
            <li><strong>Stay online</strong> — the node sends signed heartbeats; the network credits contribution minutes.</li>
            <li><strong>Do work</strong> — completed jobs earn a share of what the buyer paid, on top of the uptime rate.</li>
            <li><strong>Pass challenges</strong> — periodic verifiable tasks prove the node is really working. Wrong answers void that window's earnings — both time and work — and repeated failures slash the bond.</li>
            <li><strong>Settle &amp; claim</strong> — each epoch the coordinator publishes a cumulative-rewards Merkle root on-chain; you claim your delta in one transaction.</li>
          </ol>
          <p>Rewards accrue off-chain and settle as one root per epoch, so per-minute earnings never require per-minute gas.</p>

          <h2 id="run-a-node">Run a node</h2>
          <p>Any PC works — no GPU needed yet. You need a wallet holding <strong>1,000 THKT</strong> (the operator bond) plus a little testnet ETH for gas.</p>

          <h3>1. Get the code and install</h3>
          <div className="code">{`git clone https://github.com/Thicketrh-xyz/Thicket.git
cd Thicket/node
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`}</div>

          <h3>2. Need a wallet? Make one</h3>
          <p>Skip this if you already have one. Save what it prints, then send that address 1,000+ THKT and a little testnet ETH.</p>
          <div className="code">{`.venv/bin/python -m thicket_node.client --new-wallet`}</div>

          <h3>3. Save your key once</h3>
          <p>On macOS, store the key in the Keychain so you never type it again. macOS collects it at its own prompt, so it never reaches your shell history.</p>
          <div className="code">{`.venv/bin/python -m thicket_node.client --save-key`}</div>

          <h3>4. Start earning</h3>
          <div className="code">{`.venv/bin/python -u -m thicket_node.client`}</div>
          <p>The node bonds itself on-chain, registers, and starts earning. Watch it live in the <a href="/app#dashboard">portal</a>. Press <code>Ctrl+C</code> to stop — your bond stays staked.</p>

          <h3>Serve real AI jobs (optional)</h3>
          <p>Uptime alone earns THKT. To also receive <strong>paid compute jobs</strong>, install <a href="https://ollama.com">Ollama</a> and pull a model. The node detects what you have and advertises only what it can actually run.</p>
          <div className="code">{`ollama pull llama3.2:1b     # text jobs
ollama pull llava:7b        # image -> text (captioning)`}</div>
          <p>Restart the node and it prints what it can serve. Without Ollama it says so plainly and keeps earning from uptime — it just won't be handed jobs it can't do.</p>

          <h3>Ways to give it your key</h3>
          <table className="docs-table">
            <thead><tr><th>Method</th><th>Command</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Keychain <em>(best, macOS)</em></td><td><code>--save-key</code></td><td>Saved once, encrypted at rest. macOS prompts for it directly, so it never touches the command line or shell history. Remove it with <code>--forget-key</code></td></tr>
              <tr><td>Prompt</td><td><code>… -m thicket_node.client</code></td><td>Asks each time; input stays hidden</td></tr>
              <tr><td>File</td><td><code>echo 'THICKET_PRIVATE_KEY=0x…' &gt;&gt; .env</code></td><td>Plaintext on disk — run <code>chmod 600 .env</code>. The only option off macOS</td></tr>
              <tr><td>Flag <em>(avoid)</em></td><td><code>--key 0xYOUR_KEY</code></td><td>Lands in your shell history and the process list</td></tr>
            </tbody>
          </table>
          <p>Whichever you use, the order is: <code>--key</code>, then <code>THICKET_PRIVATE_KEY</code>/<code>.env</code>, then the Keychain, then an interactive prompt.</p>

          <h3>Handy flags</h3>
          <div className="code">{`--save-key            # store your key in the macOS Keychain
--forget-key          # remove it again
--new-wallet          # generate a wallet and exit
--node-id my-rig      # name this node
--bond 2000           # bond more than the minimum
--skip-bond           # already bonded via the web app
--interval 15         # seconds between heartbeats
--help                # everything`}</div>

          <h2 id="staking">Staking &amp; delegation</h2>
          <p>Two ways to stake, both in the portal's <a href="/app#stake">Stake</a> tab:</p>
          <ul>
            <li><strong>Run a node</strong> — bond THKT (minimum 1,000) to register as an operator. Your bond is slashable if your node fails challenges.</li>
            <li><strong>Delegate</strong> — stake THKT to an existing operator and share their rewards without running hardware.</li>
          </ul>
          <p>Unbonding has a 7-day cooldown before withdrawn stake is claimable.</p>

          <h2 id="compute">Run compute</h2>
          <p>Buyers pay THKT to run a job. The payment goes into the rewards pool via the distributor's <code>fund()</code> function, then the coordinator assigns the job to an online node, which executes it and returns the result.</p>
          <ol>
            <li>Connect a wallet in the portal's <a href="/app#compute">Compute</a> tab and submit a prompt.</li>
            <li>Approve and pay the quoted price — this funds the pool. Pricing is <strong>5 THKT base + 2 per 1,000 characters</strong>, plus 4 for an image. You are quoted before you pay, and the price is recalculated server-side on submit.</li>
            <li>A node picks up the job on its next heartbeat, runs it, and posts the result.</li>
          </ol>
          <p>Two kinds of job are supported today:</p>
          <ul>
            <li><strong>Text</strong> — send a prompt, get generated text back.</li>
            <li><strong>Image → text</strong> — upload an image and ask about it (captioning, description).</li>
          </ul>
          <div className="callout">Jobs are only routed to nodes that advertise the matching capability, so a text-only node never receives vision work. Payment is verified on-chain before a job runs. Image <em>generation</em> needs a diffusion runtime and isn't supported yet.</div>
          <p><strong>Input size.</strong> A single job is capped at <strong>95,000 characters</strong> — the most a node can actually read in one pass. Anything longer is refused before you pay, rather than accepted and quietly truncated. Split larger work into a <a href="/app#compute">bulk batch</a>.</p>
          <p><strong>Images are priced flat.</strong> Resolution doesn't change the cost: the vision model resizes every image to the same internal grid, so a 9-megapixel photo and a thumbnail take the same work and cost the same. We measured this and removed the per-megapixel charge that used to apply.</p>

          <h2 id="verification">How work is verified</h2>
          <p>A node could take payment and return nonsense. Two mechanisms make that expensive.</p>
          <ul>
            <li><strong>Challenges</strong> — the coordinator issues a deterministic task it can check. Below three online nodes it verifies by recomputing the answer itself.</li>
            <li><strong>Quorum</strong> — with three or more nodes online, the same task goes to <strong>three randomly chosen nodes</strong> and the majority decides. Nodes aren't told they're being cross-checked or who else has the task. Agreeing nodes keep their earnings and split the job's operator share; a node that disagrees has that window's earnings voided and takes a strike, and three strikes slash the bond.</li>
          </ul>
          <p>A sampled share of <em>paid</em> jobs runs this way too, and when it does the buyer receives the answer the majority agreed on rather than whatever the fastest node returned. Verifying everything would triple the network's compute, so most work is policed by the risk of being sampled rather than by being checked.</p>
          <div className="callout">Being honest about the limit: this is <strong>spot-checking, not proof</strong>. If all three nodes disagree the result is inconclusive and nobody is punished — an honest node must never be penalised for legitimate variation. An attacker controlling most of the network could outvote honest nodes; random selection plus the bond is what makes that expensive, and ZK proofs are the eventual answer. Check the live rate at <code>/stats</code>.</div>

          <h2 id="claim">Claiming rewards</h2>
          <p>Earnings accrue live but become <strong>claimable</strong> only when an epoch settles — that's when the on-chain Merkle root updates. In the portal, "Earned" ticks up continuously while "Claimable" updates each epoch. Claimable is always <code>settled − already-claimed</code>, so it nets to zero right after you claim.</p>

          <h2 id="sdk">Agent SDK</h2>
          <p>An autonomous agent can't open an account, add a card, or click through a billing flow — but it can hold a wallet. The SDK turns a job into a single call: approve THKT, pay into the rewards pool on-chain, submit the job, wait for a node, return the result.</p>

          <h3>Install</h3>
          <div className="code">{`pip install web3 requests pillow
# then copy sdk/thicket.py from the repo next to your code`}</div>

          <h3>Run a job</h3>
          <div className="code">{`from thicket import Thicket

t = Thicket(private_key="0x...")      # wallet with THKT + a little gas

print(t.balance())                     # THKT available
print(t.capabilities())                # e.g. ['text', 'vision']
print(t.quote("some long text"))       # exact price before committing

res = t.run("Summarise this in one line: ...")
print(res.output)`}</div>

          <h3>Documents and images</h3>
          <div className="code">{`# attach a document to an instruction
res = t.run("List every date mentioned", document=open("report.txt").read())

# vision jobs
res = t.caption("chart.png", "What trend does this show?")

res.ok          # True when the node completed it
res.output      # the model's answer
res.price_thkt  # what it cost
res.node        # which operator ran it`}</div>

          <h3>Bulk work</h3>
          <p>One payment covering many items, fanned out across every capable node. A batch finishes far faster than submitting items one at a time — each node takes several at once rather than one per heartbeat.</p>
          <div className="code">{`rows = [line for line in open("products.csv")][1:]

res = t.run_batch(
    "Summarise this row in five words",
    rows,
    on_progress=lambda done, total: print(f"{done}/{total}"),
)

print(res.done, "of", res.total, "completed")
for text in res.outputs():
    print(text)`}</div>
          <p><code>t.quote_batch(instruction, items)</code> prices the whole batch before you commit. There's no bulk discount — the compute cost is the same — what you gain is a single payment and parallel execution.</p>

          <h3>Spending guards</h3>
          <p>Every job is checked <em>before</em> any THKT moves:</p>
          <table className="docs-table">
            <thead><tr><th>Situation</th><th>What happens</th></tr></thead>
            <tbody>
              <tr><td>No node can serve this job type</td><td>Refused — you don't pay for work nobody can do</td></tr>
              <tr><td>Wallet can't cover the price</td><td>Refused, naming the shortfall</td></tr>
              <tr><td>Price above your <code>max_price</code></td><td>Refused</td></tr>
              <tr><td>Node fails the job</td><td><code>res.ok</code> is false and <code>res.output</code> explains why</td></tr>
            </tbody>
          </table>
          <div className="code">{`res = t.run(prompt, max_price=25)   # never spend more than 25 THKT`}</div>

          <div className="callout">
            Prefer to call the API directly? The same flow is: approve THKT →
            <code> fund()</code> on the distributor → <code>POST /jobs</code> with the tx hash →
            poll <code>GET /jobs/{`{id}`}</code>. The SDK also converts images to a format vision
            models accept, which raw API callers must handle themselves.
          </div>

          <h2 id="tokenomics">Tokenomics</h2>
          <p>THKT is a <strong>fixed-supply</strong> token — there is no minting. Rewards are paid from a pre-funded pool, and compute payments refill that pool. This mirrors a launchpad token (fixed supply, no team mint).</p>
          <table className="docs-table">
            <tbody>
              <tr><th>Total supply</th><td>1,000,000,000 THKT (fixed)</td></tr>
              <tr><th>Rewards pool</th><td>350,000,000 THKT, held by the distributor</td></tr>
              <tr><th>Uptime rate</th><td>1 THKT per verified minute (testnet)</td></tr>
              <tr><th>Work share</th><td>70% of what the buyer paid, to the node that did the job</td></tr>
              <tr><th>Operator bond</th><td>1,000 THKT minimum</td></tr>
              <tr><th>Refill</th><td>compute-job payments flow back into the pool</td></tr>
            </tbody>
          </table>
          <p>The loop: <em>buyers pay THKT → pool → operators earn → claim</em>. When the pool empties, claims pause until compute revenue refills it — no inflation.</p>
          <p>Paying operators a share of real revenue rather than an open-ended rate per job is deliberate: the pool is finite, so a rate that scales with demand would be an unbounded claim on it. Uptime is the subsidy that keeps a node worth running before demand exists; work is what should pay once it does.</p>

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
              <tr><td><code>GET /stats</code></td><td>Nodes, active nodes, tasks, jobs, pool balance</td></tr>
              <tr><td><code>GET /node/{`{address}`}</code></td><td>One operator's live status, earnings, and claim proof</td></tr>
              <tr><td><code>GET /claims</code></td><td>Cumulative claim table (address → amount + proof)</td></tr>
              <tr><td><code>POST /register</code></td><td>Register a node (signed; requires on-chain bond)</td></tr>
              <tr><td><code>POST /heartbeat</code></td><td>Signed heartbeat; returns challenges and assigned jobs</td></tr>
              <tr><td><code>GET /compute/price</code></td><td>Pricing parameters and the input size limit</td></tr>
              <tr><td><code>POST /compute/quote</code></td><td>Price a job before paying for it</td></tr>
              <tr><td><code>GET /quorums</code></td><td>Recent cross-checks and how each one landed</td></tr>
              <tr><td><code>POST /jobs</code></td><td>Submit a paid job (payment verified on-chain)</td></tr>
              <tr><td><code>GET /jobs/{`{id}`}</code></td><td>Poll a job's status and result</td></tr>
              <tr><td><code>POST /batches</code></td><td>Submit many items under one payment</td></tr>
              <tr><td><code>GET /batches/{`{id}`}</code></td><td>Batch progress and every result</td></tr>
            </tbody>
          </table>

          <h2 id="faq">FAQ</h2>
          <h3>Do I need a GPU to run a node?</h3>
          <p>No, but memory matters. Uptime and challenges run on any PC. Serving <em>paid</em> jobs means running a real model through Ollama, and a node sizes its context window to the job — up to 32k tokens for a long document, which is where the RAM goes. A machine with 8GB will manage <code>llama3.2:1b</code> text jobs; <code>llava:7b</code> vision work wants more. Lower the ceiling with <code>THICKET_MAX_CTX</code> if your machine is tight. Anything the node can't do it simply doesn't advertise, so it's never handed work it would fail.</p>
          <h3>Where does earned THKT come from?</h3>
          <p>A pre-funded pool held by the RewardsDistributor — tokens are transferred, never minted. Compute payments refill the pool.</p>
          <h3>Is this audited or on mainnet?</h3>
          <p>No. Thicket is on testnet and unaudited. THKT has no real value here.</p>
          <h3>Is it open source?</h3>
          <p>Yes — <a href="https://github.com/Thicketrh-xyz/Thicket">github.com/Thicketrh-xyz/Thicket</a> (MIT).</p>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
