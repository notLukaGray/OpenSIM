"use client";
// GameScreen: the play phase. Consumes node scene-directions (P2-05) and
// renders Stage + DialogueBox + overlays. No story knowledge beyond the
// registries. All hooks run unconditionally (React rules of hooks).
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getAsset, getBrandOrNull, getLocationOrNull, getTree } from "@/content/registry";
import type { Choice, DialogueNode } from "@/content/schema";
import { AudioManager } from "@/game/audio/AudioManager";
import { evalCondition } from "@/game/conditions";
import { filterCompletedDates, resolveLines } from "@/game/engine";
import type { SpriteState } from "@/components/stage/CharacterSprite";
import CGViewer from "@/components/stage/CGViewer";
import EvidenceOverlay from "@/components/stage/EvidenceOverlay";
import Stage from "@/components/stage/Stage";
import DialogueBox from "@/components/dialogue/DialogueBox";
import GameControls from "@/components/dialogue/GameControls";
import SettingsPanel from "@/components/meta/SettingsPanel";
import { useGame } from "@/hooks/useGame";
import styles from "./GameScreen.module.css";

// Dev-only (ADR-11): the IS_DEV gate is inlined at build time, so production
// builds dead-code-eliminate this branch — the debug chunk never ships.
const IS_DEV = process.env.NODE_ENV !== "production";
const DebugPanel = IS_DEV
  ? dynamic(() => import("@/components/debug/DebugPanel"), { ssr: false })
  : null;

export default function GameScreen({ isDev }: { isDev: boolean }) {
  const game = useGame();
  const { state, nav, settings } = game;
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [sprites, setSprites] = useState<SpriteState[]>([]);
  const [overlay, setOverlay] = useState<{ kind: "cg" | "evidence"; id: string } | null>(null);
  const overlayShownFor = useRef<string | null>(null);
  const enteredTree = useRef<string | null>(null);

  const treeId = nav.phase === "play" ? nav.treeId : null;
  const nodeId = nav.phase === "play" ? nav.nodeId : null;
  const tree = treeId ? getTree(treeId) : null;
  const node: DialogueNode | null = tree && nodeId ? (tree.nodes[nodeId] ?? null) : null;

  const brandName = tree?.brandId ? (getBrandOrNull(tree.brandId)?.name ?? null) : null;

  // ── cast runtime: date defaults + per-node sprite direction ────────────────
  useEffect(() => {
    if (!tree || !node) {
      setSprites([]);
      return;
    }
    const firstEntry = enteredTree.current !== tree.id;
    enteredTree.current = tree.id;

    let next: SpriteState[] = tree.cast.map((cm) => ({
      key: cm.assetId.replace(/^char-(.+)-[a-z]+$/, "$1"),
      assetId: cm.assetId,
      alt: getAsset(cm.assetId).alt ?? "",
      name: cm.name ?? getBrandOrNull(cm.assetId.replace(/^char-(.+)-[a-z]+$/, "$1"))?.name ?? cm.assetId,
      position: cm.position,
      effect: firstEntry ? "enter" : "none",
      speaking: false,
    }));

    const dir = node.sprite;
    if (dir && next.length > 0) {
      const targetIdx = dir.assetId ? next.findIndex((b) => b.assetId === dir.assetId) : 0;
      const idx = targetIdx >= 0 ? targetIdx : 0;
      const target = next[idx];
      if (dir.effect === "exit") {
        next = next.filter((_, i) => i !== idx);
      } else {
        const expression = dir.expression;
        next[idx] = {
          ...target,
          assetId: expression ? `char-${target.key}-${expression}` : target.assetId,
          alt: expression ? `${target.name}, ${expression}` : target.alt,
          position: dir.position ?? target.position,
          effect: firstEntry ? "enter" : "none",
        };
      }
    }
    setSprites(next);
  }, [tree, node]);

  // ── music follows node/date/location direction (ADR-06) ───────────────────
  useEffect(() => {
    const id = node?.music ?? tree?.music ?? location?.music ?? "mus-hub";
    void AudioManager.playMusic(id);
  }, [node, tree]);

  // ── clear choice highlight + one-shot overlays per node entry ─────────────
  useEffect(() => {
    setSelectedChoiceId(null);
  }, [nodeId, treeId]);

  useEffect(() => {
    if (!node) return;
    const stamp = `${treeId}/${nodeId}`;
    if (overlayShownFor.current === stamp) return;
    overlayShownFor.current = stamp;
    if (node.cg) setOverlay({ kind: "cg", id: node.cg });
    else if (node.evidence) {
      setOverlay({ kind: "evidence", id: node.evidence });
      void AudioManager.playSfx("evidence-chime");
    } else setOverlay(null);
  }, [node, nodeId, treeId]);

  // ── dev keyboard shortcut for the debug panel ──────────────────────────────
  useEffect(() => {
    if (!isDev) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`") setDebugOpen((v) => !v);
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setDebugOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDev]);

  if (!tree || !node) return null;

  const location = tree?.locationId ? getLocationOrNull(tree.locationId) : null;
  const backgroundId = node?.background ?? tree?.background ?? location?.background ?? "bg-hub";
  const lines = node ? resolveLines(node.text, node.callbacks, state.choiceLog[tree.id] ?? []) : [];
  const availableChoices: Choice[] | undefined = filterCompletedDates(
    node?.choices?.filter((c) => evalCondition(c.conditions, state)),
    state
  );

  const choose = (choice: Choice) => {
    setSelectedChoiceId(choice.id);
    void AudioManager.playSfx("sfx-click");
    window.setTimeout(() => game.choose(choice), 380);
  };

  return (
    <div className={styles.wrap}>
      <Stage backgroundId={backgroundId} sprites={sprites} speakerName={node.speaker} />

      <AnimatePresence>
        {overlay?.kind === "cg" && (
          <CGViewer key={`cg-${overlay.id}`} cgId={overlay.id} onDismiss={() => setOverlay(null)} />
        )}
        {overlay?.kind === "evidence" && (
          <EvidenceOverlay key={`ev-${overlay.id}`} evidenceId={overlay.id} onDismiss={() => setOverlay(null)} />
        )}
      </AnimatePresence>

      {/* Tree-entry wipe (P2-02) */}
      <motion.div
        key={`wipe-${treeId}`}
        className={styles.wipe}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 0.65, ease: [0.83, 0, 0.17, 1] }}
        style={{ originX: 0, pointerEvents: "none" }}
      />

      <div className={styles.dialogueLayer}>
        <div className={styles.vignette}>
          <Image src={getAsset("ui-vignette").src} alt="" fill draggable={false} />
        </div>
        <DialogueBox
          entryKey={`${treeId}/${nodeId}`}
          speaker={node.speaker}
          lines={lines}
          choices={availableChoices}
          selectedChoiceId={selectedChoiceId}
          textSpeed={settings.textSpeed}
          onAdvance={game.advance}
          onSelectChoice={choose}
          onLineStart={(i) => void AudioManager.speak(`${treeId}/${nodeId}/${i}`)}
        />
        <GameControls
          onOpenSettings={() => setSettingsOpen((v) => !v)}
          onToTitle={() => game.toTitle()}
          onToggleDebug={isDev ? () => setDebugOpen((v) => !v) : undefined}
        />
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {IS_DEV && debugOpen && DebugPanel && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </div>
  );
}
