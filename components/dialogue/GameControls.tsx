"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import styles from "./GameControls.module.css";

const CONTROLS = [
  { id: "log", label: "LOG", icon: "☰" },
  { id: "auto", label: "AUTO", icon: "▶" },
  { id: "skip", label: "SKIP", icon: "⏩" },
  { id: "menu", label: "MENU", icon: "☺" },
] as const;

type ControlId = (typeof CONTROLS)[number]["id"];

export default function GameControls() {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const handleClick = (id: ControlId) => {
    if (id === "auto" || id === "skip") {
      setToggled((prev) => ({ ...prev, [id]: !prev[id] }));
    }
  };

  return (
    <div className={styles.controls}>
      {CONTROLS.map((control, i) => (
        <motion.button
          key={control.id}
          className={`${styles.button} ${toggled[control.id] ? styles.active : ""}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
          whileHover={{ y: -2 }}
          whileTap={{ y: 1, scale: 0.97 }}
          onClick={() => handleClick(control.id)}
        >
          <span className={styles.icon}>{control.icon}</span>
          <span className={styles.label}>{control.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
