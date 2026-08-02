// Circuit-tree mark — echoes the Thicket logo (traces branching upward).
export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="14" r="12.5" stroke="var(--accent)" strokeWidth="1.3" opacity="0.4" />
      <g stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round">
        <path d="M16 27V8" />
        <path d="M16 13l-4-3M12 10V8" />
        <path d="M16 16l4-3M20 13v-2" />
        <path d="M16 19l-3-2M13 17v-1.5" />
      </g>
      <g fill="var(--accent)">
        <circle cx="16" cy="7.5" r="1.7" />
        <circle cx="12" cy="7.5" r="1.3" />
        <circle cx="20" cy="10.7" r="1.3" />
        <circle cx="13" cy="15" r="1.2" />
      </g>
    </svg>
  );
}

// Full-width circuit "forest" that grows sparse -> dense, left -> right —
// a direct nod to the banner. Rendered lime-on-transparent so the white/mist
// hero shows through. Deterministic layout (no randomness) so it's stable.
export function CircuitForest() {
  const W = 1200, H = 300, BASE = H;
  const cols = 26;
  const trees = [];
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1);           // 0..1 left->right
    const x = 24 + t * (W - 48);
    const h = 70 + t * t * 190;          // taller toward the right
    const branches = 2 + Math.round(t * 6);
    const op = 0.28 + t * 0.5;           // denser/darker green toward the right
    const stroke = i % 3 === 0 ? "var(--lime-yellow)" : "var(--lime)";
    const parts = [];
    parts.push(<path key="trunk" d={`M${x} ${BASE} V${BASE - h}`} />);
    for (let b = 0; b < branches; b++) {
      const by = BASE - h + 12 + b * ((h - 18) / (branches + 0.5));
      const dir = b % 2 === 0 ? -1 : 1;
      const len = 8 + (b % 3) * 4;
      parts.push(<path key={`b${b}`} d={`M${x} ${by} l${dir * len} -${len - 2}`} />);
      parts.push(<circle key={`n${b}`} cx={x + dir * (len + 2)} cy={by - (len - 2)} r="2.4" fill={stroke} stroke="none" />);
    }
    parts.push(<circle key="tip" cx={x} cy={BASE - h} r="2.8" fill={stroke} stroke="none" />);
    trees.push(
      <g key={i} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity={op}>
        {parts}
      </g>
    );
  }
  return (
    <svg className="hero-forest" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" fill="none" aria-hidden="true">
      {trees}
    </svg>
  );
}
