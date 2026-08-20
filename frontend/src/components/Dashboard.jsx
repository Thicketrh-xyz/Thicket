import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { fetchNode } from "../lib/api";
import { claimRewards, getRewardsInfo } from "../lib/chain";
import { CONTRACTS_LIVE } from "../config";

const fmt = (n, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// minutes -> "1h 23m" / "5m 12s" / "42s"
function fmtDuration(mins) {
  const s = Math.max(0, Math.floor(mins * 60));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function Dashboard({ session, notify }) {
  const address = session?.address;
  const [node, setNode] = useState(null);           // coordinator snapshot
  const [rewards, setRewards] = useState(null);      // { claimed, balance } on-chain (bigint)
  const [earned, setEarned] = useState(0);           // live-ticking THKT
  const [busy, setBusy] = useState(false);
  const sync = useRef({ base: 0, rate: 0, t: 0, online: false });

  const loadAll = useCallback(async () => {
    if (!address || !CONTRACTS_LIVE) { setNode(null); setRewards(null); return; }
    const [n, r] = await Promise.all([
      fetchNode(address),
      getRewardsInfo(session.signer, address).catch(() => null),
    ]);
    setNode(n);
    setRewards(r);
    if (n?.registered) {
      sync.current = {
        base: n.earned_thkt,
        rate: n.online ? n.reward_per_minute / 60 : 0,
        t: Date.now(),
        online: n.online,
      };
      setEarned(n.earned_thkt);
    }
  }, [address, session]);

  useEffect(() => {
    if (!address) return;
    loadAll();
    const id = setInterval(loadAll, 4000);
    return () => clearInterval(id);
  }, [address, loadAll]);

  // interpolate the live counter each second between polls
  useEffect(() => {
    const id = setInterval(() => {
      const s = sync.current;
      if (!s.online) return;
      setEarned(s.base + s.rate * ((Date.now() - s.t) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const connected = !!session && CONTRACTS_LIVE;
  const registered = node?.registered;
  const online = node?.online;
  const rate = node?.reward_per_minute || 1;

  // claimable = settled cumulative − already claimed on-chain (nets to 0 after a claim)
  const settledWei = node?.claim ? BigInt(node.claim.cumulativeAmount) : 0n;
  const claimedWei = rewards?.claimed ?? 0n;
  const claimableWei = settledWei > claimedWei ? settledWei - claimedWei : 0n;
  const claimable = Number(formatUnits(claimableWei, 18));
  const claimedTotal = rewards ? Number(formatUnits(rewards.claimed, 18)) : 0;
  const balance = rewards ? Number(formatUnits(rewards.balance, 18)) : 0;
  const totalMinutes = earned / rate; // lifetime contribution time

  async function onClaim() {
    if (!session) return notify("Connect your wallet to claim.");
    if (claimableWei === 0n) return notify("Nothing to claim yet — earnings settle each epoch.");
    try {
      setBusy(true);
      await claimRewards(session.signer, address, node.claim.cumulativeAmount, node.claim.proof);
      notify(`Claimed ${fmt(claimable, 4)} THKT — sent to your wallet.`);
      await loadAll(); // refresh balance + claimed so the UI reflects it immediately
    } catch (e) {
      notify(e.shortMessage || e.reason || e.message || "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" id="dashboard">
      <div className="container">
        <h2>Node dashboard</h2>
        <p className="sub">Live view of your node's contribution, earnings, and claims.</p>

        {connected && registered && (
          <div className="stats" style={{ padding: "0 0 20px" }}>
            <div className="stat"><div className="val">{fmtDuration(totalMinutes)}</div><div className="lbl">Total contribution time</div></div>
            <div className="stat"><div className="val">{fmt(earned, 4)}</div><div className="lbl">THKT earned (lifetime)</div></div>
            <div className="stat"><div className="val">{fmt(claimedTotal, 2)}</div><div className="lbl">THKT claimed</div></div>
          </div>
        )}

        <div className="grid2">
          <div className="card">
            <div className="row">
              <h3>Node status</h3>
              {connected && registered && (
                <span className="status"><span className={`dot ${online ? "on" : "off"}`} />{online ? "Online" : "Offline"}</span>
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
                <div className="kv"><span className="k">Reward rate</span><span className="v">{rate} THKT / min</span></div>
                <div className="kv"><span className="k">Contribution this epoch</span><span className="v">{fmt(node.contribution_minutes, 2)} min</span></div>
                <div className="kv"><span className="k">Earned (live)</span><span className="v" style={{ color: "var(--accent-ink)" }}>{fmt(earned, 4)} THKT</span></div>
                {!online && <p className="muted" style={{ marginTop: 12 }}>Node offline — stats frozen at last heartbeat. Restart the client to keep earning.</p>}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Rewards</h3>
            <p className="muted">Earnings settle to an on-chain Merkle root each epoch, then you claim.</p>
            <div style={{ margin: "12px 0" }}>
              <div className="kv"><span className="k">Wallet balance</span><span className="v">{fmt(balance, 2)} THKT</span></div>
              <div className="kv"><span className="k">Claimed to date</span><span className="v">{fmt(claimedTotal, 2)} THKT</span></div>
            </div>
            <div className="big-num" style={{ margin: "6px 0 2px" }}>{fmt(claimable, 4)}</div>
            <div className="muted" style={{ marginBottom: 16 }}>THKT claimable now</div>
            <button className="btn" onClick={onClaim} disabled={busy || !connected || claimableWei === 0n}>
              {busy ? "Claiming…" : "Claim rewards"}
            </button>
            {connected && registered && claimableWei === 0n && earned > claimedTotal && (
              <p className="muted" style={{ marginTop: 12 }}>{fmt(earned - claimedTotal, 4)} THKT earned — waiting for the next epoch to settle.</p>
            )}
            {!connected && <p className="muted" style={{ marginTop: 12 }}>Connect a wallet for live data.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
