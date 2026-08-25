import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { ArrowUpRight } from "lucide-react";
import { fetchComputePrice, submitJob, fetchJob, fetchStats } from "../lib/api";
import { payForCompute, getPoolBalance } from "../lib/chain";
import { CONTRACTS_LIVE, explorerTx } from "../config";
import { SectionLabel } from "./SiteChrome";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

export function ComputePanel({ session, notify }) {
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState("text");
  const [image, setImage] = useState(null);      // base64, no data: prefix
  const [imageName, setImageName] = useState("");
  const [pricing, setPricing] = useState({ base_thkt: 5, per_1k_chars_thkt: 2, vision_thkt: 10 });
  const [fileName, setFileName] = useState("");
  const [pool, setPool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [job, setJob] = useState(null);

  const [netCaps, setNetCaps] = useState(null);   // what online nodes can serve

  useEffect(() => { fetchComputePrice().then((p) => p && setPricing((x) => ({ ...x, ...p }))); }, []);

  // Never let someone pay for work no online node can do.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await fetchStats();
      if (alive && s) setNetCaps(s.capabilities || []);
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

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

  // Same formula the coordinator uses; it re-checks authoritatively on submit.
  const price = Number((
    pricing.base_thkt +
    (prompt.length / 1000) * pricing.per_1k_chars_thkt +
    (kind === "vision" ? pricing.vision_thkt : 0)
  ).toFixed(2));

  async function run() {
    if (!session) return notify("Connect your wallet to run a job.");
    if (!CONTRACTS_LIVE) return notify("Contracts aren't deployed.");
    if (kind === "text" && !prompt.trim()) return notify("Enter a prompt.");
    if (kind === "vision" && !image) return notify("Choose an image to caption.");
    if (netCaps && !netCaps.includes(kind))
      return notify(`No node online can run ${kind} jobs right now — your THKT would be spent on work nobody can do.`);
    setJob(null); setStatus(null);
    try {
      setBusy(true);
      const tx = await payForCompute(session.signer, price, (text) => setStatus({ text }));
      setStatus({ text: "Submitting job…", hash: tx });
      const j = await submitJob(prompt, session.address, tx, price, kind, image);
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
    <section className="section-block" id="compute">
      <SectionLabel>Run compute</SectionLabel>
      <div className="page-intro" style={{ padding: "10px 0 24px" }}>
        <h1 style={{ fontSize: "1.9rem" }}>Pay THKT. Get verified compute.</h1>
        <p>Your payment flows into the rewards pool that pays the operators — the demand side that funds the network.</p>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="tabs">
            <button className={kind === "text" ? "is-active" : ""} onClick={() => setKind("text")}>Text</button>
            <button className={kind === "vision" ? "is-active" : ""} onClick={() => setKind("vision")}>Image → text</button>
          </div>

          {kind === "vision" && (
            <div className="field">
              <label>Image</label>
              <input className="input" type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) { setImage(null); setImageName(""); return; }
                const reader = new FileReader();
                reader.onload = () => {
                  // strip the "data:image/png;base64," prefix — the model wants raw base64
                  setImage(String(reader.result).split(",")[1] || null);
                  setImageName(f.name);
                };
                reader.readAsDataURL(f);
              }} />
              {imageName && <p className="hint" style={{ marginTop: 8 }}>{imageName} ready</p>}
            </div>
          )}

          {kind === "text" && (
            <div className="field">
              <label>Attach a text file (optional)</label>
              <input className="input" type="file" accept=".txt,.md,.csv,.json,text/*" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) { setFileName(""); return; }
                const reader = new FileReader();
                reader.onload = () => {
                  // Append the document to whatever instruction is already typed.
                  const body = String(reader.result || "");
                  setPrompt((cur) => (cur.trim() ? `${cur.trim()}\n\n${body}` : body));
                  setFileName(f.name);
                };
                reader.readAsText(f);
              }} />
              {fileName && <p className="hint" style={{ marginTop: 8 }}>{fileName} loaded — {prompt.length.toLocaleString()} chars</p>}
            </div>
          )}

          <div className="field">
            <label>
              <span>{kind === "vision" ? "Question about the image" : "Prompt"}</span>
              {prompt.length > 0 && <span>{prompt.length.toLocaleString()} chars</span>}
            </label>
            <textarea className="input" rows={kind === "text" ? 5 : 2}
              placeholder={kind === "vision" ? "Describe this image." : "Ask the network to process something…"}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          {netCaps && !netCaps.includes(kind) && (
            <div className="note" style={{ marginBottom: 14 }}>
              <b>No node can run {kind === "vision" ? "image → text" : kind} jobs right now.</b><br />
              {netCaps.length
                ? `The network currently serves: ${netCaps.join(", ")}.`
                : "No nodes with a model runtime are online."}{" "}
              Payment is disabled so you don't pay for work nobody can do.
            </div>
          )}

          <div className="kv-row" style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}>
            <span className="k">Price for this job</span>
            <span className="v">{price} THKT</span>
          </div>
          <p className="hint" style={{ marginTop: 6, marginBottom: 14 }}>
            {pricing.base_thkt} base + {pricing.per_1k_chars_thkt}/1k chars
            {kind === "vision" ? ` + ${pricing.vision_thkt} image` : ""} — bigger jobs cost the
            node more compute, so they cost more THKT.
          </p>

          <button className="button button--primary" onClick={run}
            disabled={busy || !session || !CONTRACTS_LIVE || (netCaps && !netCaps.includes(kind))}>
            {busy ? (status?.text || "Working…") : `Run job · ${price} THKT`}
          </button>
          {!session && <p className="hint">Connect your wallet to run a job.</p>}
          {status?.hash && (
            <p className="hint">
              {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">payment tx <ArrowUpRight size={12} /></a>
            </p>
          )}
          {job?.result && <div className="note"><b>Result</b><br />{job.result}</div>}
        </div>

        <div className="panel">
          <div className="figure-cap">Rewards pool</div>
          <div className="big-figure">{fmt(pool)}</div>
          <p className="panel__hint" style={{ marginTop: 6 }}>THKT available to pay operators</p>
          <p className="panel__hint" style={{ margin: 0 }}>
            Every job payment refills this pool. That's what makes THKT an economy rather than an inflation faucet.
          </p>
        </div>
      </div>
    </section>
  );
}
