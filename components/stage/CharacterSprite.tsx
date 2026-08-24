"use client";
// CharacterSprite (P2-02): registry-resolved sprite with position, expression,
// enter/exit animation, and speaking emphasis.
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { getAsset } from "@/content/registry";
import styles from "./CharacterSprite.module.css";

export type SpriteState = {
  key: string; // brand id (stable identity across expression swaps)
  assetId: string;
  alt: string;
  /** Display name used for speaking detection (the brand's name). */
  name: string;
  position: "left" | "center" | "right";
  effect: "enter" | "exit" | "none";
  speaking: boolean;
};

const ENTER_X: Record<SpriteState["position"], number> = { left: -120, center: 0, right: 120 };

export default function CharacterSprite({ sprite }: { sprite: SpriteState }) {
  const enterFrom = sprite.effect === "enter" ? ENTER_X[sprite.position] : 0;
  return (
    <div className={`${styles.slot} ${styles[sprite.position]}`}>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={sprite.key}
          className={styles.actor}
          initial={{ opacity: 0, x: enterFrom }}
          animate={{
            opacity: 1,
            x: 0,
            scale: sprite.speaking ? 1.03 : 1,
            filter: sprite.speaking ? "brightness(1)" : "brightness(0.62)",
          }}
          exit={{ opacity: 0, x: -ENTER_X[sprite.position], transition: { duration: 0.35 } }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        >
          <Image
            src={getAsset(sprite.assetId).src}
            alt={sprite.alt}
            width={480}
            height={586}
            priority
            draggable={false}
            className={styles.img}
            style={{ width: "100%", height: "auto" }}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
