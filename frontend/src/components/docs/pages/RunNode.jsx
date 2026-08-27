import { COORD } from "../shared";

export function RunNode() {
  return (
    <>
      <h2 id="run-a-node">Run a node</h2>
      <p>You need a wallet holding <strong>1,000 THKT</strong> (the operator bond) plus a little testnet ETH for gas.</p>

      <h3>What you need</h3>
      <table className="docs-table">
        <tbody>
          <tr><th>OS</th><td>macOS, Linux, or Windows. Python 3.10+.</td></tr>
          <tr><th>GPU</th><td>Not required. Uptime and challenges are CPU work. A GPU makes <em>paid jobs</em> faster.</td></tr>
          <tr><th>RAM</th><td>8GB serves <code>llama3.2:1b</code> text jobs. Vision (<code>llava:7b</code>) wants 16GB. A node sizes its context window to the job up to 32k tokens on a long document and that is where memory goes. Lower it with <code>THICKET_MAX_CTX</code>.</td></tr>
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
    </>
  );
}
