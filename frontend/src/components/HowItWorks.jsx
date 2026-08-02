const STEPS = [
  { n: "01", t: "Bond & register", d: "Stake THKT to register your node — skin in the game that anti-sybil rests on." },
  { n: "02", t: "Stay online", d: "Your node sends signed heartbeats; the network credits contribution minutes." },
  { n: "03", t: "Pass challenges", d: "Periodic verifiable inference tasks prove you're really doing the work." },
  { n: "04", t: "Claim THKT", d: "Each epoch, rewards settle to a Merkle root — claim yours in one transaction." },
];

export function HowItWorks() {
  return (
    <section className="section" id="how" style={{ background: "var(--bg-panel)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="container">
        <h2>How it works</h2>
        <p className="sub">A hybrid model: reward uptime, but only verified compute keeps earning.</p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(4, 1fr)", padding: "8px 0 0" }}>
          {STEPS.map((s) => (
            <div className="stat" key={s.n}>
              <div className="val" style={{ fontSize: "1.1rem" }}>{s.n}</div>
              <div style={{ fontWeight: 700, margin: "6px 0 4px" }}>{s.t}</div>
              <div className="lbl">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
