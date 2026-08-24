"use client";
// StartCinematic (P9): drifting heart-light particles over the title backdrop.
// The procedural sky/skyline was replaced by the Figma title art (title-screen
// asset); only the particle layer remains. If /assets/video/intro.mp4 is ever
// dropped in, TitleScreen swaps both out for real footage. Respects
// prefers-reduced-motion.
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

    let raf = 0;
    let t = 0;
    const draw = () => {
      t += reduced ? 0 : 1 / 60;

      // drifting heart-light particles
      ctx.clearRect(0, 0, w, h);
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
