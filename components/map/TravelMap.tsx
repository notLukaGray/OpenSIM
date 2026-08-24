"use client";
// TravelMap (P5-02): the world is where context lives. Locations are nodes;
// encounters are (brand × location) pairs; the map updates live as you complete them.
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dateTreeList, getAsset, getBrandOrNull, getTree, locations } from "@/content/registry";
import type { DateTree } from "@/content/schema";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import DateDebrief from "./DateDebrief";
import styles from "./TravelMap.module.css";

// Session-level marker so each completed encounter's debrief shows exactly once.
const lastDebriefShown = { id: null as string | null };

export default function TravelMap() {
  const game = useGame();
  const { state } = game;
  const [hovered, setHovered] = useState<string | null>(null);
  // Debrief for the encounter completed most recently (shown once per arrival).
  const [debriefTree, setDebriefTree] = useState<DateTree | null>(null);

  useEffect(() => {
    const done = state.completedTrees;
    const newest = done.length > 0 ? done[done.length - 1] : null;
    if (newest && newest !== lastDebriefShown.id) {
      try {
        setDebriefTree(getTree(newest));
        lastDebriefShown.id = newest;
      } catch {
        /* tree vanished from registry — skip debrief */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void AudioManager.playMusic("mus-hub");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") game.toTitle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = useMemo(
    () => dateTreeList.filter((t) => !state.completedTrees.includes(t.id)),
    [state.completedTrees]
  );

  const byLocation = useMemo(() => {
    const map = new Map<string, DateTree[]>();
    for (const t of available) {
      const key = t.locationId ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [available]);

  const allDone = available.length === 0;
  // Standing rule R1: the reveal is reachable in ≤10 minutes — after any two
  // encounters the player may audit themselves early, or keep exploring.
  const canReveal = state.completedTrees.length >= 2;
  const bg = getAsset("bg-hub");

  return (
    <div className={styles.wrap}>
      <Image src={bg.src} alt="" fill priority draggable={false} className={styles.backdrop} />
      <div className={styles.dim} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
        <h1 className={styles.heading}>WHERE TO TONIGHT?</h1>
        <div className={styles.subheading}>the same product means something different in every place</div>
      </motion.div>

      {locations.map((loc, i) => {
        const here = byLocation.get(loc.id) ?? [];
        const active = here.length > 0;
        const showBlurb = hovered === loc.id || active;
        return (
          <motion.div
            key={loc.id}
            className={`${styles.node} ${active ? styles.active : styles.quiet}`}
            style={{ left: `${loc.map.x}%`, top: `${loc.map.y}%` }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 240, damping: 20 }}
            onMouseEnter={() => setHovered(loc.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className={styles.pin}>{active ? "♥" : "·"}</div>
            <AnimatePresence>
              {(showBlurb || active) && (
                <motion.div
                  className={styles.card}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={styles.locName}>{loc.name}</div>
                  {here.length > 0 ? (
                    <>
                      <div className={styles.blurb}>{loc.blurb}</div>
                      {here.map((t) => {
                        const brand = getBrandOrNull(t.brandId);
                        return (
                          <button
                            key={t.id}
                            className={styles.encounter}
                            onClick={(e) => {
                              e.stopPropagation();
                              void AudioManager.playSfx("sfx-click");
                              game.travelTo(t.id);
                            }}
                          >
                            <span className={styles.sigil} style={{ color: brand?.color }}>
                              {brand?.sigil}
                            </span>
                            {brand?.name} — {t.title}
                          </button>
                        );
                      })}
                    </>
                  ) : (
                    <div className={styles.quietLabel}>no one here tonight</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      <AnimatePresence>
        {debriefTree && (
          <DateDebrief tree={debriefTree} state={state} onDismiss={() => setDebriefTree(null)} />
        )}
      </AnimatePresence>

      {(canReveal || allDone) && (
        <motion.div
          className={styles.allDone}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <p>
            {allDone
              ? "That's everyone. Time to think about what all this meant."
              : state.hasSeenReveal
                ? "The audit updates with everything you learn."
                : "Enough to start seeing the shape of you — or keep exploring."}
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            {state.hasSeenReveal && (
              <button className={styles.thinkItOver} onClick={() => game.setPhase("match")}>
                RE-AUDIT ME
              </button>
            )}
            <button className={styles.thinkItOver} onClick={() => game.setPhase("reveal")}>
              {allDone ? "THINK IT OVER" : state.hasSeenReveal ? "RE-SEE THE REVEAL" : "SEE WHO YOU'VE BEEN"}
            </button>
          </div>
        </motion.div>
      )}

      <div className={styles.controlsHint}>esc · title</div>
    </div>
  );
}
