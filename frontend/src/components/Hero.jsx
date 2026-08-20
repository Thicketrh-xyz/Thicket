import { useEffect, useState } from "react";
import { CircuitForest } from "./Logo";
import { fetchStats } from "../lib/api";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

export function Hero({ onRunNode }) {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-inner">
          <h1>
            Grow the network.<br />
            <span className="accent">Earn from your GPU.</span>
          </h1>
          <p className="lead">
            Run a Thicket node, contribute AI compute, and earn THKT for every
            verified minute you're online.
          </p>
          <div className="hero-cta">
            <button className="btn" onClick={onRunNode}>Run a node</button>
            <a className="btn ghost" href="#how">How it works</a>
          </div>
        </div>
      </div>
      <CircuitForest />
    </section>
  );
}

export function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { const d = await fetchStats(); if (alive && d) setS(d); };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="container">
      <div className="stats">
        <div className="stat">
          <div className="val">{fmt(s?.active_nodes)}</div>
          <div className="lbl">Active nodes</div>
        </div>
        <div className="stat">
          <div className="val">{fmt(s?.minutes_contributed)}</div>
          <div className="lbl">Minutes contributed</div>
        </div>
        <div className="stat">
          <div className="val">{fmt(s?.thkt_earned)}</div>
          <div className="lbl">THKT earned</div>
        </div>
      </div>
    </div>
  );
}
