"use client";
// ArchivePanel (P6-03): review every met brand and the marketing materials
// you've surfaced. For the marketing friends.
import { useMemo } from "react";
import { getBrandOrNull, getEvidence } from "@/content/registry";
import { useGame } from "@/hooks/useGame";
import styles from "./ArchivePanel.module.css";

export default function ArchivePanel({ onClose }: { onClose: () => void }) {
  const { state } = useGame();

  const entries = useMemo(
    () =>
      state.dated
        .map((brandId) => {
          const brand = getBrandOrNull(brandId);
          const cards = state.unlockedEvidence
            .map((id) => {
              try {
                return getEvidence(id);
              } catch {
                return null;
              }
            })
            .filter((e) => e && e.brandId === brandId);
          return { brand, cards };
        })
        .filter((e) => e.brand),
    [state.dated, state.unlockedEvidence]
  );

  return (
    <div className={styles.wrap} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>THE ARCHIVE</span>
          <button className={styles.close} onClick={onClose}>×</button>
        </div>
        <div className={styles.body}>
          {entries.length === 0 && (
            <div className={styles.empty}>Date a brand first — materials surface as you go.</div>
          )}
          {entries.map(({ brand, cards }) => (
            <section key={brand!.id} className={styles.section}>
              <h3 style={{ color: brand!.color }}>{brand!.name}</h3>
              {cards.length === 0 ? (
                <div className={styles.emptySmall}>no materials surfaced yet</div>
              ) : (
                cards.map((c) => (
                  <div key={c!.id} className={styles.card}>
                    <span className={styles.type}>{c!.type}</span>
                    <strong>{c!.title}</strong>
                    <p>{c!.description}</p>
                  </div>
                ))
              )}
            </section>
          ))}
          {state.dated.length > 0 && entries.every((e) => e.cards.length === 0) && (
            <div className={styles.empty}>No materials surfaced yet — keep dating.</div>
          )}
        </div>
      </div>
    </div>
  );
}
