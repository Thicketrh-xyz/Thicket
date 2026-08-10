import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { registerOperator, delegate, getStakingInfo } from "../lib/chain";
import { CONTRACTS_LIVE, explorerTx } from "../config";

const fmt = (wei) => (wei == null ? "—" : Number(formatUnits(wei, 18)).toLocaleString("en-US"));

export function StakePanel({ session, notify }) {
  const [tab, setTab] = useState("operator");
  const [amount, setAmount] = useState("");
  const [nodeId, setNodeId] = useState("node-1");
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { text, hash? }
  const [info, setInfo] = useState(null);      // { balance, minStake, registered, selfStake, ... }

  const loadInfo = useCallback(async () => {
    if (!session || !CONTRACTS_LIVE) return setInfo(null);
    try {
      const i = await getStakingInfo(session.signer, session.address);
      setInfo(i);
      // default the amount to the minimum bond the first time we learn it
      setAmount((a) => a || (i ? formatUnits(i.minStake, 18) : ""));
    } catch {
      setInfo(null);
    }
  }, [session]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  async function submit() {
    if (!session) return notify("Connect your wallet first.");
    if (!CONTRACTS_LIVE) return notify("Contracts aren't deployed yet.");
    if (!amount || Number(amount) <= 0) return notify("Enter an amount.");
    setStatus(null);
    try {
      setBusy(true);
      const onStatus = (text) => setStatus({ text });
      let hash;
      if (tab === "operator") {
        if (info?.registered) return notify("This wallet is already a registered operator.");
        hash = await registerOperator(session.signer, nodeId || "node-1", amount, onStatus);
        notify(`Bonded ${amount} THKT — operator registered.`);
      } else {
        if (!operator) return notify("Enter an operator address.");
        hash = await delegate(session.signer, operator, amount, onStatus);
        notify(`Delegated ${amount} THKT.`);
      }
      setStatus({ text: "Confirmed", hash });
      loadInfo();
    } catch (e) {
      setStatus(null);
      notify(e.shortMessage || e.reason || e.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  const insufficient = info && amount && Number(amount) > Number(formatUnits(info.balance, 18));
  const alreadyOperator = tab === "operator" && info?.registered;

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
              <label>
                Amount (THKT)
                {info && (
                  <span style={{ float: "right", fontWeight: 500 }}>
                    Balance: {fmt(info.balance)} · min {fmt(info.minStake)}
                  </span>
                )}
              </label>
              <input className="input" type="number" min="0" placeholder="1000"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            {alreadyOperator ? (
              <div className="modal-note" style={{ marginBottom: 12 }}>
                ✓ This wallet is bonded — {fmt(info.selfStake)} THKT staked as an operator.
              </div>
            ) : null}

            <button className="btn" onClick={submit}
              disabled={busy || !session || !CONTRACTS_LIVE || alreadyOperator || insufficient}>
              {busy ? (status?.text || "Confirming…")
                : tab === "operator" ? "Bond & register" : "Delegate"}
            </button>

            {!session && <p className="muted" style={{ marginTop: 12 }}>Connect your wallet to stake.</p>}
            {insufficient && <p className="muted" style={{ marginTop: 12, color: "var(--error)" }}>Not enough THKT in this wallet.</p>}
            {status?.hash && (
              <p className="muted" style={{ marginTop: 12 }}>
                {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">view transaction ↗</a>
              </p>
            )}
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
