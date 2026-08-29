import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { SiteHeader, SiteFooter, SectionLabel } from "./components/SiteChrome";
import { fetchNodes } from "./lib/api";
import { getClaimedFor } from "./lib/chain";
import { explorerAddr } from "./config";
import "./ref-landing.css";
import "./app-docs.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/nodes", label: "Nodes" },
  { href: "/docs", label: "Docs" },
];

const PAGE_SIZE = 50;
const REFRESH_MS = 30_000;

const SORTS = [
  { key: "earned", label: "Earned" },
  { key: "tasks", label: "Verified" },
  { key: "uptime", label: "Uptime" },
  { key: "seen", label: "Last seen" },
];

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const num = (n, dp = 0) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

// Minutes are what the coordinator stores, but "18,204 min" means nothing at a
// glance — every row on this page is a machine that has been up for days.
function uptime(minutes) {
  if (!minutes) return "—";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const h = minutes / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function seen(secs) {
  if (secs === null || secs === undefined) return "never";
  if (secs < 90) return `${Math.round(secs)}s ago`;
  if (secs < 5400) return `${Math.round(secs / 60)}m ago`;
  if (secs < 172800) return `${(secs / 3600).toFixed(1)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

// claimed() returns wei as a bigint. Format without going through Number, which
// silently loses precision above 2^53.
function fromWei(v, dp = 2) {
  if (v === null || v === undefined) return null;
  const s = v.toString().padStart(19, "0");
  const whole = s.slice(0, -18);
  const frac = s.slice(-18, -18 + dp);
  return `${BigInt(whole).toLocaleString()}${dp ? "." + frac : ""}`;
}

export default function Nodes() {
  const [data, setData] = useState(null);
  const [claimed, setClaimed] = useState(new Map());
  const [chainFailed, setChainFailed] = useState(false);
  const [sort, setSort] = useState("earned");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetchNodes({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, sort, status });
    setLoading(false);
    if (!d) { setError(true); return; }
    setError(false);
    setData(d);
    setFetchedAt(Date.now());
    return d;
  }, [page, sort, status]);

  const nodes = data?.nodes ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.matched / PAGE_SIZE)) : 1;
  const net = data?.network;

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Chain reads follow the list rather than the fetch. A node that goes offline
  // between refreshes reorders the table and pulls in addresses the previous
  // pass never saw; keying this on the fetch instead left those rows stuck on
  // a permanent "…". Only missing addresses are read, so a refresh that changes
  // nothing costs no RPC calls at all.
  const addressKey = nodes.map((n) => n.address).join(",");
  useEffect(() => {
    const distributor = data?.distributor;
    if (!distributor || !nodes.length) return;
    const missing = nodes.map((n) => n.address).filter((a) => !claimed.has(a.toLowerCase()));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      const m = await getClaimedFor(missing, distributor);
      if (cancelled) return;
      setClaimed((prev) => {
        const next = new Map(prev);
        for (const [k, v] of m) next.set(k, v);
        return next;
      });
      setChainFailed(m.size > 0 && [...m.values()].every((v) => v === null));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, data?.distributor]);

  // Sum the rows on screen, not the whole map: the map is a cache that keeps
  // every address read so far, so summing it would report page one's total
  // while the reader is looking at page two.
  const totalClaimed = useMemo(() => {
    let sum = 0n;
    for (const n of nodes) {
      const v = claimed.get(n.address.toLowerCase());
      if (v) sum += v;
    }
    return sum;
  }, [nodes, claimed]);

  const choose = (setter) => (v) => { setter(v); setPage(0); };

  return (
    <div className="site-shell">
      <SiteHeader links={NAV} />

      <main className="page-shell">
        <section className="page-intro">
          <SectionLabel>Network</SectionLabel>
          <h1>Every node on Thicket</h1>
          <p>
            Every operator registered with the coordinator, what it has done, and what it has
            earned. Each address links to the explorer, and the claimed column is read
            straight from the RewardsDistributor in your browser — so you can check these
            numbers against the chain rather than taking them from us.
          </p>
        </section>

        <div className="tile-row">
          <div className="tile">
            <div className="big-figure">{data ? num(data.online) : "—"}</div>
            <div className="figure-cap">Online now</div>
          </div>
          <div className="tile">
            <div className="big-figure">{data ? num(data.total) : "—"}</div>
            <div className="figure-cap">Registered</div>
          </div>
          <div className="tile">
            <div className="big-figure">{net ? num(net.verified_tasks) : "—"}</div>
            <div className="figure-cap">Verified tasks</div>
          </div>
          <div className="tile">
            <div className="big-figure">{net ? num(net.earned_thkt) : "—"}</div>
            <div className="figure-cap">THKT earned</div>
          </div>
        </div>

        <section className="section-block">
          <div className="nodes-controls">
            <div className="tabs">
              {["all", "online", "offline"].map((s) => (
                <button key={s} className={status === s ? "is-active" : ""}
                        onClick={() => choose(setStatus)(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="tabs">
              {SORTS.map((s) => (
                <button key={s.key} className={sort === s.key ? "is-active" : ""}
                        onClick={() => choose(setSort)(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
            <button className="nodes-refresh" onClick={load} title="Refresh now">
              <RefreshCw size={14} className={loading ? "is-spinning" : ""} />
              {fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : "Loading…"}
            </button>
          </div>

          {error && (
            <div className="note">
              The coordinator did not answer. The list below may be stale or empty — this page
              reads live state, so there is nothing cached to fall back on.
            </div>
          )}

          {chainFailed && (
            <div className="note">
              Claimed amounts could not be read from the chain right now, so that column is
              blank. The RPC is public and rate-limited; a refresh usually fixes it.
            </div>
          )}

          <div className="nodes-table-wrap">
            <table className="docs-table nodes-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Status</th>
                  <th className="num">Verified</th>
                  <th className="num">Jobs</th>
                  <th className="num">Uptime</th>
                  <th className="num">Earned</th>
                  <th className="num">Claimed on chain</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => {
                  const c = claimed.get(n.address.toLowerCase());
                  return (
                    <tr key={n.address}>
                      <td>
                        <a className="nodes-addr" href={explorerAddr(n.address)}
                           target="_blank" rel="noreferrer" title={n.address}>
                          <code>{short(n.address)}</code> <ArrowUpRight size={12} />
                        </a>
                        {n.node_id && <div className="nodes-id">{n.node_id}</div>}
                      </td>
                      <td>
                        <span className="status-line">
                          <span className={n.online ? "dot-live" : "dot-off"} />
                          {n.online ? "Online" : "Offline"}
                        </span>
                        {!n.online && <div className="nodes-id">{seen(n.seen_s_ago)}</div>}
                      </td>
                      <td className="num">{num(n.verified_tasks)}</td>
                      <td className="num">{num(n.jobs_done)}</td>
                      <td className="num">{uptime(n.lifetime_minutes)}</td>
                      <td className="num">{num(n.earned_thkt, 2)}</td>
                      <td className="num">{c === undefined ? "…" : (fromWei(c) ?? "—")}</td>
                    </tr>
                  );
                })}
                {!nodes.length && !loading && (
                  <tr><td colSpan={7} className="nodes-empty">No nodes match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="nodes-pager">
            <button className="nodes-pager__btn" disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </button>
            <span className="hint">
              Page {page + 1} of {pages}
              {data ? ` · ${num(data.matched)} nodes` : ""}
              {totalClaimed > 0n ? ` · ${fromWei(totalClaimed)} THKT claimed on this page` : ""}
            </span>
            <button className="nodes-pager__btn" disabled={page + 1 >= pages}
                    onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>

          <p className="hint">
            <strong>Verified</strong> counts tasks this node answered where its output matched
            the majority of the nodes given the same task. <strong>Jobs</strong> counts paid
            compute bought by a customer, which is a much smaller number today.{" "}
            <strong>Earned</strong> is what the coordinator has credited, settled and pending;
            <strong> claimed</strong> is what the operator has actually pulled out of the
            RewardsDistributor. Earned above claimed is normal — it means rewards are sitting
            unclaimed.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
