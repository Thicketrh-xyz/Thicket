
export function Sdk() {
  return (
    <>
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
    </>
  );
}
