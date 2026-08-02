import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-cols">
          <div>
            <div className="brand"><Logo size={26} /> <span className="name">Thicket</span></div>
            <p style={{ margin: 0, maxWidth: "30ch" }}>
              A decentralized GPU network. Grow the thicket, earn from your compute.
            </p>
          </div>
          <div>
            <h4>Network</h4>
            <a href="#participate">Run a node</a>
            <a href="#stake">Stake</a>
            <a href="#dashboard">Dashboard</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div>
            <h4>Developers</h4>
            <a href="#how">How it works</a>
            <a href="#">Docs</a>
            <a href="#">GitHub</a>
          </div>
          <div>
            <h4>Community</h4>
            <a href="#">X / Twitter</a>
            <a href="#">Discord</a>
            <a href="#">GitHub</a>
          </div>
        </div>
        <div className="footer-bottom row">
          <span>🌿 Thicket — decentralized GPU network on Robinhood Chain</span>
          <span>Testnet · not audited</span>
        </div>
      </div>
    </footer>
  );
}
