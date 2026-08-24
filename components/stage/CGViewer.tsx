"use client";
// CGViewer (P2-03): a full-screen moment inside a date. Click to return.
import Image from "next/image";
import { motion } from "framer-motion";
import { getAsset } from "@/content/registry";
import styles from "./CGViewer.module.css";

export default function CGViewer({ cgId, onDismiss }: { cgId: string; onDismiss: () => void }) {
  const cg = getAsset(cgId);
  return (
    <motion.div
      className={styles.wrap}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      onClick={onDismiss}
      role="button"
      aria-label="dismiss scene"
    >
      <Image src={cg.src} alt={cg.alt ?? ""} fill className={styles.image} priority />
      <div className={styles.hint}>click to continue</div>
    </motion.div>
  );
}
