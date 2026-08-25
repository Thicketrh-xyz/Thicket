import { useEffect, useState } from "react";
import { fetchStats } from "../lib/api";

const fmt = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));

const TILES = [
  ["active_nodes", "Active nodes"],
  ["tasks_executed", "Tasks executed"],
  ["jobs_running", "Jobs running"],
  ["pool_thkt", "Rewards pool · THKT"],
];

// Live network figures across the top of the portal.
export function PortalStats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { const d = await fetchStats(); if (alive && d) setS(d); };
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="tile-row">
      {TILES.map(([k, label]) => (
        <div className="tile" key={k}>
          <div className="tile__k">{label}</div>
          <div className="tile__v">{fmt(s?.[k])}</div>
        </div>
      ))}
    </div>
  );
}
