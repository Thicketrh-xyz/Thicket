import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { fetchNode } from "../lib/api";
import { claimRewards, getRewardsInfo } from "../lib/chain";
import { CONTRACTS_LIVE } from "../config";
import { SectionLabel } from "./SiteChrome";

const fmt = (n, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function fmtDuration(mins) {
  const s = Math.max(0, Math.floor(mins * 60));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function Dashboard({ session, notify }) {
  const address = session?.address;
  const [node, setNode] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [earned, setEarned] = useState(0);
  const [busy, setBusy] = useState(false);
  const sync = useRef({ base: 0, rate: 0, t: 0, online: false });

  const loadAll = useCallback(async () => {
    if (!address || !CONTRACTS_LIVE) { setNode(null); setRewards(null); return; }
    const [n, r] = await Promise.all([
      fetchNode(address),
      getRewardsInfo(session.signer, address).catch(() => null),
    ]);
    setNode(n); setRewards(r);
    if (n?.registered) {
      sync.current = { base: n.earned_thkt, rate: n.online ? n.reward_per_minute / 60 : 0, t: Date.now(), online: n.online };
      setEarned(n.earned_thkt);
    }
  }, [address, session]);

  useEffect(() => {
    if (!address) return;
    loadAll();
    const id = setInterval(loadAll, 4000);
    return () => clearInterval(id);
  }, [address, loadAll]);

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

  const settledWei = node?.claim ? BigInt(node.claim.cumulativeAmount) : 0n;
  const claimedWei = rewards?.claimed ?? 0n;
  const claimableWei = settledWei > claimedWei ? settledWei - claimedWei : 0n;
  const claimable = Number(formatUnits(claimableWei, 18));
  const claimedTotal = rewards ? Number(formatUnits(rewards.claimed, 18)) : 0;
  const balance = rewards ? Number(formatUnits(rewards.balance, 18)) : 0;
  const totalMinutes = earned / rate;

  async function onClaim() {
    if (!session) return notify("Connect your wallet to claim.");
    if (claimableWei === 0n) return notify("Nothing to claim yet — earnings settle each epoch.");
    try {
      setBusy(true);
      await claimRewards(session.signer, address, node.claim.cumulativeAmount, node.claim.proof);
      notify(`Claimed ${fmt(claimable, 4)} THKT — sent to your wallet.`);
      await loadAll();
    } catch (e) {
      notify(e.shortMessage || e.reason || e.message || "Claim failed");
    } finally { setBusy(false); }
  }

  return (
    <section className="section-block" id="dashboard">
      <SectionLabel>Node dashboard</SectionLabel>
      <div className="page-intro" style={{ padding: "10px 0 24px" }}>
        <h1 style={{ fontSize: "1.9rem" }}>Your node, in the open.</h1>
        <p>Contribution, earnings, and claims — read straight from the coordinator and the chain.</p>
      </div>

      {connected && registered && (
        <div className="tile-row">
          <div className="tile"><div className="tile__k">Contribution time</div><div className="tile__v">{fmtDuration(totalMinutes)}</div></div>
          <div className="tile"><div className="tile__k">THKT earned</div><div className="tile__v">{fmt(earned, 2)}</div></div>
          <div className="tile"><div className="tile__k">THKT claimed</div><div className="tile__v">{fmt(claimedTotal, 2)}</div></div>
          <div className="tile"><div className="tile__k">Wallet balance</div><div className="tile__v">{fmt(balance, 2)}</div></div>
        </div>
      )}

      <div className="panel-grid">
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Node status</h3>
            {connected && registered && (
              <span className="status-line">
                <span className={online ? "dot-live" : "dot-off"} />{online ? "Online" : "Offline"}
              </span>
            )}
          </div>

          {!connected ? (
            <p className="hint">Connect your wallet to see your node.</p>
          ) : !registered ? (
            <p className="hint">No node found for this wallet. Bond in <a href="#stake">Stake</a> and run the node client.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="kv-row"><span className="k">Operator</span><span className="v">{address.slice(0, 6)}…{address.slice(-4)}</span></div>
              <div className="kv-row"><span className="k">Reward rate</span><span className="v">{rate} THKT / min</span></div>
              <div className="kv-row"><span className="k">Contribution this epoch</span><span className="v">{fmt(node.contribution_minutes, 2)} min</span></div>
              <div className="kv-row"><span className="k">Earned (live)</span><span className="v">{fmt(earned, 4)} THKT</span></div>
              {!online && <p className="hint">Node offline — figures frozen at the last heartbeat.</p>}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="figure-cap">Claimable now</div>
          <div className="big-figure">{fmt(claimable, 4)}</div>
          <p className="panel__hint" style={{ marginTop: 6 }}>THKT · settles to an on-chain Merkle root each epoch</p>
          <button className="button button--primary" onClick={onClaim} disabled={busy || !connected || claimableWei === 0n}>
            {busy ? "Claiming…" : "Claim rewards"}
          </button>
          {connected && registered && claimableWei === 0n && earned > claimedTotal && (
            <p className="hint">{fmt(earned - claimedTotal, 4)} THKT earned — waiting for the next epoch to settle.</p>
          )}
          {!connected && <p className="hint">Connect a wallet for live data.</p>}
        </div>
      </div>
    </section>
  );
}
