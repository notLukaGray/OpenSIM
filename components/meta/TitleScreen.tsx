"use client";
// TitleScreen (P3-01/P9): cinematic attract layer + NEW GAME / CONTINUE / RESET,
// menu music, settings. If /assets/video/intro.mp4 exists it replaces the
// procedural cinematic (P9 convention).
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAsset } from "@/content/registry";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import StartCinematic from "./StartCinematic";
import SettingsPanel from "./SettingsPanel";
import styles from "./TitleScreen.module.css";

export default function TitleScreen() {
  const game = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const logo = getAsset("logo-dsim");
  const hero = getAsset("title-screen");
  const map = getAsset("map-location");

  useEffect(() => {
    void AudioManager.playMusic("mus-title");
    // The map is the first large visual requested after the title. Begin its
    // fetch alongside the title track so the map screen can render from cache.
    const mapPreload = new window.Image();
    mapPreload.src = map.src;
    setHasSave(game.hasSave());
    // P9 video convention: real footage overrides the procedural cinematic.
    fetch("/assets/video/intro.mp4", { method: "HEAD" })
      .then((r) => setHasVideo(r.ok))
      .catch(() => setHasVideo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.wrap}>
      {hasVideo ? (
        <video autoPlay muted loop playsInline src="/assets/video/intro.mp4" className={styles.video} />
      ) : (
        <>
          {/* P9 interim: Figma title art stands in until intro.mp4 exists;
              StartCinematic keeps only its drifting particles above it. */}
          <img src={hero.src} alt={hero.alt} className={styles.bg} />
          <StartCinematic />
        </>
      )}

      <motion.div className={styles.menu} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt="Love, Loyalty & Brand Preference" className={styles.logo} />

        {confirmNew ? (
          <div className={styles.confirm}>
            <div>overwrite your current run?</div>
            <button
              className={`${styles.button} ${styles.danger}`}
              onClick={() => {
                game.resetAll();
                game.newGame();
              }}
            >
              YES — START OVER
            </button>
            <button className={styles.button} onClick={() => setConfirmNew(false)}>
              KEEP MY RUN
            </button>
          </div>
        ) : (
          <>
            <button
              className={styles.button}
              onClick={() => (hasSave ? setConfirmNew(true) : game.newGame())}
            >
              NEW GAME
            </button>
            <button
              className={`${styles.button} ${hasSave ? "" : styles.disabled}`}
              disabled={!hasSave}
              onClick={() => {
                if (!game.continueGame()) setHasSave(false);
              }}
            >
              CONTINUE
            </button>
            <button
              className={`${styles.button} ${hasSave ? "" : styles.disabled}`}
              disabled={!hasSave}
              onClick={() => {
                game.resetAll();
                setHasSave(false);
              }}
            >
              RESET
            </button>
          </>
        )}

        <button className={styles.settingsLink} onClick={() => setSettingsOpen(true)}>
          ♪ settings
        </button>
      </motion.div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
