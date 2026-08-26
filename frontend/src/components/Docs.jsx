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

          <h3>The numbers behind the loop</h3>
          <p>All of these are coordinator settings and can change; the live values are the ones the coordinator is running with, not necessarily the defaults below.</p>
          <table className="docs-table">
            <tbody>
              <tr><th>Heartbeat</th><td>Every 30s by default. Miss <strong>90s</strong> and you count as offline — the gap earns nothing, and time only accrues <em>between</em> two heartbeats.</td></tr>
              <tr><th>Challenge interval</th><td>About every <strong>10 minutes</strong> per node.</td></tr>
              <tr><th>Challenge deadline</th><td><strong>60s</strong> to answer. Missing it is treated as <em>absent</em>, not wrong — no strike.</td></tr>
              <tr><th>Wrong answer</th><td>Voids <strong>everything unsettled</strong> in that window — both minutes online and work earnings — and adds a strike.</td></tr>
              <tr><th>Slash threshold</th><td><strong>3 strikes</strong>. A passed challenge resets the counter, so the three are effectively consecutive.</td></tr>
              <tr><th>Slash amount</th><td><strong>100 THKT</strong> from self-stake, capped at whatever is staked.</td></tr>
              <tr><th>Epoch</th><td><strong>60s</strong> on the live coordinator. At each close the coordinator publishes one cumulative Merkle root on-chain.</td></tr>
              <tr><th>Held back</th><td>A node awaiting a quorum verdict is skipped that epoch and settles the next one, so a verdict can still void its earnings.</td></tr>
            </tbody>
          </table>

          <h3 id="trust">What is on-chain, and what you are trusting</h3>
          <p>Worth being direct about this, because it decides what you are actually relying on.</p>
          <table className="docs-table">
            <thead><tr><th>On-chain (verifiable)</th><th>Off-chain (coordinator)</th></tr></thead>
            <tbody>
              <tr><td>Your bond and stake</td><td>Whether you were online, and for how long</td></tr>
              <tr><td>Slashes</td><td>Whether your challenge answer was right</td></tr>
              <tr><td>The cumulative rewards root, per epoch</td><td>How much you earned, and the whole claim table</td></tr>
              <tr><td>Your claim, and the pool balance</td><td>Job routing, pricing, and quorum outcomes</td></tr>
              <tr><td>Buyer payments into the pool</td><td>&nbsp;</td></tr>
            </tbody>
          </table>
          <p>The coordinator is a <strong>single trusted service</strong>. It decides what everyone earns and it holds the key that publishes roots and issues slashes. That key can publish any root it likes, so it could in principle assign the pool to itself. Nothing on-chain prevents that today — it is the largest piece of trust in the system and the reason a multisig on that key is a prerequisite for anything beyond testnet.</p>

          <h3>If the coordinator goes down</h3>
          <ul>
            <li><strong>Already-settled rewards are safe.</strong> They live in an on-chain root; you can claim them with the proof whether or not the coordinator is running.</li>
            <li><strong>Unsettled earnings pause.</strong> Minutes and work since the last epoch aren't in a root yet. State is in Postgres, so they survive a restart — but they aren't claimable until an epoch closes.</li>
            <li><strong>Nodes keep retrying.</strong> The client logs the error and carries on heartbeating; it doesn't need restarting.</li>
            <li><strong>Jobs in flight stall.</strong> A buyer's job that was assigned but not returned is requeued after 3 minutes once the coordinator is back.</li>
            <li><strong>Your bond is untouched.</strong> It's on-chain and independent of the coordinator.</li>
          </ul>

          <h2 id="run-a-node">Run a node</h2>
          <p>You need a wallet holding <strong>1,000 THKT</strong> (the operator bond) plus a little testnet ETH for gas.</p>

          <h3>What you need</h3>
          <table className="docs-table">
            <tbody>
              <tr><th>OS</th><td>macOS, Linux, or Windows. Python 3.10+. Tested most on macOS.</td></tr>
              <tr><th>GPU</th><td>Not required. Uptime and challenges are CPU work. A GPU mainly makes <em>paid jobs</em> faster, which is what earns.</td></tr>
              <tr><th>RAM</th><td>8GB serves <code>llama3.2:1b</code> text jobs. Vision (<code>llava:7b</code>) wants 16GB. A node sizes its context window to the job — up to 32k tokens on a long document — and that is where memory goes. Lower it with <code>THICKET_MAX_CTX</code>.</td></tr>
              <tr><th>Disk</th><td>~2GB for the text model, ~5GB for vision, plus room for Ollama itself.</td></tr>
              <tr><th>Bandwidth</th><td>Light. A heartbeat every 30s and job payloads; a vision job carries a base64 image.</td></tr>
              <tr><th>Uptime</th><td>Miss 90s of heartbeats and you're offline for that gap. No penalty — you just earn nothing for it.</td></tr>
            </tbody>
          </table>
          <p>Cloud GPU hosts (Vast, RunPod and similar) will run the client fine — it's a normal Python process talking outbound HTTP, with no inbound ports. Weigh the rental cost against what the network actually pays before doing it.</p>

          <div className="callout"><strong>Your private key.</strong> The key controls your bond and your earnings. Use <code>--save-key</code> so it lives in the Keychain rather than your shell history. Never paste it into a chat, an issue, a screenshot, or a support request — nobody legitimate will ever ask for it. Anyone who has it can withdraw your stake.</div>

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

          <h3>Is it working?</h3>
          <p>The client prints a line per heartbeat with your accrued minutes, and <code>challenge passed</code> when it answers one. Cross-check from outside:</p>
          <div className="code">{`curl ${COORD}/node/0xYOUR_ADDRESS`}</div>
          <p>Look for <code>online: true</code>, <code>contribution_minutes</code> climbing, and <code>work_thkt</code> moving once you've served jobs. The <a href="/app#dashboard">dashboard</a> shows the same thing. If <code>registered</code> is false, the node never registered — check the bond.</p>

          <h3>Stopping and restarting</h3>
          <p><code>Ctrl+C</code> is safe. Your bond stays staked, settled earnings stay claimable, and unsettled minutes stay in the coordinator's database. You stop accruing while it's off and resume on the next heartbeat. There's no penalty for going offline — only for answering a challenge wrongly.</p>

          <h3>Several machines, one wallet?</h3>
          <p>Don't. A node is identified by its wallet address, so two machines signing as the same address are treated as one node — their heartbeats overwrite each other, and a challenge issued to one may be answered by the other. Use a separate wallet per machine, each bonded separately.</p>

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
            <li><strong>Delegate</strong> — stake THKT to an existing operator. <strong>Delegation does not currently earn rewards.</strong> The staking contract tracks delegated stake, but the coordinator pays only the operator address that ran the work — there is no commission split implemented yet. Delegate only if you intend to signal support for an operator; you will not receive a share.</li>
          </ul>
          <p>Unbonding has a 7-day cooldown before withdrawn stake is claimable. The period and the minimum bond are both owner-adjustable on the contract.</p>
          <p><strong>Where slashed stake goes.</strong> A slash transfers the amount out of the operator's self-stake to the contract owner (the treasury). It is not burned and it does not go back into the rewards pool.</p>
          <div className="callout"><strong>Known gap.</strong> The coordinator checks your bond when you <em>register</em>, not on every heartbeat. An operator who unbonds after registering keeps earning until the coordinator is restarted or they re-register. This is a hole in the anti-sybil model, not a feature — it will be closed by re-checking the bond periodically.</div>

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

          <h3>Job states</h3>
          <table className="docs-table">
            <tbody>
              <tr><th><code>pending</code></th><td>Paid and queued; waiting for a capable node's next heartbeat.</td></tr>
              <tr><th><code>assigned</code></th><td>A node has it. Unreturned after <strong>3 minutes</strong> it goes back to <code>pending</code> for someone else.</td></tr>
              <tr><th><code>verifying</code></th><td>Spot-checked: several nodes are running it and the majority will decide the answer.</td></tr>
              <tr><th><code>done</code></th><td>Finished. <code>result</code> holds the output.</td></tr>
              <tr><th><code>failed</code></th><td>The node reported it couldn't complete it; <code>result</code> carries the reason.</td></tr>
            </tbody>
          </table>

          <h3>When things go wrong</h3>
          <p>Be aware of what the network does <em>not</em> do today:</p>
          <ul>
            <li><strong>There are no refunds.</strong> Payment goes into the rewards pool on-chain before the job runs, and nothing can pull it back out. A job that ends <code>failed</code> is not refunded.</li>
            <li><strong>A stalled job is retried, not lost.</strong> Requeued after 3 minutes, repeatedly, until a node completes it.</li>
            <li><strong>Nothing expires.</strong> With no capable node online a job sits <code>pending</code> indefinitely. Check <code>capabilities</code> on <code>/stats</code> before paying.</li>
            <li><strong>Oversized input is refused before payment</strong> — <code>413</code>, not a truncated answer.</li>
          </ul>

          <h3>Calling it directly</h3>
          <p>Quote first — no wallet needed, and it tells you the price and whether the input fits:</p>
          <div className="code">{`curl -X POST ${COORD}/compute/quote \\
  -H 'Content-Type: application/json' \\
  -d '{"kind":"text","prompt":"Summarise this."}'

{"price_thkt": 5.03, "chars": 16, "max_chars": 95000, "too_large": false}`}</div>
          <p>Then pay on-chain and submit the transaction hash. The coordinator re-prices server-side and verifies the payment before accepting:</p>
          <div className="code">{`curl -X POST ${COORD}/jobs \\
  -H 'Content-Type: application/json' \\
  -d '{"kind":"text","prompt":"Summarise this.",
       "payer":"0xYOUR_ADDRESS","payment_tx":"0xTX_HASH","payment_thkt":5.03}'

{"id": "1e2d447e4805116b", "status": "pending", "price_thkt": 5.03, "verified": false}`}</div>
          <p>Then poll <code>GET /jobs/{`{id}`}</code> until <code>status</code> is <code>done</code> or <code>failed</code>. The <a href="#sdk">SDK</a> does all of this in one call, including the on-chain payment.</p>

          <h3>Errors you'll actually hit</h3>
          <table className="docs-table">
            <tbody>
              <tr><th><code>400</code></th><td>Malformed job — empty prompt, a vision job with no image, or a payment tx already used.</td></tr>
              <tr><th><code>402</code></th><td>Payment missing, short of the server-side price, or not verifiable on-chain.</td></tr>
              <tr><th><code>413</code></th><td>Input longer than <code>max_chars</code>. Split it into a bulk batch.</td></tr>
              <tr><th><code>404</code></th><td>No such job or batch.</td></tr>
              <tr><th><code>401</code> / <code>403</code></th><td>Node endpoints only: bad signature, or not bonded on-chain.</td></tr>
            </tbody>
          </table>
          <p>Buyer endpoints need no key or auth — payment is the authorisation, and it's checked on-chain. Node endpoints (<code>/register</code>, <code>/heartbeat</code>, result submission) require an EIP-191 signature from the operator wallet, and heartbeats carry a timestamp that must be fresh, so a captured one can't be replayed.</p>

          <h2 id="claim">Claiming rewards</h2>
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
              <tr><th>Treasury</th><td>650,000,000 THKT — everything not in the rewards pool, held by the deploying wallet. No separate team, investor, or advisor allocation has been carved out of it.</td></tr>
              <tr><th>Live figures</th><td>Pool balance and total earned are on <code>{`GET /stats`}</code>; the token contract is on the explorer below.</td></tr>
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
          <h3>Why is my node showing offline?</h3>
          <p>Offline means no heartbeat in 90 seconds. Check the client is still running and printing lines; check it can reach the coordinator (<code>curl {COORD}/health</code>); and check the clock on the machine — heartbeats are signed with a timestamp and a badly-skewed clock is rejected as stale. Going offline costs you only the time; there's no penalty.</p>

          <h3>Why did my challenge fail?</h3>
          <p>A challenge fails when the answer doesn't match. Almost always that means a modified or out-of-date client — the solver has to match the coordinator's exactly. Pull the latest and reinstall. If you're one of three nodes cross-checking a task, "failed" can also mean you were outvoted by the other two. Not answering at all isn't a failure; it counts as absent.</p>

          <h3>Why is my claimable zero?</h3>
          <p>See <a href="#claim">Claiming rewards</a> — usually no epoch has closed yet, or you've already claimed everything in the current root.</p>

          <h3>I unbonded — where's my THKT?</h3>
          <p>Queued for 7 days, then withdrawable. Unbonding below the 1,000 minimum also unregisters your operator record on-chain, so re-register before running a node again.</p>

          <h3>Wrong network or RPC?</h3>
          <p>The portal will prompt to add or switch to the right chain. If transactions fail with nothing on the explorer, you're on the wrong network. Node-side, check <code>ROBINHOOD_RPC</code> in <code>node/.env</code>. Chain ID and RPC are in <a href="#contracts">Contracts</a>.</p>

          <h3>Can I run several nodes from one wallet?</h3>
          <p>No — see <a href="#run-a-node">Run a node</a>. One wallet per machine.</p>

          <h3>Is this audited, or on mainnet?</h3>
          <p><strong>No, and no.</strong> Thicket runs on Robinhood Chain <strong>testnet</strong> and the contracts have not been audited. THKT here has no monetary value and testnet gas is free. Nothing you stake is real money.</p>
          <p>Before any mainnet deployment could be honest, three things have to happen: an external audit of all three contracts; a multisig on the publisher and owner keys, because whoever holds the publisher key today can assign the entire 350M pool to themselves; and legal review. None of it is done. If you ever see a Thicket "mainnet" claiming otherwise, check it against this repository first.</p>

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
