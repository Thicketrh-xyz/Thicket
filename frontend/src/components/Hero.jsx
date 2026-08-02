import { CircuitForest } from "./Logo";
import { DEMO } from "../config";

const fmt = (n) => n.toLocaleString("en-US");

export function Hero({ onConnect }) {
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
            <button className="btn" onClick={onConnect}>Connect &amp; run a node</button>
            <a className="btn ghost" href="#how">How it works</a>
          </div>
        </div>
      </div>
      <CircuitForest />
    </section>
  );
}

export function Stats() {
  return (
    <div className="container">
      <div className="stats">
        <div className="stat">
          <div className="val">{fmt(DEMO.networkTflops)}</div>
          <div className="lbl">TFLOPS contributed</div>
        </div>
        <div className="stat">
          <div className="val">{fmt(DEMO.activeNodes)}</div>
          <div className="lbl">Active nodes</div>
        </div>
        <div className="stat">
          <div className="val">{fmt(DEMO.tasksExecuted)}</div>
          <div className="lbl">Tasks executed</div>
        </div>
      </div>
    </div>
  );
}
