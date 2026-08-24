"use client";
// ConsumerReveal (P3-02): the game stops pretending you were judging brands.
import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { getAsset } from "@/content/registry";
import { AudioManager } from "@/game/audio/AudioManager";
import { closestArchetype, needWeights, topNeeds } from "@/game/compatibility";
import { GameState, NEED_LABELS, Need } from "@/game/types";
import styles from "./ConsumerReveal.module.css";

const STEPS = 5;

export default function ConsumerReveal({ state, onDone }: { state: GameState; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const weights = needWeights(state);
  const { archetype } = closestArchetype(weights);
  const needs = topNeeds(weights, 4);
  const silhouette = getAsset("reveal-silhouette");

  useEffect(() => {
    if (step === 1) void AudioManager.playSfx("heart-beat");
  }, [step]);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));

  return (
    <div className={styles.wrap} onClick={next}>
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.h1
            key="who"
            className={styles.question}
            initial={{ opacity: 0, letterSpacing: "0.2em" }}
            animate={{ opacity: 1, letterSpacing: "0.5em" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          >
            WHO HAVE YOU BEEN PLAYING?
          </motion.h1>
        )}

        {step === 1 && (
          <motion.div key="silhouette" className={styles.silhouette} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.06 }} transition={{ duration: 1.2 }}>
            <Image src={silhouette.src} alt="" width={720} height={405} priority />
            <div className={styles.silhouetteCaption}>someone was forming this whole time</div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="archetype" className={styles.card} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.9 }}>
            <div className={styles.cardLabel}>THE CONSUMER YOU WERE</div>
            <h2 className={styles.archetypeName}>{archetype.name}</h2>
            <p className={styles.archetypeDescription}>{archetype.description}</p>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="needs" className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={styles.cardLabel}>WHAT YOU KEPT REACHING FOR</div>
            <div className={styles.bars}>
              {needs.map((n: Need, i) => (
                <div key={n} className={styles.barRow}>
                  <span className={styles.barLabel}>{NEED_LABELS[n]}</span>
                  <div className={styles.barTrack}>
                    <motion.div
                      className={styles.barFill}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(8, weights[n] * 100)}%` }}
                      transition={{ delay: 0.15 + i * 0.18, duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div key="explain" className={styles.card} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className={styles.explanation}>
              Every choice you made was an answer about yourself.
              <br />
              You kept circling <strong>{needs.map((n) => NEED_LABELS[n]).join(", ")}</strong>.
              <br />
              That wasn&apos;t taste. That was you.
            </p>
            <button
              className={styles.cta}
              onClick={(e) => {
                e.stopPropagation();
                onDone();
              }}
            >
              NOW — WHO WAS RIGHT FOR YOU?
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {step > 0 && step < STEPS - 1 && <div className={styles.clickHint}>click</div>}
    </div>
  );
}
