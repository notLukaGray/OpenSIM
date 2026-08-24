"use client";
// DateDebrief (P6-02): the receipt of an encounter — what your choices revealed,
// how perception shifted, where chemistry moved. The lesson lands per-date.
import { motion } from "framer-motion";
import { summarizeDate } from "@/game/debrief";
import { GameState, NEED_LABELS } from "@/game/types";
import styles from "./DateDebrief.module.css";

export default function DateDebrief({ tree, state, onDismiss }: { tree: import("@/content/schema").DateTree; state: GameState; onDismiss: () => void }) {
  const d = summarizeDate(tree, state);
  return (
    <motion.div
      className={styles.wrap}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
      role="button"
      aria-label="dismiss debrief"
    >
      <motion.div
        className={styles.card}
        initial={{ scale: 0.9, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <div className={styles.kicker}>AFTERGLOW</div>
        <h2 className={styles.title}>{d.treeTitle}</h2>
        {d.needDeltas.length > 0 && (
          <>
            <div className={styles.sectionLabel}>YOUR CHOICES REVEALED</div>
            <div className={styles.chips}>
              {d.needDeltas.map(({ need, delta }) => (
                <span key={need} className={`${styles.chip} ${delta > 0 ? styles.up : styles.down}`}>
                  {NEED_LABELS[need]} {delta > 0 ? "+" : ""}{delta}
                </span>
              ))}
            </div>
          </>
        )}
        {d.perception.length > 0 && (
          <>
            <div className={styles.sectionLabel}>PERCEPTION SHIFTED</div>
            {d.perception.map((p) => (
              <div key={p.label} className={styles.row}>
                <strong style={{ color: d.brandColor }}>{p.label}</strong> — {p.text}
              </div>
            ))}
          </>
        )}
        {d.chemistry.some((c) => c.delta !== 0) && (
          <div className={styles.chemRow}>chemistry {d.chemistry.filter((c) => c.delta !== 0).map((c) => `${c.delta > 0 ? "+" : ""}${c.delta}`).join(", ")}</div>
        )}
        <button className={styles.done} onClick={(e) => { e.stopPropagation(); onDismiss(); }}>
          back to the map
        </button>
      </motion.div>
    </motion.div>
  );
}
