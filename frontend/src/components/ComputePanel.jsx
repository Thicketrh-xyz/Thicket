import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { ArrowUpRight, X } from "lucide-react";
import { fetchComputePrice, submitJob, fetchJob, fetchStats, submitBatch, fetchBatch } from "../lib/api";
import { payForCompute, getPoolBalance } from "../lib/chain";
import { CONTRACTS_LIVE, explorerTx } from "../config";
import { prepareImage } from "../lib/image";
import { readDocument, DOC_ACCEPT } from "../lib/textfile";
import { SectionLabel } from "./SiteChrome";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

// Bulk splits a file or pasted block into one work item per non-empty line.
const toItems = (raw) => raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function ComputePanel({ session, notify }) {
  const [mode, setMode] = useState("text");            // text | vision | bulk
  const [prompt, setPrompt] = useState("");
  const [doc, setDoc] = useState(null);
  const [image, setImage] = useState(null);
  const [imageName, setImageName] = useState("");
  const [imagePixels, setImagePixels] = useState(0);
  const [rawItems, setRawItems] = useState("");        // bulk: one item per line
  const [itemsName, setItemsName] = useState("");
  const [pricing, setPricing] = useState({ base_thkt: 5, per_1k_chars_thkt: 2, vision_thkt: 4, per_mp_thkt: 0 });
  const [pool, setPool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [job, setJob] = useState(null);
  const [batch, setBatch] = useState(null);
  const [netCaps, setNetCaps] = useState(null);

  const kind = mode === "vision" ? "vision" : "text";   // bulk runs text jobs

  useEffect(() => { fetchComputePrice().then((p) => p && setPricing((x) => ({ ...x, ...p }))); }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => { const s = await fetchStats(); if (alive && s) setNetCaps(s.capabilities || []); };
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

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setPrompt(""); setDoc(null);
    setImage(null); setImageName(""); setImagePixels(0);
    setRawItems(""); setItemsName("");
    setJob(null); setBatch(null); setStatus(null);
  }

  const items = mode === "bulk" ? toItems(rawItems) : [];

  // Instruction and attached document stay separate; joined only at submission.
  const fullPrompt = doc
    ? `${prompt.trim()}\n\n--- attached: ${doc.name} ---\n${doc.text}`
    : prompt;

  const perItem = (text) =>
    pricing.base_thkt + ((prompt.trim() ? prompt.trim().length + 2 : 0) + text.length) / 1000 * pricing.per_1k_chars_thkt;

  const price = Number((
    mode === "bulk"
      ? items.reduce((sum, it) => sum + perItem(it), 0)
      : pricing.base_thkt +
        (fullPrompt.length / 1000) * pricing.per_1k_chars_thkt +
        (mode === "vision" ? pricing.vision_thkt + (imagePixels / 1_000_000) * pricing.per_mp_thkt : 0)
  ).toFixed(2));

  async function run() {
    if (!session) return notify("Connect your wallet to run a job.");
    if (!CONTRACTS_LIVE) return notify("Contracts aren't deployed.");
    if (netCaps && !netCaps.includes(kind))
      return notify(`No node online can run ${kind} jobs right now — your THKT would be spent on work nobody can do.`);

    if (mode === "bulk") {
      if (!items.length) return notify("Add items — one per line, or upload a file.");
      if (!prompt.trim()) return notify("Add an instruction to run against every item.");
    } else if (mode === "vision") {
      if (!image) return notify("Choose an image to caption.");
    } else if (!prompt.trim() && !doc) {
      return notify("Enter a prompt or attach a document.");
    } else if (doc && !prompt.trim()) {
      return notify("Add an instruction — tell the model what to do with the document.");
    }

    setJob(null); setBatch(null); setStatus(null);
    try {
      setBusy(true);
      const tx = await payForCompute(session.signer, price, (text) => setStatus({ text }));

      if (mode === "bulk") {
        setStatus({ text: "Submitting batch…", hash: tx });
        const b = await submitBatch(kind, prompt.trim(), items, session.address, tx, price);
        if (!b?.id) throw new Error("Batch submission failed");

        for (let i = 0; i < 600; i++) {                 // up to ~30 min
          await new Promise((r) => setTimeout(r, 3000));
          const p = await fetchBatch(b.id);
          if (p) setBatch(p);
          if (p?.finished) break;
          setStatus({ text: `Running ${(p?.done ?? 0) + (p?.failed ?? 0)}/${b.items}…`, hash: tx });
        }
        setStatus({ text: "Batch finished", hash: tx });
        notify(`Batch complete — ${price} THKT went into the rewards pool.`);
        return;
      }

      setStatus({ text: "Submitting job…", hash: tx });
      const j = await submitJob(fullPrompt, session.address, tx, price, kind, image, imagePixels);
      if (!j?.id) throw new Error("Job submission failed");

      setStatus({ text: "Waiting for a node…", hash: tx });
      let done = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const g = await fetchJob(j.id);
        if (g) setJob(g);
        if (g?.status === "done" || g?.status === "failed") { done = g; break; }
      }
      if (done?.status === "done") { setStatus({ text: "Done", hash: tx }); notify(`Job complete — ${price} THKT went into the rewards pool.`); }
      else if (done?.status === "failed") setStatus({ text: "The node couldn't complete this job", hash: tx });
      else setStatus({ text: "Still running — check Your jobs below", hash: tx });
    } catch (e) {
      setStatus(null);
      notify(e.shortMessage || e.reason || e.message || "Job failed");
    } finally {
      setBusy(false);
    }
  }

  const unavailable = netCaps && !netCaps.includes(kind);
  const finished = batch ? batch.done + batch.failed : 0;

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
            <button className={mode === "text" ? "is-active" : ""} onClick={() => switchMode("text")}>Text</button>
            <button className={mode === "vision" ? "is-active" : ""} onClick={() => switchMode("vision")}>Image → text</button>
            <button className={mode === "bulk" ? "is-active" : ""} onClick={() => switchMode("bulk")}>Bulk</button>
          </div>

          {mode === "bulk" && (
            <p className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
              One instruction, many items — one payment, fanned out across every capable node.
            </p>
          )}

          {mode === "vision" && (
            <div className="field">
              <label>Image</label>
              <input className="input" type="file" accept="image/*" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) { setImage(null); setImageName(""); setImagePixels(0); return; }
                try {
                  const out = await prepareImage(f);
                  setImage(out.base64); setImagePixels(out.width * out.height);
                  setImageName(`${f.name} — ${out.width}×${out.height}, ${(out.bytes / 1024).toFixed(0)}KB`);
                } catch (err) {
                  setImage(null); setImageName(""); setImagePixels(0); e.target.value = "";
                  notify(err.message || "Could not read that image.");
                }
              }} />
              {imageName && <p className="hint" style={{ marginTop: 8 }}>{imageName}</p>}
            </div>
          )}

          <div className="field">
            <label>
              <span>{mode === "vision" ? "What to ask about the image"
                : mode === "bulk" ? "Instruction — runs against every item"
                : "What should the model do?"}</span>
              {prompt.length > 0 && <span>{prompt.length.toLocaleString()} chars</span>}
            </label>
            <textarea className="input" rows={mode === "vision" ? 2 : 3}
              placeholder={mode === "vision" ? "Describe this image in detail."
                : mode === "bulk" ? "e.g. Summarise this row in five words."
                : "e.g. Summarise this document and list the key numbers."}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>

          {mode === "bulk" && (
            <>
              <div className="field">
                <label>
                  <span>Items — one per line</span>
                  {items.length > 0 && <span>{items.length.toLocaleString()} items</span>}
                </label>
                <textarea className="input" rows={5}
                  placeholder={"row one\nrow two\nrow three"}
                  value={rawItems} onChange={(e) => { setRawItems(e.target.value); setItemsName(""); }} />
              </div>
              <div className="field">
                <label>…or upload a file (each line becomes an item)</label>
                <input className="input" type="file" accept={DOC_ACCEPT} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const out = await readDocument(f);
                    setRawItems(out.text);
                    setItemsName(`${f.name} — ${toItems(out.text).length.toLocaleString()} items`);
                  } catch (err) { notify(err.message); }
                  finally { e.target.value = ""; }
                }} />
                {itemsName && <p className="hint" style={{ marginTop: 8 }}>{itemsName}</p>}
              </div>
            </>
          )}

          {mode === "text" && (
            <div className="field">
              <label>Attach a document (optional)</label>
              {doc ? (
                <div className="note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span><b>{doc.name}</b><br />{doc.chars.toLocaleString()} characters attached — kept separate from your instruction</span>
                  <button className="modal__x" title="Remove" onClick={() => setDoc(null)}><X size={16} /></button>
                </div>
              ) : (
                <input className="input" type="file" accept={DOC_ACCEPT} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const out = await readDocument(f);
                    setDoc({ text: out.text, name: f.name, chars: out.chars });
                    if (out.tooLong) notify("That document is very large — the model may only read the first part.");
                  } catch (err) { setDoc(null); notify(err.message); }
                  finally { e.target.value = ""; }
                }} />
              )}
              {!doc && <p className="hint" style={{ marginTop: 8 }}>txt, md, csv, json, pdf, docx</p>}
            </div>
          )}

          {unavailable && (
            <div className="note" style={{ marginBottom: 14 }}>
              <b>No node can run {kind === "vision" ? "image → text" : kind} jobs right now.</b><br />
              {netCaps.length ? `The network currently serves: ${netCaps.join(", ")}.` : "No nodes with a model runtime are online."}{" "}
              Payment is disabled so you don't pay for work nobody can do.
            </div>
          )}

          <div className="kv-row" style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}>
            <span className="k">{mode === "bulk" ? `Price for ${items.length.toLocaleString()} items` : "Price for this job"}</span>
            <span className="v">{price} THKT</span>
          </div>
          <p className="hint" style={{ marginTop: 6, marginBottom: 14 }}>
            {pricing.base_thkt} base + {pricing.per_1k_chars_thkt}/1k chars
            {mode === "vision" ? ` + ${pricing.vision_thkt} image` : ""}
            {mode === "vision" && pricing.per_mp_thkt > 0 ? ` + ${pricing.per_mp_thkt}/megapixel` : ""}
            {mode === "bulk" ? " — charged per item, paid once" : ""}
            {doc ? " — includes the attached document" : ""}
          </p>

          <button className="button button--primary" onClick={run}
            disabled={busy || !session || !CONTRACTS_LIVE || unavailable}>
            {busy ? (status?.text || "Working…")
              : mode === "bulk" ? `Run ${items.length.toLocaleString()} items · ${price} THKT`
              : `Run job · ${price} THKT`}
          </button>

          {!session && <p className="hint">Connect your wallet to run a job.</p>}
          {status?.hash && (
            <p className="hint">
              {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">payment tx <ArrowUpRight size={12} /></a>
            </p>
          )}

          {batch && (
            <div style={{ marginTop: 16 }}>
              <div className="kv-row">
                <span className="k">Progress</span>
                <span className="v">{finished}/{batch.total}{batch.failed ? ` · ${batch.failed} failed` : ""}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--secondary)", overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", width: `${(finished / Math.max(1, batch.total)) * 100}%`,
                              background: "var(--lime)", transition: "width .4s var(--ease-out)" }} />
              </div>
              {batch.finished && (
                <div className="note" style={{ marginTop: 14, maxHeight: 320, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                  {batch.results.map((r) => (
                    <div key={r.id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid var(--line)" }}>
                      <b>{r.status === "failed" ? "Failed" : "Result"}</b><br />{r.result || "(none)"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {job?.result && (
            <div className="note" style={{ whiteSpace: "pre-wrap" }}>
              <b>{job.status === "failed" ? "Failed" : "Result"}</b><br />{job.result}
            </div>
          )}
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
