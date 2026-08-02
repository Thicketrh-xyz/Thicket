import { useState } from "react";
import { registerOperator, delegate } from "../lib/chain";

export function StakePanel({ session, notify }) {
  const [tab, setTab] = useState("operator");
  const [amount, setAmount] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!session) return notify("Connect your wallet first.");
    if (!amount || Number(amount) <= 0) return notify("Enter an amount.");
    try {
      setBusy(true);
      if (tab === "operator") {
        await registerOperator(session.signer, nodeId || "node-1", amount);
        notify(`Bonded ${amount} THKT — node registered.`);
      } else {
        if (!operator) return notify("Enter an operator address.");
        await delegate(session.signer, operator, amount);
        notify(`Delegated ${amount} THKT.`);
      }
    } catch (e) {
      notify(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" id="stake" style={{ paddingTop: 0 }}>
      <div className="container">
        <h2>Stake</h2>
        <p className="sub">Bond as an operator to run a node, or delegate to one and share its rewards.</p>

        <div className="grid2">
          <div className="card">
            <div className="tabs">
              <button className={tab === "operator" ? "active" : ""} onClick={() => setTab("operator")}>Run a node</button>
              <button className={tab === "delegate" ? "active" : ""} onClick={() => setTab("delegate")}>Delegate</button>
            </div>

            {tab === "operator" ? (
              <div className="field">
                <label>Node ID</label>
                <input className="input" placeholder="node-1" value={nodeId} onChange={(e) => setNodeId(e.target.value)} />
              </div>
            ) : (
              <div className="field">
                <label>Operator address</label>
                <input className="input" placeholder="0x…" value={operator} onChange={(e) => setOperator(e.target.value)} />
              </div>
            )}

            <div className="field">
              <label>Amount (THKT)</label>
              <input className="input" type="number" min="0" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            <button className="btn" onClick={submit} disabled={busy}>
              {busy ? "Confirming…" : tab === "operator" ? "Bond & register" : "Delegate"}
            </button>
          </div>

          <div className="card">
            <h3>Why stake?</h3>
            <div style={{ marginTop: 10 }}>
              <div className="kv"><span className="k">Operator bond</span><span className="v">Skin in the game — slashable</span></div>
              <div className="kv"><span className="k">Anti-sybil</span><span className="v">Bond + live challenges</span></div>
              <div className="kv"><span className="k">Delegators</span><span className="v">Earn without hardware</span></div>
              <div className="kv"><span className="k">Unbonding</span><span className="v">7-day cooldown</span></div>
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
              A node that fails its inference challenges has its earnings voided and, on repeated
              failure, its bond slashed.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
