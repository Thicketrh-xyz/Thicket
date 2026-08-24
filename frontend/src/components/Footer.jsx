import { Logo } from "./Logo";

const GITHUB = "https://github.com/Thicketrh-xyz/Thicket";
const X_URL = "https://x.com/thicket_rh";
const SUPPORT = "mailto:thicketrobinhood@gmail.com";

const ICON = { width: 19, height: 19, fill: "currentColor", "aria-hidden": true };
const XIcon = () => (<svg viewBox="0 0 24 24" {...ICON}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>);
const GitHubIcon = () => (<svg viewBox="0 0 24 24" {...ICON}><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>);
const TelegramIcon = () => (<svg viewBox="0 0 24 24" {...ICON}><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" /></svg>);

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
            <a href="/docs#run-a-node">Run a node</a>
            <a href="/app#stake">Stake</a>
            <a href="/app#dashboard">Dashboard</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div>
            <h4>Developers</h4>
            <a href="#how">How it works</a>
            <a href="/docs">Docs</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div>
            <h4>Community</h4>
            <div className="socials">
              <a className="social" href={X_URL} target="_blank" rel="noreferrer" title="X" aria-label="X"><XIcon /></a>
              <a className="social" href={GITHUB} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub"><GitHubIcon /></a>
              <span className="social soon" title="Telegram — coming soon" aria-label="Telegram (coming soon)"><TelegramIcon /></span>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: "0.82rem", opacity: 0.75 }}>Telegram coming soon</p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>🌿 Thicket — decentralized GPU network on Robinhood Chain</span>
          <span>
            <a href={SUPPORT}>Contact support</a>
            <span style={{ margin: "0 10px", opacity: 0.5 }}>·</span>
            Testnet · not audited
          </span>
        </div>
      </div>
    </footer>
  );
}
