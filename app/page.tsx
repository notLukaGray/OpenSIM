"use client";
// Full-bleed stage at any aspect ratio — no letterboxing, ever (P9-01).
// The old JS-computed 16:9 frame (brief §16) was removed by user decision:
// the stage covers the viewport and crops via object-fit instead.
import { GameProvider } from "@/hooks/useGame";
import GameRoot from "@/components/GameRoot";
import styles from "./page.module.css";

export default function Page() {
  return (
    <GameProvider>
      <main className={styles.shell}>
        <div className={styles.stage}>
          <GameRoot />
        </div>
      </main>
    </GameProvider>
  );
}
