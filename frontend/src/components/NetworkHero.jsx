import { useEffect, useRef } from "react";
import { CircuitForest } from "./Logo";

// A living GPU network on white: a big glowing lime compute core surrounded by
// drifting nodes that connect and route packets ("jobs") inward, growing out of
// a circuit-tree thicket at the base. Visual metaphor, not the real topology.
export function NetworkHero() {
  const canvasRef = useRef(null);
  const scroll = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // lime palette tuned for a white background
    const LINE = "125,168,44";
    const NODE = "111,149,38";
    const CORE = "163,206,58";
    const BRIGHT = "150,190,40";

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
      core.x = w * (w < 820 ? 0.5 : 0.7);
      core.y = h * 0.46;
    }

    function init() {
      nodes.length = 0;
      const count = Math.min(150, Math.max(50, Math.floor((w * h) / 11000)));
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h, z: Math.random(),
          vx: (Math.random() - 0.5) * 0.13, vy: (Math.random() - 0.5) * 0.13,
          b: 0, phase: Math.random() * 6.2832,
        });
      }
    }

    function spawnPacket() {
      const from = nodes[(Math.random() * nodes.length) | 0];
      if (!from) return;
      const toCore = Math.random() < 0.6;
      packets.push({ from, to: toCore ? core : nodes[(Math.random() * nodes.length) | 0], t: 0, speed: 0.006 + Math.random() * 0.012, core: toCore });
    }

    function frame() {
      t++;
      const s = scroll.current;
      const activity = 0.06 + Math.min(0.1, s / 4500);
      ctx.clearRect(0, 0, w, h);

      const maxD = 116;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < maxD * maxD) {
            const d = Math.sqrt(d2);
            const op = (1 - d / maxD) * 0.13 * (0.5 + 0.5 * Math.sin(t * 0.015 + i));
            if (op > 0.01) {
              ctx.strokeStyle = `rgba(${LINE},${op})`; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
        }
      }

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy; n.b *= 0.93;
        if (n.x < 0) n.x += w; else if (n.x > w) n.x -= w;
        if (n.y < 0) n.y += h; else if (n.y > h) n.y -= h;
        const tw = 0.28 + 0.2 * Math.sin(t * 0.03 + n.phase);
        const size = (0.7 + n.z * 2) * (1 + n.b * 1.5);
        const op = Math.min(0.9, tw + n.b);
        if (n.b > 0.3) { ctx.shadowColor = `rgba(${CORE},0.9)`; ctx.shadowBlur = 8; }
        ctx.fillStyle = `rgba(${n.b > 0.2 ? BRIGHT : NODE},${op})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, size, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i]; p.t += p.speed;
        const x = p.from.x + (p.to.x - p.from.x) * p.t;
        const y = p.from.y + (p.to.y - p.from.y) * p.t;
        ctx.shadowColor = `rgba(${CORE},1)`; ctx.shadowBlur = 10;
        ctx.fillStyle = `rgba(${BRIGHT},1)`;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
        if (p.t >= 1) { if (p.core) core.pulse = 1; else p.to.b = 1; packets.splice(i, 1); }
      }

      // big dominant core
      core.pulse *= 0.95;
      const baseR = Math.min(w, h) * 0.13;
      const r = baseR * (1 + 0.07 * Math.sin(t * 0.04) + core.pulse * 0.3 + s / 16000);
      const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, r * 3.4);
      g.addColorStop(0, `rgba(${CORE},${0.34 + core.pulse * 0.32})`);
      g.addColorStop(0.34, `rgba(${CORE},0.09)`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(core.x, core.y, r * 3.4, 0, 6.2832); ctx.fill();
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = `rgba(${CORE},${0.22 - k * 0.045})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(core.x, core.y, r * (1 + k * 0.4), 0, 6.2832); ctx.stroke();
      }
      const cg = ctx.createRadialGradient(core.x - r * 0.28, core.y - r * 0.28, 0, core.x, core.y, r);
      cg.addColorStop(0, "rgba(198,230,90,1)");
      cg.addColorStop(0.65, `rgba(${CORE},0.97)`);
      cg.addColorStop(1, `rgba(${NODE},0.7)`);
      ctx.shadowColor = `rgba(${CORE},0.55)`; ctx.shadowBlur = 45;
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(core.x, core.y, r, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;

      if (Math.random() < activity) spawnPacket();
      raf = requestAnimationFrame(frame);
    }

    resize(); init();
    if (reduce) { frame(); cancelAnimationFrame(raf); }
    else raf = requestAnimationFrame(frame);
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
      <CircuitForest />
      <div className="container hero-net-inner">
        <span className="pill"><span className="live" /> Live on Robinhood Chain testnet</span>
        <h1>Grow the network.<br /><span className="accent">Earn from your GPU.</span></h1>
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
