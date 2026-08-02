import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Dashboard } from "./components/Dashboard";
import { StakePanel } from "./components/StakePanel";
import { HowItWorks } from "./components/HowItWorks";
import { connect, hasWallet } from "./lib/chain";

export default function App() {
  const [session, setSession] = useState(null); // { provider, signer, address }
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState(null);

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

  return (
    <>
      <Header
        address={session?.address}
        onConnect={onConnect}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <Hero onConnect={onConnect} />
      <Dashboard session={session} notify={notify} />
      <StakePanel session={session} notify={notify} />
      <HowItWorks />
      <footer className="footer">
        <div className="container row">
          <span>🌿 Thicket — decentralized GPU network on Robinhood Chain</span>
          <span>Testnet · not audited</span>
        </div>
      </footer>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
