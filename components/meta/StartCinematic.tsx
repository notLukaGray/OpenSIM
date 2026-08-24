"use client";
// StartCinematic (P9): procedural attract-mode animation for the title screen.
// If /assets/video/intro.mp4 is ever dropped in, TitleScreen swaps this for
// real footage (ADR-13-style convention). Respects prefers-reduced-motion.
import { useEffect, useRef } from "react";
import styles from "./StartCinematic.module.css";

const PALETTE = ["#8ecbff", "#ff8dce", "#edff4c", "#8ced73", "#c9a7eb", "#f0a35e", "#f2b8c6"];

type Particle = { x: number; y: number; r: number; vy: number; sway: number; phase: number; color: string; alpha: number };

export default function StartCinematic() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = (canvas.width = canvas.offsetWidth * devicePixelRatio);
    let h = (canvas.height = canvas.offsetHeight * devicePixelRatio);
    const onResize = () => {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * devicePixelRatio;
    };
    window.addEventListener("resize", onResize);

    // deterministic composition
    let s = 42;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const particles: Particle[] = Array.from({ length: 70 }, () => ({
      x: rnd() * w,
      y: rnd() * h,
      r: (1.5 + rnd() * 4) * devicePixelRatio,
      vy: (6 + rnd() * 16) * devicePixelRatio,
      sway: 20 + rnd() * 50,
      phase: rnd() * Math.PI * 2,
      color: PALETTE[Math.floor(rnd() * PALETTE.length)],
      alpha: 0.25 + rnd() * 0.5,
    }));

    const skylines = [0.82, 0.7, 0.58].map((base, li) =>
      Array.from({ length: 26 }, (_, i) => {
        const bw = w / 18;
        return { x: i * bw + li * bw * 0.35, w: bw * (0.55 + ((i * 7 + li * 13) % 10) / 22), h: h * base * (0.12 + (((i * 11 + li * 5) % 17) / 40)) };
      })
    );

    let raf = 0;
    let t = 0;
    const draw = () => {
      t += reduced ? 0 : 1 / 60;
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#0b0e17");
      sky.addColorStop(0.65, "#131a30");
      sky.addColorStop(1, "#0b0e17");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // moon glow
      const mg = ctx.createRadialGradient(w * 0.72, h * 0.24, 0, w * 0.72, h * 0.24, h * 0.3);
      mg.addColorStop(0, "rgba(242,184,198,0.20)");
      mg.addColorStop(1, "rgba(242,184,198,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(0, 0, w, h);

      // parallax skylines with lit windows
      const winPeriod = reduced ? Infinity : 2.2;
      skylines.forEach((layer, li) => {
        ctx.fillStyle = ["#11162a", "#151c33", "#1a2240"][li];
        for (const b of layer) {
          const y = h - b.h - li * h * 0.04;
          ctx.fillRect(b.x - li * 14 * devicePixelRatio * Math.sin(t * 0.05 + li), y, b.w, b.h + li * h * 0.04);
          if (((i => (i * 13 + li * 29) % 7)(b.x | 0)) < 3 && !reduced) {
            const flicker = (Math.sin(t * winPeriod + b.x) + 1) / 2;
            ctx.fillStyle = `rgba(242,216,150,${0.05 + flicker * 0.08})`;
            ctx.fillRect(b.x - li * 14 * devicePixelRatio * Math.sin(t * 0.05 + li), y + b.w * 0.4, b.w, b.h);
            ctx.fillStyle = ["#11162a", "#151c33", "#1a2240"][li];
          }
        }
      });

      // drifting heart-light particles
      for (const p of particles) {
        p.y -= p.vy / 60;
        if (p.y < -10) p.y = h + 10;
        const px = p.x + Math.sin(t * 0.6 + p.phase) * p.sway * devicePixelRatio;
        ctx.globalAlpha = p.alpha * (0.7 + 0.3 * Math.sin(t * 1.3 + p.phase));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // heartbeat glow (matches mus loops' calm pulse)
      const beat = 0.5 + 0.5 * Math.sin(t * (Math.PI * 2) / 3.2);
      ctx.fillStyle = `rgba(242,184,198,${0.03 + beat * 0.04})`;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className={styles.canvas} aria-hidden />;
}
