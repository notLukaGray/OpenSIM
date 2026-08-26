"use client";
// Consumer reveal: a content-owned persona comes into focus before the audit explains why.
import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { getAsset } from "@/content/registry";
import { AudioManager } from "@/game/audio/AudioManager";
import { closestArchetype, needWeights, topNeeds } from "@/game/compatibility";
import { GameState, NEED_LABELS } from "@/game/types";
import styles from "./ConsumerReveal.module.css";

const STEPS = 3;

export default function ConsumerReveal({ state, onDone }: { state: GameState; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const weights = needWeights(state);
  const { archetype } = closestArchetype(weights);
  const needs = topNeeds(weights, 4);
  const persona = Object.values(archetype.personas).find((candidate) => candidate.id === state.revealedPersonaId)
    ?? archetype.personas.feminine;
  const personAsset = getAsset(persona.assetId);
  const revealBackground = getAsset("bg-reveal");

  useEffect(() => {
    if (step === 0) void AudioManager.playSfx("heart-beat");
  }, [step]);

  const next = () => setStep((current) => Math.min(STEPS - 1, current + 1));

  return (
    <div className={styles.wrap} onClick={next}>
      <Image className={styles.background} src={revealBackground.src} alt="" fill priority sizes="100vw" />
      <div className={styles.scrim} />

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="silhouette" className={styles.silhouetteStage} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.9, ease: "easeOut" }}>
            <Image className={styles.silhouette} src={personAsset.src} alt="" width={640} height={960} priority />
            <p className={styles.silhouetteCaption}>SOMEONE HAS BEEN TAKING SHAPE</p>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="persona" className={styles.personaStage} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.8, ease: "easeOut" }}>
            <Image className={styles.persona} src={personAsset.src} alt={personAsset.alt ?? `${persona.name}, ${archetype.name}`} width={640} height={960} priority />
            <div className={styles.nameplate}>
              <div className={styles.cardLabel}>YOU WERE PLAYING AS</div>
              <h1>{persona.name.toUpperCase()}, {archetype.name}</h1>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="meaning" className={styles.card} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
            <div className={styles.cardLabel}>WHAT THAT MEANT</div>
            <h2 className={styles.archetypeName}>{archetype.name}</h2>
            <p className={styles.archetypeDescription}>{archetype.description}</p>
            <p className={styles.explanation}>
              You kept circling <strong>{needs.map((need) => NEED_LABELS[need]).join(", ")}</strong>.
              <br />
              That wasn&apos;t taste. That was you.
            </p>
            <button className={styles.cta} onClick={(event) => { event.stopPropagation(); onDone(); }}>
              NOW — WHO WAS RIGHT FOR YOU?
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {step < STEPS - 1 && <div className={styles.clickHint}>CLICK TO CONTINUE</div>}
    </div>
  );
}
