// Circuit-tree mark — echoes the Thicket logo (traces branching upward).
export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="14" r="12" stroke="var(--accent)" strokeWidth="1.4" opacity="0.35" />
      <g stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M16 27V9" />
        <path d="M16 14l-4-3M12 11v-2" />
        <path d="M16 17l4-3M20 14v-2" />
        <path d="M16 20l-3-2M13 18v-2" />
      </g>
      <g fill="var(--accent)">
        <circle cx="16" cy="8.5" r="1.6" />
        <circle cx="12" cy="8.5" r="1.3" />
        <circle cx="20" cy="11.5" r="1.3" />
        <circle cx="13" cy="15.5" r="1.3" />
      </g>
    </svg>
  );
}

// Decorative "growing thicket" — sparse-to-dense circuit trees, like the banner.
export function HeroArt() {
  const trees = Array.from({ length: 9 });
  return (
    <svg viewBox="0 0 360 240" fill="none" className="hero-art" style={{ width: "100%" }} aria-hidden="true">
      {trees.map((_, i) => {
        const x = 20 + i * 40;
        const h = 60 + i * 16; // grows taller left -> right
        const op = 0.35 + i * 0.07;
        const branches = 2 + Math.min(i, 5);
        return (
          <g key={i} stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" opacity={op}>
            <path d={`M${x} 230 V${230 - h}`} />
            {Array.from({ length: branches }).map((__, b) => {
              const by = 230 - h + 10 + b * (h / (branches + 1));
              const dir = b % 2 === 0 ? -1 : 1;
              return (
                <g key={b}>
                  <path d={`M${x} ${by} l${dir * 9} -7`} />
                  <circle cx={x + dir * 11} cy={by - 8} r="2" fill="var(--accent)" stroke="none" />
                </g>
              );
            })}
            <circle cx={x} cy={230 - h} r="2.4" fill="var(--accent)" stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}
