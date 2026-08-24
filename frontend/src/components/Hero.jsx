import { useEffect, useState } from "react";
import { fetchStats } from "../lib/api";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

// Live network stats strip — real figures from the coordinator.
export function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { const d = await fetchStats(); if (alive && d) setS(d); };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="container">
      <div className="stats">
        <div className="stat">
          <div className="val">{fmt(s?.active_nodes)}</div>
          <div className="lbl">Active nodes</div>
        </div>
        <div className="stat">
          <div className="val">{fmt(s?.tasks_executed)}</div>
          <div className="lbl">Tasks executed</div>
        </div>
        <div className="stat">
          <div className="val">{fmt(s?.thkt_earned)}</div>
          <div className="lbl">THKT earned by nodes</div>
        </div>
      </div>
    </div>
  );
}
