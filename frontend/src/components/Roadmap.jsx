// Botanical phase names mapped to the real build roadmap.
const PHASES = [
  {
    status: "done", tag: "Shipped", name: "Seed",
    items: ["THKT token", "Staking + slashing", "Merkle reward claims"],
  },
  {
    status: "current", tag: "Now", name: "Sprout",
    items: ["Coordinator + heartbeats", "Verifiable challenges", "Node client · testnet"],
  },
  {
    status: "next", tag: "Next", name: "Sapling",
    items: ["Real model runtime", "Redundant verification", "Desktop node app"],
  },
  {
    status: "next", tag: "Later", name: "Canopy",
    items: ["Multi-modality", "Model tokenization", "Mainnet + economics"],
  },
];

export function Roadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="container">
        <h2>Roadmap</h2>
        <p className="sub">The thicket grows in stages — from first contracts to a full edge-AI canopy.</p>
        <div className="roadmap">
          {PHASES.map((p) => (
            <div className={`phase ${p.status}`} key={p.name}>
              <span className="tag">{p.tag}</span>
              <h3>{p.name}</h3>
              <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
