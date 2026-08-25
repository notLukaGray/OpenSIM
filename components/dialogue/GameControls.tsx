"use client";
// GameControls: the shared lower-row controls for play and map screens.
import { motion } from "framer-motion";
import styles from "./GameControls.module.css";

export default function GameControls({
  onOpenSettings,
  onOpenArchive,
  onToTitle,
  onToggleDebug,
}: {
  onOpenSettings: () => void;
  onOpenArchive: () => void;
  onToTitle: () => void;
  onToggleDebug?: () => void;
}) {
  const CONTROLS = [
    ...(onToggleDebug ? [{ id: "debug", label: "debug", icon: "⚙" }] : []),
    { id: "archive", label: "archive", icon: "▣" },
    { id: "settings", label: "settings", icon: "♪" },
    { id: "title", label: "home", icon: "☺" },
  ];

  return (
    <div className={styles.controls}>
      {CONTROLS.map((control, i) => (
        <motion.button
          key={control.id}
          className={styles.button}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
          whileHover={{ y: -2 }}
          whileTap={{ y: 1, scale: 0.97 }}
          onClick={(e) => {
            e.stopPropagation();
            if (control.id === "settings") onOpenSettings();
            if (control.id === "archive") onOpenArchive();
            if (control.id === "title") onToTitle();
            if (control.id === "debug") onToggleDebug?.();
          }}
        >
          <span className={styles.icon}>{control.icon}</span>
          <span className={styles.label}>{control.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
