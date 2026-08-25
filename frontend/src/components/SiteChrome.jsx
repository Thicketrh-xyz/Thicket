import { ArrowUpRight, Github, Mail } from "lucide-react";

// The real X wordmark — lucide's `X` is a close icon, not the brand.
export const XLogo = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const MARK = "/logo-mark.png";
const X_URL = "https://x.com/thicket_rh";
const GITHUB = "https://github.com/Thicketrh-xyz/Thicket";
const SUPPORT = "mailto:thicket@thicketrh.xyz";

export function SectionLabel({ children, light = false }) {
  return (
    <div className={`section-label ${light ? "section-label--light" : ""}`}>
      <span className="section-label__dot" />
      {children}
    </div>
  );
}

export function BrandMark({ compact = false }) {
  return (
    <a className="brand" href="/" aria-label="Thicket home">
      <span className={`brand__mark ${compact ? "brand__mark--compact" : ""}`}>
        <img src={MARK} alt="" />
      </span>
      {!compact && <span className="brand__word">Thicket</span>}
    </a>
  );
}

// Shared header. `cta` lets the portal swap "Launch app" for the wallet button.
export function SiteHeader({ links = [], cta = null }) {
  return (
    <header className="site-header">
      <nav className="nav-shell" aria-label="Main navigation">
        <BrandMark />
        <div className="nav-links">
          {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </div>
        <div className="nav-actions">
          <a className="nav-social" href={X_URL} target="_blank" rel="noreferrer" aria-label="Thicket on X">
            <XLogo size={15} />
          </a>
          <a className="nav-social" href={GITHUB} target="_blank" rel="noreferrer" aria-label="Thicket on GitHub">
            <Github size={16} />
          </a>
          {cta ?? (
            <a className="button button--primary button--small" href="/app">
              Launch app <ArrowUpRight size={15} />
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer__brand">
        <BrandMark />
        <p>A decentralized GPU network. Grow the thicket, earn from your compute.</p>
        <div className="footer__status"><span /> TESTNET OPERATIONAL</div>
      </div>
      <div className="footer__links">
        <div>
          <span>NETWORK</span>
          <a href="/docs#run-a-node">Run a node</a>
          <a href="/app#stake">Stake THKT</a>
          <a href="/#roadmap">Roadmap</a>
        </div>
        <div>
          <span>DEVELOPERS</span>
          <a href="/#verification">How it works</a>
          <a href="/docs">Documentation</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <div>
          <span>COMMUNITY</span>
          <a className="footer__x" href={X_URL} target="_blank" rel="noreferrer" aria-label="Thicket on X">
            <XLogo size={20} />
          </a>
          <a className="footer__social" href={SUPPORT}>
            <Mail size={15} /> Contact support
          </a>
        </div>
      </div>
      <div className="footer__legal">
        <span>© 2026 THICKET</span>
        <span>Built on Robinhood Chain</span>
      </div>
    </footer>
  );
}
