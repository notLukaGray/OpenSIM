"use client";

import { motion } from "framer-motion";
import styles from "./SpeakerTab.module.css";

export default function SpeakerTab({ name }: { name: string }) {
  return (
    <motion.div
      className={`${styles.tab} ${name === "COUNSEL" ? styles.counsel : ""}`}
      initial={{ opacity: 0, scale: 0.7, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.12 }}
    >
      <span className={styles.icon}>♡</span>
      <span className={styles.name}>{name}</span>
      <span className={styles.sparkle}>✦</span>
    </motion.div>
  );
}
