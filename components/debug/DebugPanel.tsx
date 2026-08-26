"use client";
// DebugPanel (P3-04): dev-only x-ray. Never ships to production (ADR-11).
import { useMemo, useState } from "react";
import { archetypes, dateTreeList, getBrand, getTree } from "@/content/registry";
import { AudioManager } from "@/game/audio/AudioManager";
import {
  BrandMatch,
  effectiveProfile,
  needWeights,
  rankAllBrands,
} from "@/game/compatibility";
import { activeModifiers } from "@/game/modifiers";
import { GameState, NEED_LABELS, Need, needs, zeroNeeds } from "@/game/types";
import { useGame } from "@/hooks/useGame";
import styles from "./DebugPanel.module.css";

const num = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default function DebugPanel({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const { state, nav } = game;
  const [jumpTarget, setJumpTarget] = useState("");
  const revealPersonas = archetypes.flatMap((archetype) =>
    Object.values(archetype.personas).map((persona) => ({ ...persona, archetype }))
  );
  const [revealPersonaId, setRevealPersonaId] = useState(revealPersonas[0]?.id ?? "");

  const ctx = useMemo(() => contextFor(nav.treeId, state), [nav.treeId, state]);
  const weights = needWeights(state);
  const ranking: BrandMatch[] = rankAllBrands(state, weights, ctx);

  const patchEvidence = (need: Need, delta: number) =>
    game.debugPatch((s) => ({
      ...s,
      evidence: { ...s.evidence, [need]: s.evidence[need] + delta },
    }));

  return (
    <aside className={styles.panel} onClick={(e) => e.stopPropagation()}>
      <header className={styles.header}>
        <span>DEBUG — dev only</span>
        <button className={styles.close} onClick={onClose}>×</button>
      </header>
      <div className={styles.body}>
        <section className={styles.block}>
          <h3 className={styles.title3}>position</h3>
          <div>{nav.phase} · {nav.treeId ?? "—"} / {nav.nodeId ?? "—"}</div>
          <select className={styles.select} value={jumpTarget} onChange={(e) => setJumpTarget(e.target.value)}>
            <option value="">jump to…</option>
            {dateTreeList.map((t) => (
              <optgroup key={t.id} label={t.title || t.id}>
                {Object.keys(t.nodes).map((nid) => (
                  <option key={nid} value={`${t.id}|${nid}`}>{t.id} › {nid}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            disabled={!jumpTarget}
            className={styles.action}
            onClick={() => {
              if (!jumpTarget) return;
              const [treeId, nodeId] = jumpTarget.split("|");
              game.debugJump(treeId, nodeId);
            }}
          >
            jump
          </button>
        </section>

        <section className={styles.block}>
          <h3 className={styles.title3}>player evidence → weights</h3>
          <table className={styles.table}>
            <thead><tr><th>need</th><th>evidence</th><th>weight</th><th></th></tr></thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n}>
                  <td>{NEED_LABELS[n]}</td>
                  <td>{state.evidence[n]}</td>
                  <td>{(weights[n] * 100).toFixed(0)}%</td>
                  <td className={styles.adjust}>
                    <button onClick={() => patchEvidence(n, -1)}>−</button>
                    <button onClick={() => patchEvidence(n, +1)}>+</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.block}>
          <h3 className={styles.title3}>brands</h3>
          {ranking.map((m) => {
            const brand = getBrand(m.brandId);
            const mods = activeModifiers(m.brandId, ctx);
            const deltas = state.brandPerception[m.brandId];
            const deltaStr = deltas
              ? (Object.keys(deltas) as Need[]).filter((n) => deltas[n] !== 0).map((n) => `${NEED_LABELS[n]} ${num(deltas[n])}`).join(", ")
              : "";
            return (
              <details key={m.brandId} className={styles.brand}>
                <summary style={{ color: brand.color }}>
                  {brand.name} — match {m.score}% {state.dated.includes(m.brandId) ? "" : "(never met)"}
                </summary>
                <div>chemistry: {state.chemistry[m.brandId] ?? 0}</div>
                <div>deltas: {deltaStr || "—"}</div>
                <div>
                  modifiers:{" "}
                  {mods.length ? mods.map((mo) => `${mo.id} (${mo.label})`).join(" · ") : "none"}
                </div>
                <div className={styles.mono}>
                  effective: {(Object.keys(m.profile) as Need[]).map((n) => `${n}:${m.profile[n]}`).join(" ")}
                </div>
                <label className={styles.chemRow}>
                  chemistry
                  <input
                    type="range"
                    min={-5}
                    max={10}
                    value={state.chemistry[m.brandId] ?? 0}
                    onChange={(e) =>
                      game.debugPatch((s) => ({
                        ...s,
                        chemistry: { ...s.chemistry, [m.brandId]: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
              </details>
            );
          })}
        </section>

        <section className={styles.block}>
          <h3 className={styles.title3}>flags</h3>
          {Object.keys(state.flags).length === 0 && <div className={styles.dim}>none set</div>}
          {Object.entries(state.flags).map(([f, v]) => (
            <label key={f} className={styles.flagRow}>
              <input
                type="checkbox"
                checked={Boolean(v)}
                onChange={(e) =>
                  game.debugPatch((s) => ({ ...s, flags: { ...s.flags, [f]: e.target.checked } }))
                }
              />
              {f}
            </label>
          ))}
        </section>

        <section className={styles.block}>
          <h3 className={styles.title3}>unlocked evidence</h3>
          <div>{state.unlockedEvidence.length ? state.unlockedEvidence.join(", ") : "—"}</div>
        </section>

        <section className={styles.block}>
          <h3 className={styles.title3}>actions</h3>
          <div className={styles.actionsRow}>
            <button className={styles.action} onClick={() => void AudioManager.playSfx("evidence-chime")}>test sfx</button>
            <button className={styles.action} onClick={() => game.setPhase("reveal")}>force consumer reveal</button>
            <button className={styles.action} onClick={() => game.setPhase("match")}>force ending</button>
            <button className={styles.action} onClick={() => game.resetAll()}>reset all state</button>
          </div>
        </section>

        <section className={styles.block}>
          <h3 className={styles.title3}>reveal preview</h3>
          <div className={styles.dim}>Sets the matching evidence and the exact saved persona, then opens the three-beat reveal.</div>
          <select className={styles.select} value={revealPersonaId} onChange={(event) => setRevealPersonaId(event.target.value)}>
            {revealPersonas.map(({ id, name, archetype }) => (
              <option key={id} value={id}>{name} — {archetype.name}</option>
            ))}
          </select>
          <button
            className={styles.action}
            onClick={() => {
              const selected = revealPersonas.find((persona) => persona.id === revealPersonaId);
              if (!selected) return;
              game.debugReveal(selected.id, { ...zeroNeeds(), ...selected.archetype.weights });
            }}
          >
            preview selected reveal
          </button>
        </section>
      </div>
    </aside>
  );
}

function contextFor(treeId: string | null, state: GameState) {
  if (!treeId) return { flags: state.flags };
  try {
    const t = getTree(treeId);
    return { treeId: t.id, location: t.context?.location, occasion: t.context?.occasion, flags: state.flags };
  } catch {
    return { flags: state.flags };
  }
}
