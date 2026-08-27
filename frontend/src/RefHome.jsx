/**
 * Canopy Protocol style: organic futurism + Swiss information design.
 * This page uses warm daylight canvas, deep forest proof chambers, and acid-lime
 * signals to make Thicket's verifiable compute loop visible and role-focused.
 */
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  ChevronRight,
  CircleCheck,
  Code2,
  Cpu,
  Github,
  Leaf,
  Mail,
  Menu,
  Network,
  Signal,
  Sprout,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { XLogo, SupportLink } from "./components/SiteChrome";

const assets = {
  hero: "/manus-storage/thicket-hero-canopy_437b540a.png",
  verification: "/manus-storage/thicket-verification-chamber_11c50065.png",
  network: "/manus-storage/thicket-network-crop_637c3275.png",
  mark: "/logo.png",
};

const roles = [
  {
    id: "operator",
    eyebrow: "01 / OPERATORS",
    icon: Cpu,
    title: "Put your GPU to work.",
    body: "Bond THKT, run a node, and earn for compute the network can verify.",
    action: "Run a node",
    href: "https://www.thicketrh.xyz/docs/run-a-node",
    accent: "operator",
  },
  {
    id: "delegator",
    eyebrow: "02 / DELEGATORS",
    icon: Sprout,
    title: "Back the network.",
    body: "Delegate THKT to operators and share in the value verified nodes create.",
    action: "Stake THKT",
    href: "https://www.thicketrh.xyz/app#stake",
    accent: "delegator",
  },
  {
    id: "builder",
    eyebrow: "03 / BUILDERS",
    icon: Code2,
    title: "Build on open compute.",
    body: "Send AI workloads to a distributed GPU network through a simple API.",
    action: "Read API docs",
    href: "https://www.thicketrh.xyz/docs/api",
    accent: "builder",
  },
];

const verificationSteps = [
  {
    number: "01",
    title: "Bond & register",
    body: "Stake THKT and make your GPU discoverable to the network.",
    tag: "Anti-Sybil",
  },
  {
    number: "02",
    title: "Stay online",
    body: "Signed heartbeats establish availability and contribution time.",
    tag: "Live signal",
  },
  {
    number: "03",
    title: "Pass challenges",
    body: "Tasks are sent to three random nodes at once; the majority decides.",
    tag: "Verified",
  },
  {
    number: "04",
    title: "Claim THKT",
    body: "Minutes online and a share of completed work settle each epoch.",
    tag: "On-chain",
  },
];

const roadmap = [
  {
    state: "SHIPPED",
    stage: "Seed",
    items: ["THKT token", "Staking + slashing", "Merkle reward claims"],
  },
  {
    state: "CURRENT",
    stage: "Sprout",
    items: ["Coordinator + heartbeats", "Verifiable challenges", "Model runtime · text + vision",
            "Redundant verification", "Work-based rewards", "Node client · testnet"],
  },
  {
    state: "NEXT",
    stage: "Sapling",
    items: ["Desktop node app", "Operator job policy", "Audit + mainnet economics"],
  },
  {
    state: "LATER",
    stage: "Canopy",
    items: ["Multi-modality", "Model tokenization", "Mainnet + economics"],
  },
];

function SectionLabel({ children, light = false }) {
  return (
    <div className={`section-label ${light ? "section-label--light" : ""}`}>
      <span className="section-label__dot" />
      {children}
    </div>
  );
}

function BrandMark({ compact = false }) {
  return (
    <a className="brand" href="#top" aria-label="Thicket home">
      <span className={`brand__mark ${compact ? "brand__mark--compact" : ""}`}>
        <img src={assets.mark} alt="" />
      </span>
      {!compact && <span className="brand__word">Thicket</span>}
    </a>
  );
}

