// Icon glyphs (lime, inline) for the feature cards.
function Ic({ d }) {
  return (
    <span className="ic">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {d}
      </svg>
    </span>
  );
}

const WHY = [
  {
    icon: <><path d="M12 3l7 4v5c0 4-3 7-7 8-4-1-7-4-7-8V7l7-4z" /><path d="M9 12l2 2 4-4" /></>,
    title: "Verifiable by design",
    body: "Nodes prove real work through periodic inference challenges. Wrong answers void earnings; repeated failures slash the operator's bond.",
  },
  {
    icon: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>,
    title: "Permissionless",
    body: "No whitelist, no signup. Bond THKT and your GPU joins the network — anyone, anywhere, from a laptop to a rack.",
  },
  {
    icon: <><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2.4" /></>,
    title: "Settled on-chain",
    body: "Rewards accrue per verified minute and settle to a Merkle root each epoch. Staking, slashing, and claims all run on Robinhood Chain.",
  },
];

const CAPS = [
  {
    icon: <><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" /></>,
    title: "Inference & fine-tuning",
    body: "The network is built to run AI inference and fine-tuning tasks distributed across a global pool of edge GPUs.",
  },
  {
    icon: <><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="8" y="14" width="8" height="6" rx="1.5" /></>,
    title: "Multi-modality",
    body: "Text and image today, with music and video on the roadmap as the model runtime expands.",
  },
  {
    icon: <><path d="M5 20V10M12 20V4M19 20v-7" /><circle cx="5" cy="7" r="1.6" /><circle cx="12" cy="2.4" r="1.6" /><circle cx="19" cy="10.4" r="1.6" /></>,
    title: "Edge-powered",
    body: "Compute grows from home and pro GPUs at the edge — not a handful of centralized data centers.",
  },
];

function Grid({ title, sub, items, mist }) {
  return (
    <section className={`section${mist ? " mist" : ""}`}>
      <div className="container">
        <h2>{title}</h2>
        <p className="sub">{sub}</p>
        <div className="features">
          {items.map((f) => (
            <div className="feature" key={f.title}>
              <Ic d={f.icon} />
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhyThicket() {
  return <Grid title="Why Thicket" sub="A hybrid network that rewards uptime, but only pays for verified compute." items={WHY} />;
}

export function Capabilities() {
  return <Grid title="Production AI, on the edge" sub="One network for the compute-heavy work modern AI needs." items={CAPS} mist />;
}
