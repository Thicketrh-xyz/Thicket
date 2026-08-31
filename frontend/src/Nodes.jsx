import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, RefreshCw } from "lucide-react";
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

const PAGE_SIZE = 48;
const REFRESH_MS = 30_000;
const TICK_MS = 250;

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
// glance — every node here has been up for days.
function uptime(minutes) {
  if (!minutes) return "—";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const h = minutes / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function seen(secs) {
  if (secs === null || secs === undefined) return "never seen";
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

function Stat({ label, value, live = false }) {
  return (
    <div className={`nstat ${live ? "nstat--live" : ""}`}>
      <div className="nstat__v">{value}</div>
      <div className="nstat__k">{label}</div>
    </div>
  );
}

export default function Nodes() {
  const [data, setData] = useState(null);
  const [claimed, setClaimed] = useState(new Map());
  const [chainFailed, setChainFailed] = useState(false);
  const [sort, setSort] = useState("earned");
  const [dir, setDir] = useState("desc");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const earnedFloor = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetchNodes({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, sort, status, dir });
    setLoading(false);
    if (!d) { setError(true); return; }
    setError(false);
    setData(d);
    setFetchedAt(Date.now());
  }, [page, sort, status, dir]);

  const nodes = data?.nodes ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.matched / PAGE_SIZE)) : 1;
  const net = data?.network;

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Repaint between fetches so the earned counter moves. Rewards accrue every
  // second, so a figure that only changed every 30s would be understating a
  // live network — see liveEarned.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Chain reads follow the list rather than the fetch. A node that goes offline
  // between refreshes reorders the page and pulls in addresses the previous pass
  // never saw; keying this on the fetch left those stuck on a permanent "…".
  // Only missing addresses are read, so an unchanged refresh costs no RPC calls.
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

  // Earnings between refreshes, extrapolated at the network's own rate: every
  // online node accrues reward_per_minute every minute. This is the real accrual
  // curve, not decoration — each fetch snaps it back to the coordinator's figure,
  // so it can drift only for as long as one refresh interval and only by however
  // much the online count changed.
  const liveEarned = useMemo(() => {
    if (!net || !fetchedAt) return null;
    const perSecond = ((data?.online ?? 0) * (data?.reward_per_minute ?? 0)) / 60;
    const projected = net.earned_thkt + ((Date.now() - fetchedAt) / 1000) * perSecond;
    // Cumulative earnings only ever go up — at epoch close, pending moves into
    // settled and the total is continuous. So hold the high-water mark rather
    // than letting a refresh yank the number backwards if the extrapolation ran
    // slightly ahead of the coordinator. Drift is bounded: every fetch supplies
    // a fresh true floor.
    const shown = Math.max(projected, earnedFloor.current);
    earnedFloor.current = shown;
    return shown;
    // `tick` is in the deps on purpose: it is what drives the recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, fetchedAt, data, tick]);

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
        </section>

        <div className="nstat-grid">
          <Stat label="Online now" value={data ? num(data.online) : "—"} />
          <Stat label="Registered" value={data ? num(data.total) : "—"} />
          <Stat label="Verified tasks" value={net ? num(net.verified_tasks) : "—"} />
          <Stat label="THKT earned" live value={liveEarned === null ? "—" : num(liveEarned)} />
          <Stat label="Tasks executed" value={net ? num(net.tasks_executed) : "—"} />
          <Stat label="Queued tasks" value={net ? num(net.jobs_queued) : "—"} />
          <Stat label="Jobs running" value={net ? num(net.jobs_active) : "—"} />
          <Stat label="Reward pool · THKT" value={net ? num(net.pool_thkt) : "—"} />
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
            <button
              className="nodes-dir"
              onClick={() => choose(setDir)(dir === "desc" ? "asc" : "desc")}
              title={dir === "desc" ? "Highest first — click for lowest first"
                                    : "Lowest first — click for highest first"}
            >
              {dir === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
              {dir === "desc" ? "Highest first" : "Lowest first"}
            </button>
            <button className="nodes-refresh" onClick={load} title="Refresh now">
              <RefreshCw size={13} className={loading ? "is-spinning" : ""} />
              {fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : "Loading…"}
            </button>
          </div>

          {error && (
            <div className="note">
              The coordinator did not answer. This page reads live state, so there is nothing
              cached to fall back on — the cards below may be stale or empty.
            </div>
          )}

          {chainFailed && (
            <div className="note">
              Claimed amounts could not be read from the chain right now. The RPC is public and
              rate-limited; a refresh usually fixes it.
            </div>
          )}

          <div className="node-cards">
            {nodes.map((n) => {
              const c = claimed.get(n.address.toLowerCase());
              return (
                <article className={`ncard ${n.online ? "" : "ncard--off"}`} key={n.address}>
                  <header className="ncard__top">
                    <span className="status-line">
                      <span className={n.online ? "dot-live" : "dot-off"} />
                      {n.online ? "Online" : "Offline"}
                    </span>
                    <a className="ncard__addr" href={explorerAddr(n.address)}
                       target="_blank" rel="noreferrer" title={n.address}>
                      <code>{short(n.address)}</code> <ArrowUpRight size={12} />
                    </a>
                  </header>

                  <div className="ncard__earned">
                    <span className="ncard__earned-v">{num(n.earned_thkt, 2)}</span>
                    <span className="ncard__earned-k">THKT earned</span>
                  </div>

                  <dl className="ncard__grid">
                    <div><dt>Verified</dt><dd>{num(n.verified_tasks)}</dd></div>
                    <div><dt>Jobs</dt><dd>{num(n.jobs_done)}</dd></div>
                    <div><dt>Uptime</dt><dd>{uptime(n.lifetime_minutes)}</dd></div>
                  </dl>

                  <footer className="ncard__foot">
                    <span>Claimed on chain</span>
                    <strong>{c === undefined ? "…" : (fromWei(c) ?? "—")}</strong>
                  </footer>
                  {!n.online && <div className="ncard__seen">Last seen {seen(n.seen_s_ago)}</div>}
                </article>
              );
            })}
            {!nodes.length && !loading && (
              <div className="nodes-empty">No nodes match this filter.</div>
            )}
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
            <strong>Verified</strong> counts tasks a node answered where its output matched the
            majority of the nodes given the same task. <strong>Jobs</strong> counts paid compute
            bought by a customer. <strong>Earned</strong> is what the coordinator has credited,
            settled and pending; <strong>claimed</strong> is what has actually been withdrawn from
            the RewardsDistributor. Earned above claimed is normal — it means rewards are sitting
            unclaimed.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
