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
import { REVEAL_MIN_ENCOUNTERS } from "@/game/types";

// Session-level marker so each completed encounter's debrief shows exactly once.
const lastDebriefShown = { id: null as string | null };
// The threshold-crossing popup announces itself once per run (P7-01 moment).
const thresholdAnnouncedAt = { count: -1 };

export default function TravelMap() {
  const game = useGame();
  const { state } = game;
  const [hovered, setHovered] = useState<string | null>(null);
  // Debrief for the encounter completed most recently (shown once per arrival).
  const [debriefTree, setDebriefTree] = useState<DateTree | null>(null);
  // Threshold moment (P7-01): crossing REVEAL_MIN_ENCOUNTERS triggers a one-time
  // dramatic popup over the map — the reveal is a bigger deal than a button.
  const [thresholdPopup, setThresholdPopup] = useState(false);

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
    // Threshold moment fires once, the first time the map loads with enough
    // nights banked and the reveal still unseen.
    if (
      state.completedTrees.length >= REVEAL_MIN_ENCOUNTERS &&
      !state.hasSeenReveal &&
      thresholdAnnouncedAt.count < REVEAL_MIN_ENCOUNTERS
    ) {
      thresholdAnnouncedAt.count = state.completedTrees.length;
      void AudioManager.playSfx("heart-beat");
      setThresholdPopup(true);
    }
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

  // Unbranded wilds ("just sleep" / "just the gym") render as their own option.
  const wildsHere = useMemo(
    () => available.filter((t) => getBrandOrNull(t.brandId)?.unbranded),
    [available]
  );

  const byLocation = useMemo(() => {
    const map = new Map<string, DateTree[]>();
    for (const t of available) {
      const brand = getBrandOrNull(t.brandId);
      if (brand?.unbranded) continue; // wilds render separately below
      const key = t.locationId ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [available]);

  const wildByLocation = useMemo(() => {
    const map = new Map<string, DateTree>();
    for (const t of available) {
      const brand = getBrandOrNull(t.brandId);
      if (brand?.unbranded && t.locationId) map.set(t.locationId, t);
    }
    return map;
  }, [available]);

  const allDone = available.length === 0;
  // Standing rule R1: the reveal is reachable in ≤10 minutes — after any two
  // encounters the player may audit themselves early, or keep exploring.
  const canReveal = state.completedTrees.length >= REVEAL_MIN_ENCOUNTERS;
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
                  {wildByLocation.has(loc.id) && (() => {
                    const w = wildByLocation.get(loc.id)!;
                    const brand = getBrandOrNull(w.brandId);
                    return (
                      <button
                        className={`${styles.encounter} ${styles.wild}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void AudioManager.playSfx("sfx-click");
                          game.travelTo(w.id);
                        }}
                      >
                        ✦ {brand?.name} — no brands tonight
                      </button>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      <AnimatePresence>
        {thresholdPopup && (
          <motion.div
            className={styles.thresholdWrap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="the shape of you"
          >
            <motion.div
              className={styles.thresholdCard}
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: [0.85, 1.04, 1], y: [30, 12, 0] }}
              transition={{ duration: 0.9, times: [0, 0.7, 1], ease: "easeOut" }}
            >
              <motion.div
                className={styles.thresholdGlow}
                animate={{ opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
              <div className={styles.thresholdKicker}>[ THREE NIGHTS IN ]</div>
              <h2 className={styles.thresholdTitle}>SOMETHING IS TAKING SHAPE.</h2>
              <p className={styles.thresholdBody}>
                The brands think they&apos;ve been sizing you up.
                <br />
                They&apos;re wrong. The shape getting clearer is yours.
              </p>
              <div className={styles.thresholdActions}>
                <button
                  className={styles.thresholdCta}
                  onClick={(e) => {
                    e.stopPropagation();
                    setThresholdPopup(false);
                    void AudioManager.playSfx("heart-beat");
                    game.setPhase("reveal");
                  }}
                >
                  SEE WHO YOU&apos;VE BEEN
                </button>
                <button
                  className={styles.thresholdSkip}
                  onClick={(e) => {
                    e.stopPropagation();
                    setThresholdPopup(false);
                  }}
                >
                  keep exploring for now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
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