function SignalDiagram() {
  return (
    <div className="signal-diagram" aria-hidden="true">
      <div className="signal-diagram__mesh" />
      <div className="signal-diagram__ring signal-diagram__ring--one" />
      <div className="signal-diagram__ring signal-diagram__ring--two" />
      <div className="signal-diagram__ring signal-diagram__ring--three" />
      <div className="signal-diagram__core">
        <CircleCheck size={26} strokeWidth={2.2} />
        <span>VERIFIED</span>
      </div>
      <span className="signal-node signal-node--one" />
      <span className="signal-node signal-node--two" />
      <span className="signal-node signal-node--three" />
      <span className="signal-node signal-node--four" />
      <span className="signal-packet signal-packet--one" />
      <span className="signal-packet signal-packet--two" />
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div id="top" className="site-shell">

      <header className="site-header">
        <nav className="nav-shell" aria-label="Main navigation">
          <BrandMark />
          <div className="nav-links">
            <a href="#network">Network</a>
            <a href="#verification">How it works</a>
            <a href="#roadmap">Roadmap</a>
            <a href="https://www.thicketrh.xyz/docs">Docs</a>
          </div>
          <div className="nav-actions">
            <a className="nav-social" href="https://x.com/thicket_rh" target="_blank" rel="noreferrer" aria-label="Thicket on X">
              <XLogo size={15} />
            </a>
            <a className="nav-social" href="https://github.com/Thicketrh-xyz/Thicket" target="_blank" rel="noreferrer" aria-label="Thicket on GitHub">
              <Github size={16} />
            </a>
            <a className="button button--primary button--small" href="https://www.thicketrh.xyz/app">
              Launch app <ArrowUpRight size={15} />
            </a>
            <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <div className="mobile-nav">
            <a href="#network" onClick={closeMenu}>Network</a>
            <a href="#verification" onClick={closeMenu}>How it works</a>
            <a href="#roadmap" onClick={closeMenu}>Roadmap</a>
            <a href="https://www.thicketrh.xyz/docs" onClick={closeMenu}>Docs</a>
            <a href="https://www.thicketrh.xyz/app" onClick={closeMenu}>Launch app <ArrowUpRight size={16} /></a>
          </div>
        )}
      </header>

      <main>
        <section className="hero section-grid" aria-labelledby="hero-title">
          <div className="hero__copy reveal">
            <SectionLabel>DECENTRALIZED GPU NETWORK</SectionLabel>
            <h1 id="hero-title">The GPU network that <em>proves</em> the work.</h1>
            <p className="hero__lede">
              Thicket turns distributed GPUs into a permissionless AI compute network. Earn for work that is continuously verified and settled on-chain.
            </p>
            <div className="hero__actions">
              <a className="button button--primary" href="#participate">Run a node <ArrowUpRight size={18} /></a>
              <a className="button button--quiet" href="#verification">Explore the network <ChevronRight size={18} /></a>
            </div>
            <div className="hero__proof">
              <span><CircleCheck size={15} /> Permissionless</span>
              <span><CircleCheck size={15} /> Challenge verified</span>
              <span><CircleCheck size={15} /> Robinhood Chain</span>
            </div>
          </div>

          <div className="hero__visual reveal reveal--late">
            <div className="hero__frame">
              <div className="hero__index">THKT / NETWORK 01</div>
              <img src={assets.hero} alt="Abstract node canopy representing Thicket's distributed GPU network" />
              <div className="hero__overlay hero__overlay--top"><span /> HEARTBEAT / LIVE</div>
              <div className="hero__overlay hero__overlay--bottom"><span /> CHALLENGE / PASSED</div>
              <div className="hero__reticle" />
            </div>
            <div className="hero__orbital hero__orbital--one" />
            <div className="hero__orbital hero__orbital--two" />
          </div>
        </section>

        <section className="status-strip" aria-label="Network status">
          <div className="status-strip__intro">
            <span className="status-led" />
            <div><strong>Mainnet Operational</strong><small>Live from the Thicket coordinator</small></div>
          </div>
          <div className="status-strip__items">
            <div><strong>Node client</strong><span>Available</span></div>
            <div><strong>Heartbeats</strong><span>Verified</span></div>
            <div><strong>Challenges</strong><span>Enabled</span></div>
            <div><strong>Claims</strong><span>On-chain</span></div>
          </div>
          <a className="status-strip__link" href="https://www.thicketrh.xyz/docs">Network docs <ArrowUpRight size={16} /></a>
        </section>

        <section id="participate" className="participate section-grid">
          <div className="participate__heading">
            <SectionLabel>ONE NETWORK / THREE PATHS</SectionLabel>
            <h2>Choose your place in the <em>thicket.</em></h2>
          </div>
          <p className="participate__intro">Bring hardware, capital, or code. The network expands when every participant has a clear way in.</p>
          <div className="role-grid">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <a key={role.id} className={`role-card role-card--${role.accent}`} href={role.href} target={role.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  <div className="role-card__topline"><span>{role.eyebrow}</span><Icon size={21} /></div>
                  <div className="role-card__pulse"><span /><span /><span /></div>
                  <h3>{role.title}</h3>
                  <p>{role.body}</p>
                  <span className="role-card__action">{role.action} <ArrowUpRight size={17} /></span>
                </a>
              );
            })}
          </div>
        </section>

        <section id="verification" className="verification">
          <div className="verification__visual">
            <img src={assets.verification} alt="Abstract verification chamber with compute nodes and signal routes" />
            <SignalDiagram />
            <div className="verification__stamp">
              <CircleCheck size={18} />
              <div><span>REWARD STATE</span><strong>Challenge passed</strong></div>
            </div>
          </div>
          <div className="verification__copy">
            <SectionLabel light>VERIFICATION LOOP</SectionLabel>
            <h2>Uptime starts the clock. <em>Verified work</em> earns the reward.</h2>
            <p>Availability starts the earnings; completed jobs are what actually pay. Every node moves through an observable four-stage loop.</p>
            <div className="verification__steps">
              {verificationSteps.map((step) => (
                <div className="verification-step" key={step.number}>
                  <div className="verification-step__count">{step.number}</div>
                  <div><h3>{step.title}</h3><p>{step.body}</p></div>
                  <span>{step.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="network" className="network-story section-grid">
          <div className="network-story__copy">
            <SectionLabel>THE THICKET EFFECT</SectionLabel>
            <h2>From one GPU to a <em>global canopy.</em></h2>
            <p>Thicket coordinates compute at the edge: local machines become a shared, permissionless resource without being absorbed into a central cloud.</p>
            <div className="story-list">
              <div><span>01</span><div><strong>Local hardware</strong><p>From a spare laptop GPU to a professional rack.</p></div></div>
              <div><span>02</span><div><strong>Shared intelligence</strong><p>Inference and fine-tuning work can travel where capacity exists.</p></div></div>
              <div><span>03</span><div><strong>Open participation</strong><p>No whitelist. No centralized gatekeeper.</p></div></div>
            </div>
          </div>
          <div className="network-story__art">
            <div className="network-story__image"><img src={assets.network} alt="Abstract branching network visualization" /></div>
            <div className="network-story__stat"><Network size={18} /><strong>Distributed by design</strong><span>Edge-first compute</span></div>
            <div className="network-story__micro network-story__micro--one">NODE / 08 <span /></div>
            <div className="network-story__micro network-story__micro--two"><span /> TASK ROUTED</div>
          </div>
        </section>

        <section className="builder-band">
          <div className="builder-band__eyebrow"><Terminal size={16} /> THICKET / API PREVIEW</div>
          <div className="builder-band__content">
            <div><h2>A compute layer builders can actually <em>call.</em></h2><p>Route AI workloads across a distributed GPU pool without managing every machine yourself.</p></div>
            <a className="button button--lime-outline" href="https://www.thicketrh.xyz/docs/api">Read API docs <ArrowUpRight size={18} /></a>
          </div>
          <div className="terminal-card">
            <div className="terminal-card__bar"><span /><span /><span /><small>thicket-runtime / request</small></div>
            <pre><code><b>POST</b> /v1/inference{`\n`}{`{\n`}  <i>"model"</i>: <em>"edge/vision-preview"</em>,{`\n`}  <i>"verification"</i>: <em>true</em>,{`\n`}  <i>"network"</i>: <em>"thicket-testnet"</em>{`\n`}{`}`}</code></pre>
            <div className="terminal-card__result"><span><Activity size={15} /> Routing workload</span><strong>3 eligible nodes</strong><span className="terminal-card__verified"><CircleCheck size={15} /> Verification required</span></div>
          </div>
        </section>

        <section className="evidence section-grid">
          <div className="evidence__heading"><SectionLabel>NETWORK TRANSPARENCY</SectionLabel><h2>See the network <em>working.</em></h2></div>
          <p className="evidence__intro">Thicket is growing in public. Each capability is clearly labelled, documented, and connected to its current network state.</p>
          <div className="evidence-grid">
            <a href="https://www.thicketrh.xyz/docs/run-a-node" className="evidence-card"><Cpu size={21} /><div><span className="pill pill--live">TESTNET</span><h3>Node client</h3><p>Run and contribute from your own hardware.</p></div><ArrowUpRight size={18} /></a>
            <a href="https://www.thicketrh.xyz/docs" className="evidence-card"><Signal size={21} /><div><span className="pill pill--live">ENABLED</span><h3>Verification challenges</h3><p>Periodic checks validate useful computation.</p></div><ArrowUpRight size={18} /></a>
            <a href="https://www.thicketrh.xyz/app" className="evidence-card"><Zap size={21} /><div><span className="pill pill--live">ON-CHAIN</span><h3>Reward claims</h3><p>Verified minutes settle each epoch.</p></div><ArrowUpRight size={18} /></a>
            <a href="https://github.com/Thicketrh-xyz/Thicket" className="evidence-card"><Github size={21} /><div><span className="pill pill--open">OPEN</span><h3>Build in public</h3><p>Explore the code, docs, and implementation.</p></div><ArrowUpRight size={18} /></a>
          </div>
        </section>

        <section id="roadmap" className="roadmap">
          <div className="roadmap__top section-grid"><div><SectionLabel light>THE GROWTH PATH</SectionLabel><h2>Every network starts as a seed.</h2></div><p>Thicket grows in deliberate stages, from its first contracts to a full edge-AI canopy.</p></div>
          <div className="roadmap__line" aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="roadmap__grid">
            {roadmap.map((item, index) => (
              <article className={`roadmap-card roadmap-card--${index}`} key={item.stage}>
                <div className="roadmap-card__node"><span /></div>
                <span className="roadmap-card__state">{item.state}</span>
                <h3>{item.stage}</h3>
                <ul>{item.items.map((itemText) => <li key={itemText}>{itemText}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="roadmap__footer"><span>LAST UPDATED / AUGUST 2026</span><a href="https://www.thicketrh.xyz/docs">Read the full roadmap <ArrowUpRight size={16} /></a></div>
        </section>

        <section className="final-cta">
          <div className="final-cta__canopy" />
          <SectionLabel light>START GROWING</SectionLabel>
          <h2>Bring a GPU.<br />Bring capital.<br /><em>Bring code.</em></h2>
          <p>One open network for the compute-heavy work modern AI needs.</p>
          <div className="final-cta__actions"><a className="button button--primary" href="https://www.thicketrh.xyz/docs/run-a-node">Run a node <ArrowUpRight size={18} /></a><a className="button button--dark-quiet" href="https://www.thicketrh.xyz/app">Open app <ArrowUpRight size={18} /></a></div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__brand"><BrandMark /><p>A decentralized GPU network. Grow the thicket, earn from your compute.</p><div className="footer__status"><span /> TESTNET OPERATIONAL</div></div>
        <div className="footer__links"><div><span>NETWORK</span><a href="#participate">Run a node</a><a href="https://www.thicketrh.xyz/app#stake">Stake THKT</a><a href="#roadmap">Roadmap</a></div><div><span>DEVELOPERS</span><a href="#verification">How it works</a><a href="https://www.thicketrh.xyz/docs">Documentation</a><a href="https://github.com/Thicketrh-xyz/Thicket">GitHub</a></div><div><span>COMMUNITY</span><a className="footer__x" href="https://x.com/thicket_rh" target="_blank" rel="noreferrer" aria-label="Thicket on X"><XLogo size={20} /></a><SupportLink /></div></div>
        <div className="footer__legal"><span>© 2026 THICKET</span><span>Built on Robinhood Chain</span><a href="#top">Back to top <ArrowDown size={14} /></a></div>
      </footer>
    </div>
  );
}
