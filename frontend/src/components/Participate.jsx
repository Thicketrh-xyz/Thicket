export function Participate({ onRunNode }) {
  return (
    <section className="section mist" id="participate">
      <div className="container">
        <h2>Ways to participate</h2>
        <p className="sub">Bring hardware, bring capital, or bring code — there's a way in for everyone.</p>
        <div className="cta-grid">
          <div className="cta-card">
            <h3>Run a node</h3>
            <p>Share a spare GPU, pass challenges, and earn THKT for every verified minute you're online.</p>
            <button className="btn" onClick={onRunNode}>Run a node</button>
          </div>
          <div className="cta-card">
            <h3>Delegate &amp; earn</h3>
            <p>No hardware? Stake THKT to an operator and share the rewards their node produces.</p>
            <a className="btn ghost" href="#stake">Stake now</a>
          </div>
          <div className="cta-card">
            <h3>Build on Thicket</h3>
            <p>Send inference and fine-tuning jobs to the network through a simple API. Docs coming with mainnet.</p>
            <a className="btn ghost" href="#how">See how it works</a>
          </div>
        </div>
      </div>
    </section>
  );
}
