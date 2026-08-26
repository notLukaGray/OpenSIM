"use client";
import styles from "./LoadingOverlay.module.css";

export default function LoadingOverlay({ label = "loading" }: { label?: string }) {
  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label={label}>
      <div className={styles.box}>
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}
