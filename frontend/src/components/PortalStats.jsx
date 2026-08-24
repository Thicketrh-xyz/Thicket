import { useEffect, useState } from "react";
import { fetchStats } from "../lib/api";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

// Live network stats bar for the portal — a dashboard-style header.
export function PortalStats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { const d = await fetchStats(); if (alive && d) setS(d); };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const items = [
    ["active_nodes", "Active nodes"],
    ["tasks_executed", "Tasks executed"],
    ["jobs_running", "Jobs running"],
    ["pool_thkt", "Rewards pool · THKT"],
  ];
  return (
    <div className="container">
      <div className="stats cols4">
        {items.map(([k, l]) => (
          <div className="stat" key={k}>
            <div className="val">{fmt(s?.[k])}</div>
            <div className="lbl">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
