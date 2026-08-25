import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader, SiteFooter, SectionLabel } from "./components/SiteChrome";
import { ComputePanel } from "./components/ComputePanel";
import { Dashboard } from "./components/Dashboard";
import { StakePanel } from "./components/StakePanel";
import { NodeGuide } from "./components/NodeGuide";
import { PortalStats } from "./components/PortalStats";
import { connect, hasWallet } from "./lib/chain";
import { CONTRACTS_LIVE } from "./config";
import "./ref-landing.css";
import "./app-docs.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "#compute", label: "Compute" },
  { href: "#dashboard", label: "Dashboard" },
  { href: "#stake", label: "Stake" },
  { href: "/docs", label: "Docs" },
];

export default function Portal() {
  const [session, setSession] = useState(null);
  const [toast, setToast] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);

  // Reconnect silently if the wallet is already authorized.
  useEffect(() => {
    (async () => {
      if (!hasWallet()) return;
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (accs?.length) setSession(await connect());
      } catch { /* ignore */ }
    })();
  }, []);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 3400); }

  async function onConnect() {
    if (!hasWallet()) return notify("No wallet detected — install MetaMask to go live.");
    try { setSession(await connect()); notify("Wallet connected."); }
    catch (e) { notify(e.shortMessage || e.message || "Connection failed"); }
  }

  const short = session?.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : null;

  return (
    <div id="top" className="site-shell">
      <SiteHeader
        links={NAV}
        cta={
          <button className="button button--primary button--small" onClick={onConnect}>
            {short || "Connect wallet"} <ArrowUpRight size={15} />
          </button>
        }
      />

      {!CONTRACTS_LIVE && (
        <div className="demo-banner"><b>Demo mode</b> — contracts aren't wired, so figures are illustrative.</div>
      )}

      <div className="page-shell">
        <div className="page-intro page-intro__row">
          <div>
            <SectionLabel>Thicket portal</SectionLabel>
            <h1>Run, verify, and claim.</h1>
            <p>Buy compute, watch your node earn, and settle rewards on the live network.</p>
          </div>
          <button className="button button--quiet" onClick={() => setGuideOpen(true)}>
            Run a node <ArrowUpRight size={15} />
          </button>
        </div>

        <PortalStats />
        <ComputePanel session={session} notify={notify} />
        <Dashboard session={session} notify={notify} />
        <StakePanel session={session} notify={notify} />
      </div>

      <SiteFooter />
      <NodeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
