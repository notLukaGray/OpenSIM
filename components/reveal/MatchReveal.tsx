"use client";
// MatchReveal (P3-03): compatibility against every brand — why it works, where
// the tension is. No product appears perfect (ADR-08).
import { motion } from "framer-motion";
import { getBrandOrNull } from "@/content/registry";
import { BrandMatch, needWeights, rankAllBrands } from "@/game/compatibility";
import { GameState, NEED_LABELS } from "@/game/types";
import { useGame } from "@/hooks/useGame";
import styles from "./MatchReveal.module.css";

export default function MatchReveal({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const game = useGame();
  const weights = needWeights(state);
  const ranked = rankAllBrands(state, weights, { flags: state.flags });
  const dated = ranked.filter((m) => m.dated);
  const top: BrandMatch | undefined = dated[0];
  const neverMet = ranked.filter((m) => !m.dated);

  return (
    <div className={styles.wrap}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
        <div className={styles.kicker}>THE AUDIT</div>
        {top ? (
          <>
            <h1 className={styles.header}>YOUR MATCH</h1>
            <motion.div
              className={styles.matchCard}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
            >
              <div className={styles.matchName} style={{ color: getBrandOrNull(top.brandId)?.color }}>
                {getBrandOrNull(top.brandId)?.name}
              </div>
              <div className={styles.matchScore}>{top.score}%</div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>WHY IT WORKS</div>
                {top.why.length > 0 ? (
                  <ul className={styles.listPlus}>
                    {top.why.map((c) => (
                      <li key={c.need}>+ {NEED_LABELS[c.need]}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.faint}>hard to say — you two barely overlap.</p>
                )}
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>THE TENSION</div>
                {top.tension.length > 0 ? (
                  <ul className={styles.listMinus}>
                    {top.tension.map((c) => (
                      <li key={c.need}>− {NEED_LABELS[c.need]}</li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.faint}>none found — which should make you suspicious.</p>
                )}
              </div>
            </motion.div>

            {dated.length > 1 && (
              <motion.div
                className={styles.runners}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
              >
                {dated.slice(1).map((m) => (
                  <div key={m.brandId} className={styles.runner}>
                    <span style={{ color: getBrandOrNull(m.brandId)?.color }}>{getBrandOrNull(m.brandId)?.name}</span>
                    <span className={styles.runnerScore}>{m.score}%</span>
                  </div>
                ))}
              </motion.div>
            )}
          </>
        ) : (
          <p className={styles.faint}>You never stayed long enough with anyone to find out.</p>
        )}

        {neverMet.length > 0 && (
          <p className={styles.neverMet}>never met: {neverMet.map((m) => getBrandOrNull(m.brandId)?.name).join(" · ")}</p>
        )}

        <div className={styles.actions}>
          {/* Standing rule R2: the audit is a lens, not a wall — keep playing. */}
          <button className={styles.explore} onClick={() => game.setPhase("map")}>
            KEEP EXPLORING
          </button>
          <button className={styles.restart} onClick={onRestart}>
            START OVER
          </button>
        </div>
      </motion.div>
    </div>
  );
}
