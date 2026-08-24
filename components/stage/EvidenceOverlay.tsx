"use client";
// EvidenceOverlay (P2-03): the [MEMORY UNLOCKED] beat — real brand material
// surfacing inside the date, never a slide.
import Image from "next/image";
import { motion } from "framer-motion";
import { getAsset, getEvidence } from "@/content/registry";
import styles from "./EvidenceOverlay.module.css";

export default function EvidenceOverlay({ evidenceId, onDismiss }: { evidenceId: string; onDismiss: () => void }) {
  const ev = getEvidence(evidenceId);
  const img = ev.imageRef ? getAsset(ev.imageRef) : null;
  return (
    <motion.div
      className={styles.veil}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
      role="button"
      aria-label="dismiss memory"
    >
      <motion.div
        className={styles.card}
        initial={{ scale: 0.86, y: 30, rotate: -1.5 }}
        animate={{ scale: 1, y: 0, rotate: 0 }}
        exit={{ scale: 0.92, y: -20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
      >
        <div className={styles.stamp}>[ MEMORY UNLOCKED ]</div>
        {img ? (
          <div className={styles.imageWrap}>
            <Image src={img.src} alt={img.alt ?? ev.title} width={640} height={400} className={styles.image} />
          </div>
        ) : (
          <div className={styles.typoFrame}>
            <span className={styles.typeBadge}>{ev.type.toUpperCase()}</span>
            <div className={styles.typoQuote}>{ev.title}</div>
          </div>
        )}
        <h3 className={styles.title}>{ev.title}</h3>
        <p className={styles.description}>{ev.description}</p>
        <div className={styles.hint}>[ YOU&apos;VE SEEN THIS BEFORE... ]</div>
      </motion.div>
    </motion.div>
  );
}
