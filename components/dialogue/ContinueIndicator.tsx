"use client";

import { motion } from "framer-motion";
import styles from "./ContinueIndicator.module.css";

export default function ContinueIndicator() {
  return (
    <motion.div
      className={styles.indicator}
      animate={{ y: [0, 5, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className={styles.heart}>♥</span>
    </motion.div>
  );
}
