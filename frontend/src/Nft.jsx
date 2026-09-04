import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits } from "ethers";
import { ArrowUpRight, Flame, Lock, LogOut } from "lucide-react";
import { SiteHeader, SiteFooter, SectionLabel } from "./components/SiteChrome";
import { connect, disconnect, hasWallet, getRelicSaleState, getRelicBuyerInfo, buyRelic, relicRevertName } from "./lib/chain";
import { RELICS_LIVE, explorerTx } from "./config";
import "./ref-landing.css";
import "./app-docs.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/nodes", label: "Nodes" },
  { href: "/nft", label: "Passes" },
  { href: "/docs", label: "Docs" },
];

const TIERS = [
  // ids and prices must match the shipped metadata, NodeRelic.multiplierOf and
  // RelicSale.priceOf exactly. The price here is what gets passed as
  // maxPriceWei, so a wrong number is caught by the contract, not by us.
  { key: "emergent",   name: "Emergent",   qty:  5, first:  1, price: 2_000_000, mult: 11,
    blurb: "The rare giants that break above the canopy. Five, ever." },
  { key: "canopy",     name: "Canopy",     qty: 10, first:  6, price: 1_000_000, mult: 7,
    blurb: "The sunlit roof of a mature forest." },
  { key: "understory", name: "Understory", qty: 15, first: 16, price:   750_000, mult: 5,
    blurb: "Young trees reaching up. More light, fewer of them." },
  { key: "bracken",    name: "Bracken",    qty: 20, first: 31, price:   200_000, mult: 2,
    blurb: "The fern layer. Dense, everywhere, where most of the forest lives." },
];

const REWARD_PER_MINUTE = 0.35;
const BASE_DAY = REWARD_PER_MINUTE * 1440;
const SUPPLY = TIERS.reduce((a, t) => a + t.qty, 0);

// Wireframe fallback, used only when the contracts aren't in the env: a few
// already claimed, so both states are visible while designing the page.
const MOCK_CLAIMED = { bracken: 7, understory: 4, canopy: 2, emergent: 1 };

const num = (n) => n.toLocaleString("en-US");
// Below 1k this has to render the plain number — `${n/1000}k` turns a burn of
// zero into "0k", which reads like a bug on a page nobody has bought from yet.
const compact = (n) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0)}M`
  : n >= 1_000 ? `${+(n / 1000).toFixed(1)}k`
  : `${Math.round(n)}`;
const priceWeiOf = (tier) => parseUnits(String(tier.price), 18);

// Turn the sale's custom errors into something that tells a buyer what to do
// next. relicRevertName digs the name out even when ethers couldn't — see the
// note on it; without that this fell through to "unknown custom error" for
// every one of these.
function saleError(e) {
  switch (relicRevertName(e)) {
    case "SaleClosed":           return "The sale isn't open yet.";
    case "NotAvailable":         return "That pass was claimed a moment ago — pick another.";
    case "PriceChanged":         return "Price mismatch — reload the page and try again.";
    case "InsufficientBalance":  return "Not enough THKT in this wallet.";
    case "InsufficientAllowance":return "The approval didn't go through — try again.";
    default: return e?.shortMessage || e?.reason || e?.message || "Transaction failed";
  }
}

function Pass({ tier, tokenId, taken, unknown, selected, onSelect, onPeek }) {
  const locked = taken || unknown;
  return (
    <button
      className={`pass ${locked ? "pass--taken" : ""} ${selected ? "pass--selected" : ""}`}
      onClick={() => !locked && onSelect({ tier, tokenId })}
      onMouseEnter={(e) => onPeek({ tokenId, tier, rect: e.currentTarget.getBoundingClientRect() })}
      onMouseLeave={() => onPeek(null)}
      onFocus={(e) => onPeek({ tokenId, tier, rect: e.currentTarget.getBoundingClientRect() })}
      onBlur={() => onPeek(null)}
      aria-disabled={locked}
      title={
        unknown ? `${tier.name} #${tokenId} — availability unknown`
        : taken ? `${tier.name} #${tokenId} — claimed`
        : `${tier.name} #${tokenId}`
      }
    >
      <img className="pass__img" src={`/nft/thumb/${tokenId}.webp`} alt="" loading="lazy" />
      <span className="pass__num">#{tokenId}</span>
      {taken && <span className="pass__lock"><Lock size={11} /></span>}
    </button>
  );
}

