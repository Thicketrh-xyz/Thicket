import { useEffect, useState } from "react";
import { ArrowUpRight, LogOut } from "lucide-react";
import { SiteHeader, SiteFooter, SectionLabel } from "./components/SiteChrome";
import { ComputePanel } from "./components/ComputePanel";
import { Dashboard } from "./components/Dashboard";
import { StakePanel } from "./components/StakePanel";
import { NodeGuide } from "./components/NodeGuide";
import { PortalStats } from "./components/PortalStats";
import { JobHistory } from "./components/JobHistory";
import { connect, disconnect, hasWallet } from "./lib/chain";
import { CONTRACTS_LIVE } from "./config";
import "./ref-landing.css";
import "./app-docs.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "#compute", label: "Compute" },
  { href: "#jobs", label: "Jobs" },
  { href: "#dashboard", label: "Dashboard" },
  { href: "/nodes", label: "Nodes" },
  { href: "/nft", label: "Passes" },
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
      if (localStorage.getItem("thicket:disconnected") === "1") return;
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (accs?.length) setSession(await connect());
      } catch { /* ignore */ }
    })();
  }, []);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 3400); }

  async function onConnect() {
    if (!hasWallet()) return notify("No wallet detected — install MetaMask to go live.");
    try {
      setSession(await connect());
      localStorage.removeItem("thicket:disconnected");
      notify("Wallet connected.");
    } catch (e) {
      notify(e.shortMessage || e.message || "Connection failed");
    }
  }

  async function onDisconnect() {
    await disconnect();
    setSession(null);
    localStorage.setItem("thicket:disconnected", "1");   // don't auto-reconnect on reload
    notify("Wallet disconnected.");
  }

  const short = session?.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : null;

  return (
    <div id="top" className="site-shell">
      <SiteHeader
        links={NAV}
        cta={
          <button
            className="button button--primary button--small"
            onClick={session ? onDisconnect : onConnect}
            title={session ? `${session.address} — click to disconnect` : "Connect your wallet"}
          >
            {short || "Connect wallet"}
            {session ? <LogOut size={14} /> : <ArrowUpRight size={15} />}
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
        <JobHistory session={session} />
        <Dashboard session={session} notify={notify} />
        <StakePanel session={session} notify={notify} />
      </div>

      <SiteFooter />
      <NodeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
