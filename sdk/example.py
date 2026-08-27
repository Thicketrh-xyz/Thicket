"""Minimal agent: check price, buy compute, use the result."""
import os
from thicket import Thicket, ThicketError

t = Thicket(private_key=os.environ["THICKET_PRIVATE_KEY"])

print(f"wallet {t.address}")
print(f"balance {t.balance():.2f} THKT")
print(f"network serves {t.capabilities()}")

# Always quotable before you commit anything.
headline = "Robinhood Chain announces a new upgrade for developers."
print(f"quote: {t.quote(headline)} THKT")

try:
    # One call: approve -> pay on-chain -> submit -> wait for a node.
    res = t.run(f"Summarise this in one sentence:\n\n{headline}", max_price=25)
    print(f"\n[{res.status}] paid {res.price_thkt} THKT to node {res.node}")
    print(res.output)
except ThicketError as e:
    print(f"could not run job: {e}")