/// The hover zoom. Fixed-position and clamped to the viewport rather than
/// nested in the tile, so a card at the edge of the grid is never cut off by
/// the section's overflow.
function Peek({ peek }) {
  if (!peek) return null;
  // Must match .peek in CSS exactly: 300 wide, image at the preview's 900x1232
  // aspect, plus the caption bar. Clamping against a stale number is how this
  // overshot the bottom of the window by the height of the bar.
  const W = 300, BAR = 34, GAP = 14;
  const H = Math.round(W * (1232 / 900)) + BAR;
  const { rect } = peek;
  let left = rect.left + rect.width / 2 - W / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - W - 12));
  // Prefer above the tile, fall back to below — then clamp regardless, because
  // neither side fits for a tile near the bottom of a short window.
  const above = rect.top > H + GAP;
  let top = above ? rect.top - H - GAP : rect.bottom + GAP;
  top = Math.max(12, Math.min(top, window.innerHeight - H - 12));
  return (
    <div className="peek" style={{ left, top, width: W }}>
      <img src={`/nft/preview/${peek.tokenId}.webp`} alt="" />
      <div className="peek__bar">
        <span><b>{peek.tier.name}</b> #{peek.tokenId}</span>
        <span className="peek__mult">{peek.tier.mult}×</span>
      </div>
    </div>
  );
}

