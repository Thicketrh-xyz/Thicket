import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { ArrowUpRight, X } from "lucide-react";
import { fetchComputePrice, submitJob, fetchJob, fetchStats } from "../lib/api";
import { payForCompute, getPoolBalance } from "../lib/chain";
import { CONTRACTS_LIVE, explorerTx } from "../config";
import { prepareImage } from "../lib/image";
import { readDocument, DOC_ACCEPT } from "../lib/textfile";
import { SectionLabel } from "./SiteChrome";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

export function ComputePanel({ session, notify }) {
  const [kind, setKind] = useState("text");
  const [prompt, setPrompt] = useState("");            // the instruction only
  const [doc, setDoc] = useState(null);                // { text, name, chars }
  const [image, setImage] = useState(null);            // base64, no data: prefix
  const [imageName, setImageName] = useState("");
  const [imagePixels, setImagePixels] = useState(0);
  const [pricing, setPricing] = useState({ base_thkt: 5, per_1k_chars_thkt: 2, vision_thkt: 4, per_mp_thkt: 6 });
  const [pool, setPool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [job, setJob] = useState(null);
  const [netCaps, setNetCaps] = useState(null);        // what online nodes can serve

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

  function switchKind(next) {
    if (next === kind) return;
    setKind(next);
    setPrompt(""); setDoc(null);
    setImage(null); setImageName(""); setImagePixels(0);
    setJob(null); setStatus(null);
  }

  // The instruction and the attached document are kept apart so typing can't
  // clobber the document — they're only joined when the job is submitted.
  const fullPrompt = doc
    ? `${prompt.trim()}\n\n--- attached: ${doc.name} ---\n${doc.text}`
    : prompt;

  const price = Number((
    pricing.base_thkt +
    (fullPrompt.length / 1000) * pricing.per_1k_chars_thkt +
    (kind === "vision"
      ? pricing.vision_thkt + (imagePixels / 1_000_000) * pricing.per_mp_thkt
      : 0)
  ).toFixed(2));

  async function run() {
    if (!session) return notify("Connect your wallet to run a job.");
    if (!CONTRACTS_LIVE) return notify("Contracts aren't deployed.");
    if (kind === "text" && !prompt.trim() && !doc) return notify("Enter a prompt or attach a document.");
    if (kind === "text" && doc && !prompt.trim())
      return notify("Add an instruction — tell the model what to do with the document.");
    if (kind === "vision" && !image) return notify("Choose an image to caption.");
    if (netCaps && !netCaps.includes(kind))
      return notify(`No node online can run ${kind} jobs right now — your THKT would be spent on work nobody can do.`);

    setJob(null); setStatus(null);
    try {
      setBusy(true);
      const tx = await payForCompute(session.signer, price, (text) => setStatus({ text }));
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
      if (done?.status === "done") {
        setStatus({ text: "Done", hash: tx });
        notify(`Job complete — ${price} THKT went into the rewards pool.`);
      } else if (done?.status === "failed") {
        setStatus({ text: "The node couldn't complete this job", hash: tx });
      } else {
        setStatus({ text: "Still running — check Your jobs below", hash: tx });
      }
    } catch (e) {
      setStatus(null);
      notify(e.shortMessage || e.reason || e.message || "Job failed");
    } finally {
      setBusy(false);
    }
  }

  const unavailable = netCaps && !netCaps.includes(kind);

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
            <button className={kind === "text" ? "is-active" : ""} onClick={() => switchKind("text")}>Text</button>
            <button className={kind === "vision" ? "is-active" : ""} onClick={() => switchKind("vision")}>Image → text</button>
          </div>

          {kind === "vision" && (
            <div className="field">
              <label>Image</label>
              <input className="input" type="file" accept="image/*" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) { setImage(null); setImageName(""); return; }
                try {
                  const out = await prepareImage(f);   // normalise format + size
                  setImage(out.base64);
                  setImagePixels(out.width * out.height);
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
              <span>{kind === "vision" ? "What to ask about the image" : "What should the model do?"}</span>
              {prompt.length > 0 && <span>{prompt.length.toLocaleString()} chars</span>}
            </label>
            <textarea className="input" rows={kind === "text" ? 4 : 2}
              placeholder={kind === "vision"
                ? "Describe this image in detail."
                : "e.g. Summarise this document and list the key numbers."}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>

          {kind === "text" && (
            <div className="field">
              <label>Attach a document (optional)</label>
              {doc ? (
                <div className="note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>
                    <b>{doc.name}</b><br />
                    {doc.chars.toLocaleString()} characters attached — kept separate from your instruction
                  </span>
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
                  } catch (err) {
                    setDoc(null); notify(err.message);
                  } finally {
                    e.target.value = "";
                  }
                }} />
              )}
              {!doc && <p className="hint" style={{ marginTop: 8 }}>txt, md, csv, json, pdf, docx</p>}
            </div>
          )}

          {unavailable && (
            <div className="note" style={{ marginBottom: 14 }}>
              <b>No node can run {kind === "vision" ? "image → text" : kind} jobs right now.</b><br />
              {netCaps.length ? `The network currently serves: ${netCaps.join(", ")}.`
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
            {kind === "vision" ? ` + ${pricing.vision_thkt} image + ${pricing.per_mp_thkt}/megapixel` : ""}
            {doc ? " — includes the attached document" : ""}
            {kind === "vision" && imagePixels
              ? ` (${(imagePixels / 1_000_000).toFixed(2)} MP)` : ""}
          </p>

          <button className="button button--primary" onClick={run}
            disabled={busy || !session || !CONTRACTS_LIVE || unavailable}>
            {busy ? (status?.text || "Working…") : `Run job · ${price} THKT`}
          </button>

          {!session && <p className="hint">Connect your wallet to run a job.</p>}
          {status?.hash && (
            <p className="hint">
              {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">payment tx <ArrowUpRight size={12} /></a>
            </p>
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
