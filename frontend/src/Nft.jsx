import { useMemo, useState } from "react";
import { ArrowUpRight, Flame, Check, Lock } from "lucide-react";
import { SiteHeader, SiteFooter, SectionLabel } from "./components/SiteChrome";
import "./ref-landing.css";
import "./app-docs.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/nodes", label: "Nodes" },
  { href: "/nft", label: "Canopy Pass" },
  { href: "/docs", label: "Docs" },
];

// WIREFRAME. Every number below is placeholder data so the layout can be judged
// before any contract exists. Nothing here touches a wallet or a chain.
const SUPPLY = 15;
const PRICE_THKT = 250_000;
const MULTIPLIER = 4;

const MOCK = Array.from({ length: SUPPLY }, (_, i) => ({
  id: i + 1,
  owner: i < 6 ? `0x${(0xa1b2 + i * 977).toString(16).padStart(4, "0")}…${(0x7f3e + i).toString(16)}` : null,
  burnedAt: i < 6 ? `${["2h", "5h", "9h", "1d", "2d", "3d"][i]} ago` : null,
}));

const num = (n) => n.toLocaleString("en-US");

function Pass({ pass, onSelect, selected }) {
  const taken = Boolean(pass.owner);
  return (
    <button
      className={`pass ${taken ? "pass--taken" : ""} ${selected ? "pass--selected" : ""}`}
      onClick={() => !taken && onSelect(pass.id)}
      disabled={taken}
    >
      <div className="pass__art" aria-hidden="true">
        <span className="pass__num">{String(pass.id).padStart(2, "0")}</span>
      </div>
      <div className="pass__meta">
        <span className="pass__state">
          {taken ? <><Lock size={11} /> Claimed</> : <>Available</>}
        </span>
        {taken ? (
          <code className="pass__owner">{pass.owner}</code>
        ) : (
          <span className="pass__price">{num(PRICE_THKT)} THKT</span>
        )}
      </div>
    </button>
  );
}

export default function Nft() {
  const [selected, setSelected] = useState(null);
  const claimed = MOCK.filter((p) => p.owner).length;
  const burned = claimed * PRICE_THKT;

  const yourNode = useMemo(() => ({
    address: "0x3561…470c",
    baseRate: 0.35,
    holdsPass: false,
  }), []);

  return (
    <div className="site-shell">
      <SiteHeader links={NAV} />

      <main className="page-shell">
        <div className="note" style={{ marginTop: 18 }}>
          <strong>Wireframe.</strong> Placeholder data, no wallet and no contract behind it —
          this is here so the layout and the mechanics can be judged before anything is built.
        </div>

        <section className="page-intro">
          <SectionLabel>Canopy Pass</SectionLabel>
          <h1>{MULTIPLIER}× your node, {SUPPLY} ever</h1>
          <p>
            A Canopy Pass multiplies what your node earns while the pass sits in the same
            wallet the node runs from. Buying one burns {num(PRICE_THKT)} THKT permanently —
            it is not sent to a treasury, it leaves the supply.
          </p>
        </section>

        <div className="nstat-grid">
          <div className="nstat"><div className="nstat__v">{MULTIPLIER}×</div><div className="nstat__k">Earnings multiplier</div></div>
          <div className="nstat"><div className="nstat__v">{claimed} / {SUPPLY}</div><div className="nstat__k">Claimed</div></div>
          <div className="nstat"><div className="nstat__v">{num(PRICE_THKT)}</div><div className="nstat__k">Price · THKT</div></div>
          <div className="nstat nstat--live"><div className="nstat__v">{num(burned)}</div><div className="nstat__k">THKT burned so far</div></div>
        </div>

        <section className="section-block">
          <h2 className="nft-h2">Passes</h2>
          <div className="pass-grid">
            {MOCK.map((p) => (
              <Pass key={p.id} pass={p} selected={selected === p.id} onSelect={setSelected} />
            ))}
          </div>
        </section>

        <section className="section-block nft-split">
          <div className="panel">
            <h3>{selected ? `Buy pass #${String(selected).padStart(2, "0")}` : "Buy a pass"}</h3>
            <p className="panel__hint">
              {selected ? "Two transactions: approve the spend, then claim." : "Pick an available pass above."}
            </p>

            <dl className="nft-order">
              <div><dt>Price</dt><dd>{num(PRICE_THKT)} THKT</dd></div>
              <div><dt>What happens to it</dt><dd className="nft-burn"><Flame size={13} /> Burned on purchase</dd></div>
              <div><dt>Your balance</dt><dd>— connect wallet</dd></div>
              <div><dt>Supply after</dt><dd>{num(1_000_000_000 - burned - PRICE_THKT)} THKT</dd></div>
            </dl>

            <div className="nft-steps">
              <div className="nft-step"><span className="nft-step__n">1</span> Approve {num(PRICE_THKT)} THKT</div>
              <div className="nft-step"><span className="nft-step__n">2</span> Claim pass — THKT burns, NFT arrives</div>
            </div>

            <button className="button button--primary" disabled={!selected}>
              {selected ? <>Approve &amp; claim <ArrowUpRight size={15} /></> : "Select a pass"}
            </button>
          </div>

          <div className="panel">
            <h3>Your node</h3>
            <p className="panel__hint">The multiplier follows the wallet, not the machine.</p>

            <dl className="nft-order">
              <div><dt>Operator</dt><dd><code>{yourNode.address}</code></dd></div>
              <div><dt>Holds a pass</dt><dd>{yourNode.holdsPass ? <><Check size={13} /> Yes</> : "No"}</dd></div>
              <div><dt>Rate now</dt><dd>{yourNode.baseRate} THKT / minute</dd></div>
              <div><dt>Rate with a pass</dt><dd className="nft-boost">{(yourNode.baseRate * MULTIPLIER).toFixed(2)} THKT / minute</dd></div>
            </dl>

            <p className="hint">
              A pass boosts <strong>one operator address</strong>. Running a fleet does not
              multiply it — each node would need its own pass, and there are only {SUPPLY}.
            </p>
          </div>
        </section>

        <section className="section-block">
          <h2 className="nft-h2">How it works</h2>
          <table className="docs-table">
            <tbody>
              <tr><th>Burn</th><td>THKT is burned via <code>burnFrom</code> on the token, not transferred. Total supply drops and nobody receives it.</td></tr>
              <tr><th>Multiplier</th><td>Applied at epoch settlement to that operator's uptime earnings. Verified against the chain, not self-reported.</td></tr>
              <tr><th>Scope</th><td>One pass boosts one operator address. Transferable — the multiplier follows whoever holds it.</td></tr>
              <tr><th>Supply</th><td>{SUPPLY} minted at deploy, none afterwards. There is no mint function.</td></tr>
            </tbody>
          </table>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
