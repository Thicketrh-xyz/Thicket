import { Logo } from "./Logo";

// Portal header — wallet connect lives here (the app), not on the landing page.
export function Header({ address, onConnect, onToggleTheme }) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  return (
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href="/" style={{ textDecoration: "none" }}>
          <Logo size={28} /> <span className="name">Thicket</span>
        </a>
        <nav className="nav">
          <a href="#compute">Compute</a>
          <a href="#dashboard">Dashboard</a>
          <a href="#stake">Stake</a>
          <a href="/docs">Docs</a>
          <button className="btn ghost sm" onClick={onToggleTheme} title="Toggle theme">◐</button>
          <button className="btn sm" onClick={onConnect}>{short || "Connect Wallet"}</button>
        </nav>
      </div>
    </header>
  );
}
