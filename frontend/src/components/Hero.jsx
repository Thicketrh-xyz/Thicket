import { HeroArt } from "./Logo";
import { DEMO } from "../config";

const fmt = (n) => n.toLocaleString("en-US");

export function Hero({ onConnect }) {
  return (
    <section className="hero">
      <div className="banner-strip" />
      <div className="container">
        <div className="hero-grid">
          <div>
            <span className="pill">● Live on Robinhood Chain testnet</span>
            <h1>
              Your idle GPU,<br />
              <span className="accent">earning.</span>
            </h1>
            <p className="lead">
              Run a Thicket node, power decentralized AI, and earn THKT for every
              verified minute you're online.
            </p>
            <div className="hero-cta">
              <button className="btn" onClick={onConnect}>Connect & run a node</button>
              <a className="btn ghost" href="#how">How it works</a>
            </div>
          </div>
          <div>
            <HeroArt />
          </div>
        </div>

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
    </section>
  );
}
