"use client";
import { motion, Variants } from "framer-motion";
import type { Choice } from "@/content/schema";
import styles from "./ChoiceList.module.css";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 26 } },
};

export default function ChoiceList({
  choices,
  selectedId,
  onSelect,
}: {
  choices: Choice[];
  selectedId: string | null;
  onSelect: (choice: Choice) => void;
}) {
  return (
    <motion.div className={styles.list} variants={container} initial="hidden" animate="show">
      {choices.map((choice) => (
        <motion.button
          key={choice.id}
          className={`${styles.choice} ${selectedId === choice.id ? styles.selected : ""}`}
          variants={item}
          whileHover={{ y: -3, filter: "brightness(1.05)" }}
          whileTap={{ y: -1 }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(choice);
          }}
        >
          <span className={styles.bullet}>♡</span>
          <span>{choice.text}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}
