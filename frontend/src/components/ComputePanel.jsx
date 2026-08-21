import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { fetchComputePrice, submitJob, fetchJob } from "../lib/api";
import { payForCompute, getPoolBalance } from "../lib/chain";
import { CONTRACTS_LIVE, explorerTx } from "../config";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

export function ComputePanel({ session, notify }) {
  const [prompt, setPrompt] = useState("");
  const [price, setPrice] = useState(10);
  const [pool, setPool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { text, hash? }
  const [job, setJob] = useState(null);        // { id, status, result }

  useEffect(() => { fetchComputePrice().then((p) => p && setPrice(p.price_thkt)); }, []);

  useEffect(() => {
    if (!session || !CONTRACTS_LIVE) { setPool(null); return; }
    let alive = true;
    const load = async () => {
      const b = await getPoolBalance(session.signer).catch(() => null);
      if (alive && b != null) setPool(Number(formatUnits(b, 18)));
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [session]);

  async function run() {
    if (!session) return notify("Connect your wallet to run a job.");
    if (!CONTRACTS_LIVE) return notify("Contracts aren't deployed.");
    if (!prompt.trim()) return notify("Enter a prompt.");
    setJob(null); setStatus(null);
    try {
      setBusy(true);
      const tx = await payForCompute(session.signer, price, (text) => setStatus({ text }));
      setStatus({ text: "Submitting job…", hash: tx });
      const j = await submitJob(prompt, session.address, tx, price);
      if (!j?.id) throw new Error("Job submission failed");

      setStatus({ text: "Waiting for a node…", hash: tx });
      let done = null;
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const g = await fetchJob(j.id);
        if (g) setJob(g);
        if (g?.status === "done") { done = g; break; }
      }
      if (done) {
        setStatus({ text: "Done", hash: tx });
        notify(`Job complete — ${price} THKT went into the rewards pool.`);
      } else {
        setStatus({ text: "No node picked it up in time — is a node running?", hash: tx });
      }
    } catch (e) {
      setStatus(null);
      notify(e.shortMessage || e.reason || e.message || "Job failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section mist" id="compute">
      <div className="container">
        <h2>Run compute</h2>
        <p className="sub">Pay THKT to run an inference job. Your payment flows into the rewards pool that pays the miners — the demand side that funds the network.</p>

        <div className="grid2">
          <div className="card">
            <div className="field">
              <label>Prompt</label>
              <input className="input" placeholder="Ask the network to process something…"
                value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
            <button className="btn" onClick={run} disabled={busy || !session || !CONTRACTS_LIVE}>
              {busy ? (status?.text || "Working…") : `Run job · ${price} THKT`}
            </button>
            {!session && <p className="muted" style={{ marginTop: 12 }}>Connect your wallet to run a job.</p>}
            {status?.hash && (
              <p className="muted" style={{ marginTop: 12 }}>
                {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">payment tx ↗</a>
              </p>
            )}
            {job?.result && (
              <div className="modal-note" style={{ marginTop: 16 }}>
                <b>Result</b><br />{job.result}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Rewards pool</h3>
            <p className="muted">Every job payment refills this pool — the source miners earn from. This is what makes THKT an economy, not an inflation faucet.</p>
            <div className="big-num" style={{ margin: "12px 0 2px" }}>{fmt(pool)}</div>
            <div className="muted">THKT in the pool</div>
            <p className="muted" style={{ marginTop: 14 }}>
              Placeholder execution for now — a real GPU model runtime plugs in on the node side (roadmap: Sapling).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
