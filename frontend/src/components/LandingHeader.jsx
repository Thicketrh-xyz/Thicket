import { Logo } from "./Logo";

// Marketing header — no wallet. The app lives behind "Launch app" (/app).
export function LandingHeader() {
  return (
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href="/" style={{ textDecoration: "none" }}>
          <Logo size={28} /> <span className="name">Thicket</span>
        </a>
        <nav className="nav">
          <a href="#how">How it works</a>
          <a href="#roadmap">Roadmap</a>
          <a href="/docs">Docs</a>
          <a className="btn sm" href="/app">Launch app</a>
        </nav>
      </div>
    </header>
  );
}
