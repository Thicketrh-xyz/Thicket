import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Hero, Stats } from "./components/Hero";
import { WhyThicket, Capabilities } from "./components/Features";
import { Dashboard } from "./components/Dashboard";
import { StakePanel } from "./components/StakePanel";
import { HowItWorks } from "./components/HowItWorks";
import { Roadmap } from "./components/Roadmap";
import { ComputePanel } from "./components/ComputePanel";
import { Participate } from "./components/Participate";
import { Footer } from "./components/Footer";
import { NodeGuide } from "./components/NodeGuide";
import { connect, hasWallet } from "./lib/chain";
import { CONTRACTS_LIVE } from "./config";

export default function App() {
  const [session, setSession] = useState(null); // { provider, signer, address }
  const [theme, setTheme] = useState("light");
  const [toast, setToast] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function onConnect() {
    if (!hasWallet()) return notify("No wallet detected — install MetaMask to go live. Showing demo data.");
    try {
      setSession(await connect());
      notify("Wallet connected.");
    } catch (e) {
      notify(e.shortMessage || e.message || "Connection failed");
    }
  }

  const openGuide = () => setGuideOpen(true);

  return (
    <>
      <Header
        address={session?.address}
        onConnect={onConnect}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      {!CONTRACTS_LIVE && (
        <div className="demo-banner">
          <b>Demo mode</b> — contracts aren't deployed to testnet yet, so figures are illustrative and on-chain actions are disabled. See <a href="#how">how it works</a>.
        </div>
      )}
      <Hero onRunNode={openGuide} />
      <Stats />
      <WhyThicket />
      <HowItWorks />
      <Capabilities />
      <Roadmap />
      <ComputePanel session={session} notify={notify} />
      <Dashboard session={session} notify={notify} />
      <StakePanel session={session} notify={notify} />
      <Participate onRunNode={openGuide} />
      <Footer />
      <NodeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
