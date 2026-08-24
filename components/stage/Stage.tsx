"use client";
// Stage (P2-02): background crossfade + cast layer. The dialogue layer sits
// above; TransitionLayer and overlays wrap it in GameScreen.
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { getAsset } from "@/content/registry";
import CharacterSprite, { SpriteState } from "./CharacterSprite";
import styles from "./Stage.module.css";

export default function Stage({
  backgroundId,
  sprites,
  speakerName,
}: {
  backgroundId: string;
  sprites: SpriteState[];
  speakerName: string;
}) {
  const bg = getAsset(backgroundId);
  return (
    <div className={styles.stage}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={backgroundId}
          className={styles.bg}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        >
          <Image src={bg.src} alt={bg.alt ?? ""} fill priority draggable={false} className={styles.bgImg} />
        </motion.div>
      </AnimatePresence>

      <div className={styles.cast}>
        {sprites.map((s) => (
          <CharacterSprite key={s.key} sprite={{ ...s, speaking: s.name === speakerName }} />
        ))}
      </div>
    </div>
  );
}
