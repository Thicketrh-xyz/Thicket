import { useEffect, useState } from "react";
import { DEMO } from "../config";
import { fetchClaimFor } from "../lib/api";
import { claimRewards } from "../lib/chain";
import { formatUnits } from "ethers";

const fmt = (n, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export function Dashboard({ session, notify }) {
  const address = session?.address || DEMO.address;
  const [claim, setClaim] = useState(null); // { cumulativeAmount, proof }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchClaimFor(address).then((c) => alive && setClaim(c));
    return () => { alive = false; };
  }, [address]);

  const claimableThkt = claim ? Number(formatUnits(claim.cumulativeAmount, 18)) : DEMO.earnings;

  async function onClaim() {
    if (!session) return notify("Connect your wallet to claim.");
    if (!claim) return notify("No claim available yet — earn some minutes first.");
    try {
      setBusy(true);
      await claimRewards(session.signer, address, claim.cumulativeAmount, claim.proof);
      notify("Claimed! THKT sent to your wallet.");
    } catch (e) {
      notify(e.shortMessage || e.message || "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  const online = DEMO.online;

  return (
    <section className="section" id="dashboard">
      <div className="container">
        <h2>Node dashboard</h2>
        <p className="sub">Live view of your node's contribution and earnings.</p>

        <div className="grid2">
          <div className="card">
            <div className="row">
              <h3>Node status</h3>
              <span className="status">
                <span className={`dot ${online ? "on" : "off"}`} />
                {online ? "Online" : "Offline"}
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="kv"><span className="k">Operator</span><span className="v">{address.slice(0, 6)}…{address.slice(-4)}</span></div>
              <div className="kv"><span className="k">Contribution this epoch</span><span className="v">{fmt(DEMO.contributionMinutes)} min</span></div>
              <div className="kv"><span className="k">Challenges passed</span><span className="v">{DEMO.challengesPassed}</span></div>
              <div className="kv"><span className="k">Reward rate</span><span className="v">1.0 THKT / min</span></div>
            </div>
          </div>

          <div className="card">
            <h3>Claimable rewards</h3>
            <p className="muted">Accrued off-chain, claimed on-chain via Merkle proof.</p>
            <div className="big-num" style={{ margin: "14px 0 4px" }}>{fmt(claimableThkt)}</div>
            <div className="muted" style={{ marginBottom: 18 }}>THKT</div>
            <button className="btn" onClick={onClaim} disabled={busy}>
              {busy ? "Claiming…" : "Claim rewards"}
            </button>
            {!session && <p className="muted" style={{ marginTop: 12 }}>Demo figures — connect a wallet for live data.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
