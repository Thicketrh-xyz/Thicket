import { useCallback, useEffect, useState } from "react";
import { fetchMyJobs } from "../lib/api";
import { SectionLabel } from "./SiteChrome";

const ago = (t) => {
  if (!t) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS = {
  done: { label: "Done", cls: "dot-live" },
  failed: { label: "Failed", cls: "dot-off" },
  pending: { label: "Waiting for a node", cls: "dot-off" },
  assigned: { label: "Running", cls: "dot-live" },
};

// Everything this wallet has ever paid for — results survive a page refresh.
export function JobHistory({ session }) {
  const [jobs, setJobs] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    if (!session?.address) return setJobs(null);
    const j = await fetchMyJobs(session.address);
    if (Array.isArray(j)) setJobs(j);
  }, [session]);

  useEffect(() => {
    if (!session?.address) return;
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [session, load]);

  if (!session) return null;

  return (
    <section className="section-block" id="jobs">
      <SectionLabel>Your jobs</SectionLabel>
      <div className="page-intro" style={{ padding: "10px 0 24px" }}>
        <h1 style={{ fontSize: "1.9rem" }}>Everything you've run.</h1>
        <p>Results are kept by the coordinator, so they're here after a refresh.</p>
      </div>

      {!jobs ? (
        <p className="hint">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="panel"><p className="panel__hint" style={{ margin: 0 }}>
          No jobs yet. Submit one in <a href="#compute">Run compute</a> above.
        </p></div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          {jobs.map((j) => {
            const st = STATUS[j.status] || STATUS.pending;
            const isOpen = open === j.id;
            return (
              <div key={j.id} style={{ borderBottom: "1px solid var(--line)", padding: "16px 22px" }}>
                <div className="kv-row" style={{ border: "none", padding: 0, cursor: "pointer" }}
                  onClick={() => setOpen(isOpen ? null : j.id)}>
                  <span className="k" style={{ flex: 1, minWidth: 0 }}>
                    <span className="status-line" style={{ marginRight: 10 }}>
                      <span className={st.cls} /> {st.label}
                    </span>
                    <span style={{ color: "var(--foreground)" }}>
                      {(j.prompt || "").slice(0, 60) || `(${j.kind} job)`}
                      {(j.prompt || "").length > 60 ? "…" : ""}
                    </span>
                  </span>
                  <span className="v" style={{ whiteSpace: "nowrap" }}>
                    {j.price_thkt ? `${j.price_thkt} THKT · ` : ""}{ago(j.created_at)}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 14 }}>
                    <div className="figure-cap">Prompt · {j.kind}</div>
                    <p className="panel__hint" style={{ whiteSpace: "pre-wrap" }}>{j.prompt || "(none)"}</p>
                    <div className="figure-cap" style={{ marginTop: 14 }}>
                      {j.status === "failed" ? "Error" : "Result"}
                    </div>
                    {j.result
                      ? <div className="note" style={{ whiteSpace: "pre-wrap" }}>{j.result}</div>
                      : <p className="hint">No result yet.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
