# Thicket SDK

Buy verified AI compute from a wallet — no account, no card, no API key.

That's the point: an autonomous agent can't complete a billing signup, but it can
hold a wallet and spend tokens.

```bash
pip install web3 requests pillow
```

```python
from thicket import Thicket

t = Thicket(private_key="0x...")          # a wallet holding THKT + a little gas
print(t.run("Summarise this: ...").output)
```

That one call approves THKT, pays into the rewards pool on-chain, submits the job,
waits for a node to run it, and hands back the result.

## Before you spend anything

```python
t.balance()                 # THKT in this wallet
t.capabilities()            # what the network can serve now, e.g. ['text', 'vision']
t.quote("some long text")   # exact price, in THKT, before committing
```

## Running work

```python
# text
res = t.run("Extract every date mentioned", document=open("report.txt").read())

# a document straight from disk
res = t.run("Summarise the key risks", document=open("contract.txt").read())

# images
res = t.caption("chart.png", "What trend does this show?")

res.ok          # True when status == "done"
res.output      # the model's answer
res.price_thkt  # what it cost
res.node        # which operator ran it
```

## Bulk work

One payment, many items, fanned out across every capable node — far faster than
submitting one at a time.

```python
rows = [line for line in open("products.csv")][1:]

res = t.run_batch(
    "Summarise this row in five words",
    rows,
    on_progress=lambda done, total: print(f"{done}/{total}"),
)

print(res.done, "of", res.total, "completed")
for text in res.outputs():
    print(text)
```

`t.quote_batch(instruction, items)` prices the whole thing first. There's no bulk
discount — the compute cost is the same — what you gain is a single payment and
parallel execution.

## Guards

Every job is checked before any THKT moves:

| Situation | What happens |
|---|---|
| No node can serve this job type | Refused — you don't pay for work nobody can do |
| Wallet can't cover the price | Refused, with the shortfall named |
| Price above your `max_price` | Refused |
| Node fails the job | `res.ok` is `False`, `res.output` explains why |

```python
res = t.run(prompt, max_price=25)     # never spend more than 25 THKT
```

## Notes

- **Timeouts**: `run(..., timeout=300)`. On timeout the job is still paid for and may
  still finish — poll `GET /jobs/{id}`.
- **Images**: vision models can't decode every format (WebP notably fails). With
  Pillow installed the SDK converts and downscales automatically.
- **Network**: defaults to Robinhood Chain testnet. Override `coordinator`, `rpc`,
  `token`, `distributor` in the constructor to point elsewhere.

Full flow, if you'd rather call the API directly: approve THKT → `fund()` on the
distributor → `POST /jobs` with the tx hash → poll `GET /jobs/{id}`.
