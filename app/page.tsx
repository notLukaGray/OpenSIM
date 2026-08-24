"use client";
// 16:9 letterboxed stage (desktop-first, brief §16).
import { useEffect, useState } from "react";
import { GameProvider } from "@/hooks/useGame";
import GameRoot from "@/components/GameRoot";
import styles from "./page.module.css";

const ASPECT = 16 / 9;

function Stage() {
  const [box, setBox] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const width = Math.min(w, h * ASPECT);
      const height = width / ASPECT;
      setBox({ width, height });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <main className={styles.shell}>
      <div className={styles.stage} style={{ width: box.width, height: box.height }}>
        <GameRoot />
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <GameProvider>
      <Stage />
    </GameProvider>
  );
}
