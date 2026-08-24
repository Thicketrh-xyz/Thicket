import { useEffect, useRef } from "react";

// A living GPU network: a glowing compute core surrounded by drifting nodes that
// connect, pulse, and route packets ("jobs") inward. A visual metaphor, not the
// real topology. Canvas 2D, requestAnimationFrame, respects reduced-motion.
export function NetworkHero() {
  const canvasRef = useRef(null);
  const scroll = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const LIME = "183,214,55";
    const BRIGHT = "205,232,90";

    let raf, w, h, dpr, t = 0;
    const nodes = [];
    const packets = [];
    const core = { x: 0, y: 0, pulse: 0 };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      core.x = w * (w < 760 ? 0.5 : 0.68);
      core.y = h * (w < 760 ? 0.42 : 0.5);
    }

    function init() {
      nodes.length = 0;
      const count = Math.min(180, Math.max(60, Math.floor((w * h) / 8500)));
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          z: Math.random(),
          vx: (Math.random() - 0.5) * 0.14,
          vy: (Math.random() - 0.5) * 0.14,
          b: 0, phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function spawnPacket() {
      const from = nodes[(Math.random() * nodes.length) | 0];
      if (!from) return;
      const toCore = Math.random() < 0.55;
      const to = toCore ? core : nodes[(Math.random() * nodes.length) | 0];
      packets.push({ from, to, t: 0, speed: 0.006 + Math.random() * 0.012, core: toCore });
    }

    function frame() {
      t++;
      const s = scroll.current;
      const activity = 0.06 + Math.min(0.12, s / 4000); // network "activates" as you scroll

      // motion trails
      ctx.fillStyle = "rgba(9, 14, 7, 0.30)";
      ctx.fillRect(0, 0, w, h);

      // connections
      const maxD = 118;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxD * maxD) {
            const d = Math.sqrt(d2);
            const op = (1 - d / maxD) * 0.16 * (0.5 + 0.5 * Math.sin(t * 0.015 + i));
            if (op > 0.012) {
              ctx.strokeStyle = `rgba(${LIME},${op})`;
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
        }
      }

      // nodes
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy; n.b *= 0.94;
        if (n.x < 0) n.x += w; else if (n.x > w) n.x -= w;
        if (n.y < 0) n.y += h; else if (n.y > h) n.y -= h;
        const twinkle = 0.3 + 0.22 * Math.sin(t * 0.03 + n.phase);
        const size = (0.6 + n.z * 1.9) * (1 + n.b * 1.6);
        const op = Math.min(1, twinkle + n.b);
        if (n.b > 0.3) { ctx.shadowColor = `rgba(${BRIGHT},0.9)`; ctx.shadowBlur = 9; }
        ctx.fillStyle = `rgba(${n.b > 0.2 ? BRIGHT : LIME},${op})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, size, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += p.speed;
        const x = p.from.x + (p.to.x - p.from.x) * p.t;
        const y = p.from.y + (p.to.y - p.from.y) * p.t;
        ctx.shadowColor = `rgba(${BRIGHT},1)`; ctx.shadowBlur = 10;
        ctx.fillStyle = `rgba(${BRIGHT},0.95)`;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
        if (p.t >= 1) { if (p.core) core.pulse = 1; else p.to.b = 1; packets.splice(i, 1); }
      }

      // core
      core.pulse *= 0.95;
      const baseR = Math.min(w, h) * 0.055;
      const r = baseR * (1 + 0.12 * Math.sin(t * 0.04) + core.pulse * 0.45 + s / 12000);
      const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, r * 4.5);
      g.addColorStop(0, `rgba(${BRIGHT},${0.45 + core.pulse * 0.4})`);
      g.addColorStop(0.28, `rgba(${LIME},0.16)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(core.x, core.y, r * 4.5, 0, 6.2832); ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = `rgba(${BRIGHT},${0.24 - k * 0.06})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(core.x, core.y, r * (1 + k * 0.55), 0, 6.2832); ctx.stroke();
      }
      const cg = ctx.createRadialGradient(core.x - r * 0.3, core.y - r * 0.3, 0, core.x, core.y, r);
      cg.addColorStop(0, `rgba(${BRIGHT},1)`);
      cg.addColorStop(1, `rgba(${LIME},0.55)`);
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(core.x, core.y, r, 0, 6.2832); ctx.fill();

      if (Math.random() < activity) spawnPacket();
      raf = requestAnimationFrame(frame);
    }

    resize(); init();
    if (reduce) {
      for (let i = 0; i < 120; i++) { t++; }
      frame(); cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(frame);
    }
    const onResize = () => { resize(); init(); };
    const onScroll = () => { scroll.current = window.scrollY; };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section className="hero-net">
      <canvas ref={canvasRef} className="hero-net-canvas" aria-hidden="true" />
      <div className="container hero-net-inner">
        <span className="pill"><span className="live" /> Live on Robinhood Chain testnet</span>
        <h1>The GPU network,<br /><span className="accent">alive.</span></h1>
        <p className="lead">
          Thousands of edge GPUs, one network. Run a node, contribute AI compute,
          and earn THKT for every verified minute online.
        </p>
        <div className="hero-cta">
          <a className="btn" href="/app">Launch app →</a>
          <a className="btn ghost" href="/docs">Read the docs</a>
        </div>
      </div>
    </section>
  );
}