export default function Nft() {
  const [sel, setSel] = useState(null);          // { tier, tokenId }
  const buyRef = useRef(null);
  const [peek, setPeek] = useState(null);
  const [session, setSession] = useState(null);
  const [sale, setSale] = useState(null);        // { availability, open, totalBurned }
  const [saleFailed, setSaleFailed] = useState(false);
  const [info, setInfo] = useState(null);        // { balance, allowance, multiplier }
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [toast, setToast] = useState(null);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 3400); }

  // Reconnect silently if the wallet is already authorized.
  useEffect(() => {
    (async () => {
      if (!hasWallet()) return;
      if (localStorage.getItem("thicket:disconnected") === "1") return;
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (accs?.length) setSession(await connect());
      } catch { /* ignore */ }
    })();
  }, []);

  const loadSale = useCallback(async () => {
    if (!RELICS_LIVE) return;
    try {
      setSale(await getRelicSaleState());
      setSaleFailed(false);
    } catch {
      // Deployed but unreadable. Deliberately not falling back to the mock
      // counts — showing invented availability on a live sale is worse than
      // showing none, so the grid locks and says so.
      setSale(null);
      setSaleFailed(true);
    }
  }, []);
  useEffect(() => { loadSale(); }, [loadSale]);

  const loadInfo = useCallback(async () => {
    if (!session || !RELICS_LIVE) return setInfo(null);
    try { setInfo(await getRelicBuyerInfo(session.signer, session.address)); }
    catch { setInfo(null); }
  }, [session]);
  useEffect(() => { loadInfo(); }, [loadInfo]);

  async function onConnect() {
    if (!hasWallet()) return notify("No wallet detected — install MetaMask to buy.");
    try {
      setSession(await connect());
      localStorage.removeItem("thicket:disconnected");
      notify("Wallet connected.");
    } catch (e) {
      notify(e.shortMessage || e.message || "Connection failed");
    }
  }

  async function onDisconnect() {
    await disconnect();
    setSession(null);
    localStorage.setItem("thicket:disconnected", "1");   // don't auto-reconnect on reload
    notify("Wallet disconnected.");
  }

  // Selecting a pass brings the buy panel to you. The grid is four tiers tall, so
  // on anything but a very large window the panel you just filled in is off
  // screen and the click reads as having done nothing.
  //
  // Skips the scroll when the panel is already fully in view — re-selecting to
  // compare two passes shouldn't yank the page around each time.
  function selectPass(next) {
    setSel(next);
    const el = buyRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }

  async function onBuy() {
    if (!session) return onConnect();
    if (!sel) return;
    setStatus(null);
    try {
      setBusy(true);
      const hash = await buyRelic(session.signer, sel.tokenId, priceWeiOf(sel.tier),
        (text) => setStatus({ text }));
      setStatus({ text: "Confirmed", hash });
      notify(`${sel.tier.name} #${sel.tokenId} is yours — ${num(sel.tier.price)} THKT burned.`);
      setSel(null);
      loadSale();
      loadInfo();
    } catch (e) {
      setStatus(null);
      notify(saleError(e));
    } finally { setBusy(false); }
  }

  // Availability by token id: the contract's bitmap when live, the wireframe
  // counts when the contracts aren't configured at all.
  const takenOf = useCallback((tier, tokenId) => {
    if (sale) return !sale.availability[tokenId - 1];
    if (RELICS_LIVE) return false;                       // unknown — see `unknown`
    return tokenId - tier.first < MOCK_CLAIMED[tier.key];
  }, [sale]);

  const unknown = RELICS_LIVE && !sale;   // deployed but not read yet, or read failed

  const totals = useMemo(() => {
    const maxBurn = TIERS.reduce((a, t) => a + t.qty * t.price, 0);
    if (sale) {
      const claimed = sale.availability.filter((a) => !a).length;
      return { maxBurn, claimed, burned: Number(formatUnits(sale.totalBurned, 18)) };
    }
    if (RELICS_LIVE) return { maxBurn, claimed: null, burned: null };
    return {
      maxBurn,
      claimed: TIERS.reduce((a, t) => a + MOCK_CLAIMED[t.key], 0),
      burned: TIERS.reduce((a, t) => a + MOCK_CLAIMED[t.key] * t.price, 0),
    };
  }, [sale]);

  const claimedIn = (tier) =>
    sale
      ? Array.from({ length: tier.qty }, (_, i) => tier.first + i)
          .filter((id) => !sale.availability[id - 1]).length
      : RELICS_LIVE ? null : MOCK_CLAIMED[tier.key];

  const short = session?.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : null;
  const saleClosed = sale && !sale.open;
  const insufficient = info && sel && info.balance < priceWeiOf(sel.tier);
  // multiplierFor returns the *best* relic held, not the sum, so a lower tier
  // adds nothing to a wallet that already holds a higher one. Worth saying
  // before they burn a million THKT to find out.
  const noGain = info && sel && Number(info.multiplier) >= sel.tier.mult;
  // Disabled unless a purchase could actually go through. The one exception is
  // "no wallet yet" — that button is live and connects, so a visitor's first
  // click does something instead of nothing.
  const blocked = !RELICS_LIVE || saleFailed || saleClosed || !sale;
  const canBuy = session && sale && sale.open && sel && !insufficient;

  function buyLabel() {
    if (busy) return status?.text || "Confirming…";
    if (!RELICS_LIVE) return "Not deployed yet";
    if (saleFailed) return "Chain unreachable";
    if (saleClosed) return "Sale not open yet";
    if (!session) return "Connect wallet";
    if (!sel) return "Select a pass";
    return <>Approve &amp; claim <ArrowUpRight size={15} /></>;
  }

  return (
    <div className="site-shell">
      <SiteHeader
        links={NAV}
        cta={
          <button
            className="button button--primary button--small"
            onClick={session ? onDisconnect : onConnect}
            title={session ? `${session.address} — click to disconnect` : "Connect your wallet"}
          >
            {short || "Connect wallet"}
            {session ? <LogOut size={14} /> : <ArrowUpRight size={15} />}
          </button>
        }
      />

      {!RELICS_LIVE && (
        <div className="demo-banner">
          <b>Wireframe</b> — the relic contracts aren't configured, so ownership below is placeholder.
          Tiers, prices and multipliers are the real spec.
        </div>
      )}
      {saleFailed && (
        <div className="demo-banner">
          <b>Can't reach the chain</b> — availability is unknown, so nothing is selectable.{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); loadSale(); }}>Retry</a>
        </div>
      )}
      {saleClosed && (
        <div className="demo-banner">
          <b>The sale hasn't opened.</b> Availability below is live; buying turns on when it does.
        </div>
      )}

      <main className="page-shell">
        <section className="page-intro">
          <SectionLabel>Passes</SectionLabel>
          <h1>Multiply your node</h1>
          <p>
            A pass multiplies what your node earns per minute, for as long as it stays in the
            wallet your node runs from. Buying one burns THKT — it is not sent to a treasury,
            it leaves the supply. Fifty exist and there will never be more.
          </p>
        </section>

        <div className="nstat-grid">
          <div className="nstat"><div className="nstat__v">{SUPPLY}</div><div className="nstat__k">Passes, ever</div></div>
          <div className="nstat">
            <div className="nstat__v">{totals.claimed == null ? "—" : `${totals.claimed} / ${SUPPLY}`}</div>
            <div className="nstat__k">Claimed</div>
          </div>
          <div className="nstat"><div className="nstat__v">11×</div><div className="nstat__k">Highest multiplier</div></div>
          <div className="nstat nstat--live">
            <div className="nstat__v">{totals.burned == null ? "—" : compact(totals.burned)}</div>
            <div className="nstat__k">THKT burned so far</div>
          </div>
        </div>

        {TIERS.map((t) => {
          const claimed = claimedIn(t);
          return (
            <section className="section-block tier" key={t.key}>
              <div className="tier__head">
                <div>
                  <h2 className="tier__name">{t.name}</h2>
                  <p className="tier__blurb">{t.blurb}</p>
                </div>
                <dl className="tier__facts">
                  <div><dt>Multiplier</dt><dd className="tier__mult">{t.mult}×</dd></div>
                  <div><dt>Price</dt><dd>{num(t.price)} THKT</dd></div>
                  <div><dt>Supply</dt><dd>{claimed == null ? `${t.qty} total` : `${claimed} / ${t.qty} claimed`}</dd></div>
                  <div><dt>Earns</dt><dd>{num(Math.round(BASE_DAY * t.mult))} / day</dd></div>
                </dl>
              </div>
              <div className="tier__grid">
                {Array.from({ length: t.qty }, (_, i) => {
                  const tokenId = t.first + i;
                  return (
                    <Pass
                      key={tokenId}
                      tier={t}
                      tokenId={tokenId}
                      taken={takenOf(t, tokenId)}
                      unknown={unknown}
                      selected={sel?.tokenId === tokenId}
                      onSelect={selectPass}
                      onPeek={setPeek}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="section-block nft-split">
          <div className="panel" ref={buyRef} style={{ scrollMarginTop: 20 }}>
            <h3>{sel ? `${sel.tier.name} #${sel.tokenId}` : "Buy a pass"}</h3>
            <p className="panel__hint">
              {sel ? "Two transactions: approve the spend, then claim." : "Pick an available pass above."}
            </p>
            <dl className="nft-order">
              <div><dt>Price</dt><dd>{sel ? `${num(sel.tier.price)} THKT` : "—"}</dd></div>
              <div><dt>What happens to it</dt><dd className="nft-burn"><Flame size={13} /> Burned</dd></div>
              <div><dt>Multiplier</dt><dd>{sel ? `${sel.tier.mult}×` : "—"}</dd></div>
              <div>
                <dt>Your balance</dt>
                <dd>
                  {!session ? "— connect wallet"
                    : info ? `${num(Math.round(Number(formatUnits(info.balance, 18))))} THKT`
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="nft-steps">
              <div className="nft-step"><span className="nft-step__n">1</span> Approve the spend</div>
              <div className="nft-step"><span className="nft-step__n">2</span> Claim — THKT burns, pass arrives</div>
            </div>
            <button className="button button--primary" onClick={onBuy}
              disabled={busy || blocked || (session && !canBuy)}>
              {buyLabel()}
            </button>

            {insufficient && <p className="hint">Not enough THKT in this wallet.</p>}
            {noGain && !insufficient && (
              <p className="hint">
                This wallet already holds a {Number(info.multiplier)}× pass. Passes don't stack —
                settlement uses the highest one you hold, so this would not raise your rate.
              </p>
            )}
            {status?.hash && (
              <p className="hint">
                {status.text} — <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">view transaction <ArrowUpRight size={12} /></a>
              </p>
            )}
          </div>

          <div className="panel">
            <h3>What it does to your node</h3>
            <p className="panel__hint">
              Applied to <code>REWARD_PER_MINUTE</code> at settlement, checked against the chain.
            </p>
            <table className="docs-table" style={{ margin: 0 }}>
              <thead><tr><th>Holding</th><th>Per minute</th><th>Per day</th></tr></thead>
              <tbody>
                <tr><td>No pass</td><td>{REWARD_PER_MINUTE}</td><td>{num(Math.round(BASE_DAY))}</td></tr>
                {TIERS.map((t) => (
                  <tr key={t.key}>
                    <td>{t.name} · {t.mult}×</td>
                    <td>{(REWARD_PER_MINUTE * t.mult).toFixed(2)}</td>
                    <td className="tier__mult">{num(Math.round(BASE_DAY * t.mult))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              One pass boosts <strong>one operator address</strong>. A fleet does not multiply
              it — each node would need its own, and there are only {SUPPLY}.
            </p>
          </div>
        </section>

        <section className="section-block">
          <h2 className="nft-h2">How it works</h2>
          <table className="docs-table">
            <tbody>
              <tr><th>Burn</th><td>THKT is burned via <code>burnFrom</code> on the token — total supply drops and nobody receives it. Up to {num(totals.maxBurn)} THKT if all {SUPPLY} sell.</td></tr>
              <tr><th>Multiplier</th><td>Multiplies your node's per-minute rate at epoch settlement. Verified against the chain, never self-reported.</td></tr>
              <tr><th>Scope</th><td>One pass, one operator address. Transferable — the multiplier follows whoever holds it.</td></tr>
              <tr><th>Supply</th><td>{SUPPLY} minted at deploy across four tiers. There is no mint function afterwards.</td></tr>
            </tbody>
          </table>
        </section>
      </main>

      <Peek peek={peek} />
      <SiteFooter />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
