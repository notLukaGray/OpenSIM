"use client";
// GameRoot: phase router + audio unlock + dev-only validation overlay (ADR-10/11).
import { useEffect, useState } from "react";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import TitleScreen from "@/components/meta/TitleScreen";
import GameScreen from "@/components/GameScreen";
import TravelMap from "@/components/map/TravelMap";
import ConsumerReveal from "@/components/reveal/ConsumerReveal";
import MatchReveal from "@/components/reveal/MatchReveal";
import { HUB_TREE_ID } from "@/content/registry";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function GameRoot() {
  const game = useGame();
  const [validation, setValidation] = useState<string[] | null>(null);

  // Audio unlock (autoplay policy, ADR-06). Try immediately — browsers that
  // already trust this origin (Chrome MEI) start audio with zero interaction;
  // otherwise the first pointer/key/touch gesture unlocks as a fallback.
  useEffect(() => {
    const unlock = () => void AudioManager.unlock();
    void AudioManager.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Reveal phases get their own music.
  useEffect(() => {
    if (game.nav.phase === "reveal" || game.nav.phase === "match")
      void AudioManager.playMusic("mus-reveal");
  }, [game.nav.phase]);

  // Loud dev-time validation of the bundled content (ADR-10).
  useEffect(() => {
    if (!IS_DEV) return;
    let cancelled = false;
    Promise.all([
      import("@/content/registry"),
      import("../tools/validate-core.mjs"),
    ])
      .then(([{ contentBundle }, { validateContent }]) => {
        if (cancelled) return;
        const result = validateContent(contentBundle);
        if (!result.ok) {
          const msgs = [
            ...result.errors.map((e: { file: string; path: string; message: string }) => `${e.file} :: ${e.path} :: ${e.message}`),
          ];
          console.error("[content] validation failed:\n" + msgs.join("\n"));
          setValidation(msgs);
        }
      })
      .catch((e) => console.error("[content] validator crashed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  if (validation) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "#2a0d12", color: "#ffd7d5", padding: 40, overflow: "auto", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
        <h1>CONTENT VALIDATION FAILED — fix before playing</h1>
        {validation.map((m, i) => (
          <p key={i}>✗ {m}</p>
        ))}
      </div>
    );
  }

  switch (game.nav.phase) {
    case "title":
      return <TitleScreen />;
    case "play":
      return game.nav.treeId === HUB_TREE_ID ? <TravelMap /> : <GameScreen isDev={IS_DEV} />;
    case "map":
      return <TravelMap />;
    case "reveal":
      return (
        <ConsumerReveal
          state={game.state}
          onDone={() => game.setPhase("match")}
        />
      );
    case "match":
      return <MatchReveal state={game.state} onRestart={() => game.toTitle()} />;
    default:
      return null;
  }
}
