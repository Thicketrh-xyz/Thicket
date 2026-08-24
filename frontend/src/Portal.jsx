import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { ComputePanel } from "./components/ComputePanel";
import { Dashboard } from "./components/Dashboard";
import { StakePanel } from "./components/StakePanel";
import { NodeGuide } from "./components/NodeGuide";
import { PortalStats } from "./components/PortalStats";
import { connect, hasWallet } from "./lib/chain";
import { CONTRACTS_LIVE } from "./config";

// The app. Wallet connect, compute, dashboard, staking, claims — all here.
export default function Portal() {
  const [session, setSession] = useState(null);
  const [theme, setTheme] = useState("light");
  const [toast, setToast] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // Silent reconnect if the wallet is already authorized.
  useEffect(() => {
    (async () => {
      if (!hasWallet()) return;
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (accs?.length) setSession(await connect());
      } catch { /* ignore */ }
    })();
  }, []);

  function notify(msg) { setToast(msg); setTimeout(() => setToast(null), 3200); }

  async function onConnect() {
    if (!hasWallet()) return notify("No wallet detected — install MetaMask to go live.");
    try { setSession(await connect()); notify("Wallet connected."); }
    catch (e) { notify(e.shortMessage || e.message || "Connection failed"); }
  }

  return (
    <>
      <Header
        address={session?.address}
        onConnect={onConnect}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      {!CONTRACTS_LIVE && (
        <div className="demo-banner"><b>Demo mode</b> — contracts aren't deployed yet, so figures are illustrative.</div>
      )}
      <section className="portal-intro">
        <div className="container row">
          <div>
            <h1>Thicket portal</h1>
            <p className="sub">Run a node, buy compute, and claim rewards on the live network.</p>
          </div>
          <button className="btn sm" onClick={() => setGuideOpen(true)}>Run a node</button>
        </div>
      </section>

      <PortalStats />
      <ComputePanel session={session} notify={notify} />
      <Dashboard session={session} notify={notify} />
      <StakePanel session={session} notify={notify} />
      <NodeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
