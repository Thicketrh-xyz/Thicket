import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { ArrowUpRight } from "lucide-react";
import { registerOperator, delegate, getStakingInfo } from "../lib/chain";
import { CONTRACTS_LIVE, explorerTx } from "../config";
import { SectionLabel } from "./SiteChrome";

const fmt = (wei) => (wei == null ? "—" : Number(formatUnits(wei, 18)).toLocaleString("en-US"));

export function StakePanel({ session, notify }) {
  const [tab, setTab] = useState("operator");
  const [amount, setAmount] = useState("");
  const [nodeId, setNodeId] = useState("node-1");
  const [operator, setOperator] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [info, setInfo] = useState(null);

  const loadInfo = useCallback(async () => {
    if (!session || !CONTRACTS_LIVE) return setInfo(null);
    try {
      const i = await getStakingInfo(session.signer, session.address);
      setInfo(i);
      setAmount((a) => a || (i ? formatUnits(i.minStake, 18) : ""));
    } catch { setInfo(null); }
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
    } finally { setBusy(false); }
  }

  const insufficient = info && amount && Number(amount) > Number(formatUnits(info.balance, 18));
  const alreadyOperator = tab === "operator" && info?.registered;

  return (
    <section className="section-block" id="stake">
      <SectionLabel>Stake</SectionLabel>
      <div className="page-intro" style={{ padding: "10px 0 24px" }}>
        <h1 style={{ fontSize: "1.9rem" }}>Bond in, or back an operator.</h1>
        <p>Stake to run your own node, or delegate to one and share the rewards it earns.</p>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="tabs">
            <button className={tab === "operator" ? "is-active" : ""} onClick={() => setTab("operator")}>Run a node</button>
            <button className={tab === "delegate" ? "is-active" : ""} onClick={() => setTab("delegate")}>Delegate</button>
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
              <span>Amount (THKT)</span>
              {info && <span>Balance {fmt(info.balance)} · min {fmt(info.minStake)}</span>}
            </label>
            <input className="input" type="number" min="0" placeholder="1000"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          {alreadyOperator && (
            <div className="note">✓ This wallet is bonded — {fmt(info.selfStake)} THKT staked as an operator.</div>
          )}

          <button className="button button--primary" style={{ marginTop: 14 }} onClick={submit}
            disabled={busy || !session || !CONTRACTS_LIVE || alreadyOperator || insufficient}>
            {busy ? (status?.text || "Confirming…") : tab === "operator" ? "Bond & register" : "Delegate"}
          </button>

          {!session && <p className="hint">Connect your wallet to stake.</p>}
          {insufficient && <p className="hint">Not enough THKT in this wallet.</p>}
          {status?.hash && (
            <p className="hint">
              {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">view transaction <ArrowUpRight size={12} /></a>
            </p>
          )}
        </div>

        <div className="panel">
          <h3>Why stake?</h3>
          <div style={{ marginTop: 12 }}>
            <div className="kv-row"><span className="k">Operator bond</span><span className="v">Slashable</span></div>
            <div className="kv-row"><span className="k">Anti-sybil</span><span className="v">Bond + live challenges</span></div>
            <div className="kv-row"><span className="k">Delegators</span><span className="v">Earn without hardware</span></div>
            <div className="kv-row"><span className="k">Unbonding</span><span className="v">7-day cooldown</span></div>
          </div>
          <p className="panel__hint" style={{ marginTop: 16, marginBottom: 0 }}>
            A node that fails its challenges has its earnings voided and, on repeated failure, its bond slashed.
          </p>
        </div>
      </div>
    </section>
  );
}
