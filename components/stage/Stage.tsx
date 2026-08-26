"use client";
// Stage (P2-02): background crossfade + cast layer. The dialogue layer sits
// above; TransitionLayer and overlays wrap it in GameScreen.
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
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
  // Do not unmount a painted scene while its replacement is still downloading
  // or decoding. The invisible Next image below warms the exact optimized
  // request; only its load event is allowed to advance the visible scene.
  const [visibleBackgroundId, setVisibleBackgroundId] = useState(backgroundId);
  const visibleBg = getAsset(visibleBackgroundId);
  const pendingBg = backgroundId === visibleBackgroundId ? null : getAsset(backgroundId);

  return (
    <div className={styles.stage}>
      {pendingBg && (
        <div className={styles.preload} aria-hidden="true">
          <Image
            key={backgroundId}
            src={pendingBg.src}
            alt=""
            fill
            priority
            sizes="100vw"
            draggable={false}
            onLoad={() => setVisibleBackgroundId(backgroundId)}
          />
        </div>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={visibleBackgroundId}
          className={styles.bg}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        >
          <Image
            src={visibleBg.src}
            alt={visibleBg.alt ?? ""}
            fill
            priority
            sizes="100vw"
            draggable={false}
            className={styles.bgImg}
          />
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
