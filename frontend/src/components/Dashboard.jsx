import { useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { fetchNode } from "../lib/api";
import { claimRewards } from "../lib/chain";
import { CONTRACTS_LIVE } from "../config";

const fmt = (n, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function Dashboard({ session, notify }) {
  const address = session?.address;
  const [node, setNode] = useState(null);      // latest server snapshot
  const [earned, setEarned] = useState(0);     // live-ticking THKT
  const [busy, setBusy] = useState(false);
  const sync = useRef({ base: 0, rate: 0, t: 0, online: false });

  // Poll the coordinator for this wallet's node every 4s.
  useEffect(() => {
    if (!address || !CONTRACTS_LIVE) { setNode(null); return; }
    let alive = true;
    const load = async () => {
      const n = await fetchNode(address);
      if (!alive) return;
      setNode(n);
      if (n?.registered) {
        sync.current = {
          base: n.earned_thkt,
          rate: n.online ? n.reward_per_minute / 60 : 0, // THKT/sec
          t: Date.now(),
          online: n.online,
        };
        setEarned(n.earned_thkt);
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [address]);

  // Between polls, interpolate the earned counter every second so it ticks live.
  useEffect(() => {
    const id = setInterval(() => {
      const s = sync.current;
      if (!s.online) return;
      setEarned(s.base + s.rate * ((Date.now() - s.t) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function onClaim() {
    if (!session) return notify("Connect your wallet to claim.");
    if (!node?.claim) return notify("Nothing settled yet — earnings become claimable each epoch.");
    try {
      setBusy(true);
      await claimRewards(session.signer, address, node.claim.cumulativeAmount, node.claim.proof);
      notify("Claimed! THKT sent to your wallet.");
    } catch (e) {
      notify(e.shortMessage || e.reason || e.message || "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  const connected = !!session && CONTRACTS_LIVE;
  const registered = node?.registered;
  const online = node?.online;
  const claimable = node?.claim ? Number(formatUnits(node.claim.cumulativeAmount, 18)) : 0;

  return (
    <section className="section" id="dashboard">
      <div className="container">
        <h2>Node dashboard</h2>
        <p className="sub">Live view of your node's contribution and earnings.</p>

        <div className="grid2">
          <div className="card">
            <div className="row">
              <h3>Node status</h3>
              {connected && registered && (
                <span className="status">
                  <span className={`dot ${online ? "on" : "off"}`} />
                  {online ? "Online" : "Offline"}
                </span>
              )}
            </div>

            {!connected ? (
              <p className="muted" style={{ marginTop: 14 }}>Connect your wallet to see your node.</p>
            ) : !registered ? (
              <p className="muted" style={{ marginTop: 14 }}>
                No node found for this wallet yet. Bond in <a href="#stake">Stake</a> and run the node client.
              </p>
            ) : (
              <div style={{ marginTop: 14 }}>
                <div className="kv"><span className="k">Operator</span><span className="v">{address.slice(0, 6)}…{address.slice(-4)}</span></div>
                <div className="kv"><span className="k">Contribution this epoch</span><span className="v">{fmt(node.contribution_minutes, 2)} min</span></div>
                <div className="kv"><span className="k">Reward rate</span><span className="v">{node.reward_per_minute} THKT / min</span></div>
                <div className="kv"><span className="k">Earned (live)</span><span className="v" style={{ color: "var(--accent-ink)" }}>{fmt(earned, 4)} THKT</span></div>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Claimable rewards</h3>
            <p className="muted">Earnings settle to an on-chain Merkle root each epoch — then they're claimable.</p>
            <div className="big-num" style={{ margin: "14px 0 4px" }}>{fmt(claimable, 4)}</div>
            <div className="muted" style={{ marginBottom: 18 }}>THKT claimable</div>
            <button className="btn" onClick={onClaim} disabled={busy || !connected || !node?.claim}>
              {busy ? "Claiming…" : "Claim rewards"}
            </button>
            {connected && registered && !node?.claim && (
              <p className="muted" style={{ marginTop: 12 }}>
                {fmt(earned, 4)} THKT earned — waiting for the next epoch to settle.
              </p>
            )}
            {!connected && <p className="muted" style={{ marginTop: 12 }}>Connect a wallet for live data.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
