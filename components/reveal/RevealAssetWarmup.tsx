"use client";
// Warm the two possible reveal sprites only when the audit is close enough to matter.
import Image from "next/image";
import { getAsset } from "@/content/registry";
import { closestArchetype, needWeights } from "@/game/compatibility";
import type { GameState } from "@/game/types";

export default function RevealAssetWarmup({ state, enabled }: { state: GameState; enabled: boolean }) {
  const { archetype } = closestArchetype(needWeights(state));
  const background = getAsset("bg-reveal");
  const sprites = [
    getAsset(archetype.personas.feminine.assetId),
    getAsset(archetype.personas.masculine.assetId),
  ];

  if (!enabled) return null;

  return (
    <div aria-hidden="true" style={{ position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      <Image src={background.src} alt="" width={1600} height={900} sizes="100vw" loading="eager" />
      {sprites.map((asset) => (
        <Image key={asset.id} src={asset.src} alt="" width={640} height={960} sizes="(max-width: 720px) 92vw, 640px" loading="eager" />
      ))}
    </div>
  );
}
