"use client";

import { useMemo, useState } from "react";
import DialogueBox from "@/components/DialogueBox";
import GameControls from "@/components/GameControls";
import { DialogueChoice, DialogueNode, getDialogueTree } from "@/dialogueTrees";
import { applyChoice, closestArchetype, createGame, markDated, needWeights, rankedBrands } from "@/game/engine";
import { resolveLines } from "@/game/engine";
import { BrandId, GameState, Need, brandIds } from "@/game/types";
import styles from "./page.module.css";

const isBrandId = (id: string): id is BrandId => (brandIds as string[]).includes(id);

const needLabel: Record<Need, string> = {
  control: "control",
  readiness: "readiness",
  reassurance: "reassurance",
  aspiration: "aspiration",
  belonging: "belonging",
  mastery: "mastery",
  comfort: "comfort",
  excitement: "excitement",
  selfExpression: "self-expression",
  trust: "trust",
};

type RevealNode = { speaker: string; lines: string[]; choices?: DialogueChoice[] };

function buildRevealNodes(state: GameState): RevealNode[] {
  const weights = needWeights(state);
  const archetype = closestArchetype(weights);
  const ranked = rankedBrands(state, weights);
  const topNeeds = [...(Object.keys(weights) as Need[])]
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, 3)
    .map((n) => needLabel[n]);

  const nodes: RevealNode[] = [
    {
      speaker: "...",
      lines: ["That's everyone you had time for.", "Somewhere in there, you stopped watching them and started revealing yourself."],
    },
    {
      speaker: archetype.name,
      lines: [archetype.description, `You kept circling back to: ${topNeeds.join(", ")}.`],
    },
  ];

  // Only the top match is shown — the player never met the others, so their
  // scores stay backend-only (still computable via `ranked` for debugging/analytics).
  const match = ranked[0];
  if (match) {
    const whyText = match.why.length
      ? `Why it works: ${match.why.map((c) => needLabel[c.need]).join(", ")}.`
      : "Why it works: hard to say — you two barely overlap.";
    const tensionText = match.tension.length ? `The tension: ${match.tension.map((c) => needLabel[c.need]).join(", ")}.` : "";
    nodes.push({
      speaker: match.brand.name,
      lines: [`${match.score}% MATCH`, whyText, ...(tensionText ? [tensionText] : [])],
    });
  }

  nodes.push({
    speaker: "...",
    lines: ["That's the match."],
    choices: [{ id: "again", text: "MEET SOMEONE NEW", next: "restart" }],
  });

  return nodes;
}

export default function Page() {
  const [gameState, setGameState] = useState<GameState>(() => createGame());
  const [currentTreeId, setCurrentTreeId] = useState("home");
  const [nodeId, setNodeId] = useState(() => getDialogueTree("home").start);
  const [phase, setPhase] = useState<"play" | "reveal">("play");
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [revealIndex, setRevealIndex] = useState(0);

  const tree = phase === "play" ? getDialogueTree(currentTreeId) : null;
  const node: DialogueNode | null = tree ? tree.nodes[nodeId] : null;

  const revealNodes = useMemo(() => (phase === "reveal" ? buildRevealNodes(gameState) : []), [phase, gameState]);
  const revealNode = phase === "reveal" ? revealNodes[revealIndex] : null;

  // Enters a different tree given a GameState that already reflects any
  // choice effects / markDated from leaving the previous tree.
  const enterTree = (targetTreeId: string, state: GameState) => {
    setSelectedChoiceId(null);
    if (targetTreeId === "reveal") {
      setPhase("reveal");
      setRevealIndex(0);
      return;
    }
    setCurrentTreeId(targetTreeId);
    if (targetTreeId === "home") {
      const allDone = state.dated.length === brandIds.length;
      setNodeId(allDone ? "all-done" : "menu");
    } else {
      setNodeId(getDialogueTree(targetTreeId).start);
    }
  };

  const leaveCurrentTree = (state: GameState): GameState => (isBrandId(currentTreeId) ? markDated(state, currentTreeId) : state);

  const advancePlay = () => {
    if (!node) return;
    if (node.next) {
      setNodeId(node.next);
      return;
    }
    if (node.nextTree) {
      const nextState = leaveCurrentTree(gameState);
      setGameState(nextState);
      enterTree(node.nextTree, nextState);
    }
  };

  const selectPlayChoice = (choice: DialogueChoice) => {
    setSelectedChoiceId(choice.id);
    const afterChoice = applyChoice(gameState, currentTreeId, choice);
    setTimeout(() => {
      if (choice.nextTree) {
        const nextState = leaveCurrentTree(afterChoice);
        setGameState(nextState);
        enterTree(choice.nextTree, nextState);
      } else if (choice.next) {
        setGameState(afterChoice);
        setSelectedChoiceId(null);
        setNodeId(choice.next);
      }
    }, 400);
  };

  const advanceReveal = () => {
    if (revealIndex < revealNodes.length - 1) setRevealIndex((i) => i + 1);
  };

  const selectRevealChoice = (choice: DialogueChoice) => {
    if (choice.next === "restart") location.reload();
  };

  if (phase === "play" && !node) return null;
  if (phase === "reveal" && !revealNode) return null;

  // The hub's location menu hides brands already dated this playthrough.
  const visibleChoices =
    phase === "play" && currentTreeId === "home" && nodeId === "menu"
      ? node!.choices?.filter((c) => !c.nextTree || !gameState.dated.includes(c.nextTree as BrandId))
      : node?.choices;

  const speaker = phase === "play" ? node!.speaker : revealNode!.speaker;
  const lines =
    phase === "play" ? resolveLines(node!.text, node!.callbacks, gameState.choiceLog[currentTreeId] ?? []) : revealNode!.lines;
  const choices = phase === "play" ? visibleChoices : revealNode!.choices;
  const entryKey = phase === "play" ? currentTreeId + speaker + nodeId : `reveal-${revealIndex}`;

  return (
    <main className={styles.stage}>
      <div className={styles.vnLayer}>
        <DialogueBox
          entryKey={entryKey}
          speaker={speaker}
          lines={lines}
          choices={choices}
          selectedChoiceId={selectedChoiceId}
          onAdvance={phase === "play" ? advancePlay : advanceReveal}
          onSelectChoice={phase === "play" ? selectPlayChoice : selectRevealChoice}
        />
        <GameControls />
      </div>
    </main>
  );
}
