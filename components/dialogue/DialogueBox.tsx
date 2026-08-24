"use client";
// DialogueBox (P2-02): speaker tab, typewriter lines, choices, continue cue.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Choice } from "@/content/schema";
import SpeakerTab from "./SpeakerTab";
import ChoiceList from "./ChoiceList";
import ContinueIndicator from "./ContinueIndicator";
import styles from "./DialogueBox.module.css";

export default function DialogueBox({
  entryKey,
  speaker,
  lines,
  choices,
  selectedChoiceId,
  textSpeed,
  onAdvance,
  onSelectChoice,
  onLineStart,
}: {
  entryKey: string;
  speaker: string;
  lines: string[];
  choices?: Choice[];
  selectedChoiceId: string | null;
  textSpeed: number;
  onAdvance: () => void;
  onSelectChoice: (choice: Choice) => void;
  /** Fired when the typewriter starts a new line — used for VO (P5-03). */
  onLineStart?: (lineIndex: number) => void;
}) {
  const hasChoices = !!choices && choices.length > 0;

  // Typewriter across all lines of the current beat.
  const fullText = useMemo(() => lines.join("\n"), [lines]);
  const [shown, setShown] = useState(0);
  const complete = shown >= fullText.length;

  // Choices never pop in on their own: once the last line finishes typing the
  // player gets the normal continue cue, and the NEXT click reveals them —
  // otherwise fast typewriters outrun slow readers.
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  const showChoices = hasChoices && complete && choicesRevealed;
  const waitingToReveal = hasChoices && complete && !choicesRevealed;

  // Which line is the caret in right now?
  const lineStarts = useMemo(() => {
    const starts: number[] = [];
    let offset = 0;
    for (const line of lines) {
      starts.push(offset);
      offset += line.length + 1; // +1 for the join separator
    }
    return starts;
  }, [lines]);
  const activeLine = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < lineStarts.length; i++) if (shown >= lineStarts[i]) idx = i;
    return idx;
  }, [shown, lineStarts]);

  useEffect(() => {
    setShown(0);
    setChoicesRevealed(false);
  }, [entryKey]);

  useEffect(() => {
    if (onLineStart && !complete) onLineStart(activeLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine, entryKey]);

  useEffect(() => {
    if (complete) return;
    const step = Math.max(1, Math.round(textSpeed / 30));
    const interval = Math.max(8, 1000 / textSpeed);
    const t = window.setInterval(() => {
      setShown((s) => Math.min(fullText.length, s + step));
    }, interval);
    return () => window.clearInterval(t);
  }, [fullText, complete, textSpeed]);

  const click = () => {
    if (!complete) {
      setShown(fullText.length);
      return;
    }
    if (waitingToReveal) {
      setChoicesRevealed(true);
      return;
    }
    if (!hasChoices) onAdvance();
  };

  const renderedLines = fullText.slice(0, shown).split("\n");

  return (
    <motion.div
      className={`${styles.box} ${speaker === "COUNSEL" ? styles.counsel : ""}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      onClick={click}
      role={showChoices ? undefined : "button"}
      aria-label={showChoices ? "make a choice" : "continue"}
    >
      <div className={styles.stitchBorder} />
      <span className={`${styles.deco} ${styles.decoTL}`}>✦</span>
      <span className={`${styles.deco} ${styles.decoBR}`}>❀</span>

      <SpeakerTab name={speaker} />

      <AnimatePresence mode="wait">
        <motion.div
          key={entryKey}
          className={styles.content}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {showChoices ? (
            <ChoiceList choices={choices} selectedId={selectedChoiceId} onSelect={onSelectChoice} />
          ) : (
            <div className={styles.text} aria-hidden={hasChoices || undefined}>
              {renderedLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {complete && !showChoices && <ContinueIndicator />}
    </motion.div>
  );
}
