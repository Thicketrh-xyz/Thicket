import { Logo } from "./Logo";

export function Header({ address, onConnect, onToggleTheme }) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  return (
    <header className="header">
      <div className="container header-inner">
        <div className="brand">
          <Logo size={28} />
          <span className="name">Thicket</span>
        </div>
        <nav className="nav">
          <a href="#how">How it works</a>
          <a href="#compute">Compute</a>
          <a href="#stake">Stake</a>
          <a href="/docs">Docs</a>
          <button className="btn ghost sm" onClick={onToggleTheme} title="Toggle theme">◐</button>
          <button className="btn sm" onClick={onConnect}>
            {short || "Connect Wallet"}
          </button>
        </nav>
      </div>
    </header>
  );
}
