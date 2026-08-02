const STEPS = [
  { n: "1", t: "Bond & register", d: "Stake THKT to register your node — skin in the game that anti-sybil rests on." },
  { n: "2", t: "Stay online", d: "Your node sends signed heartbeats; the network credits contribution minutes." },
  { n: "3", t: "Pass challenges", d: "Periodic verifiable inference tasks prove you're really doing the work." },
  { n: "4", t: "Claim THKT", d: "Each epoch, rewards settle to a Merkle root — claim yours in one transaction." },
];

export function HowItWorks() {
  return (
    <section className="section mist" id="how">
      <div className="container">
        <h2>How it works</h2>
        <p className="sub">A hybrid model: reward uptime, but only verified compute keeps earning.</p>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="n">{s.n}</div>
              <div className="t">{s.t}</div>
              <div className="d">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
