"use client";
// LocationView (P10-01): one place's own screen. The map answers "where am I
// going"; this screen answers "who am I meeting here" — every encounter at
// this locationId, grouped from existing date data exactly as the old hub list
// grouped them (branded encounters + unbranded wilds separately). Picking one
// dispatches the exact same start-date path the hub has always used.
import { useEffect, useMemo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { dateTreeList, getAsset, getBrandOrNull } from "@/content/registry";
import type { MappedGameLocation } from "@/content/registry";
import type { DateTree } from "@/content/schema";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import styles from "./LocationView.module.css";

export default function LocationView({
  location,
  ambientMusicId,
  onBack,
}: {
  location: MappedGameLocation;
  /** The track the world map was playing — resumed when this screen closes. */
  ambientMusicId: string;
  onBack: () => void;
}) {
  const game = useGame();
  const { state } = game;
  // The place sets the tone while you're here (P10-01 user direction):
  // crossfade to the location's own track, back to the map's theme on exit.
  // Entering a date overrides both via GameScreen's music direction.
  useEffect(() => {
    void AudioManager.playMusic(location.music);
    return () => void AudioManager.playMusic(ambientMusicId);
  }, [location.music, ambientMusicId]);

  // Every encounter at this place — completed ones stay listed so the roster
  // can carry met/done markers (read-only reads of dated/completedTrees).
  const encounters = useMemo(
    () => dateTreeList.filter((t) => t.locationId === location.id),
    [location.id]
  );
  const branded = useMemo(
    () => encounters.filter((t) => !getBrandOrNull(t.brandId)?.unbranded),
    [encounters]
  );
  const wilds = useMemo(
    () => encounters.filter((t) => getBrandOrNull(t.brandId)?.unbranded),
    [encounters]
  );

  // Esc is owned by the parent map (single listener decides view-vs-title).

  const startEncounter = (tree: DateTree) => {
    void AudioManager.playSfx("sfx-click");
    // Keep the map painted while the destination scene loads. Stage also
    // gates in-date swaps, so no route can expose an empty frame.
    const image = new window.Image();
    const travel = () => game.travelTo(tree.id);
    image.onload = () => {
      const decoded = image.decode?.();
      if (decoded) void decoded.catch(() => undefined).finally(travel);
      else travel();
    };
    image.onerror = travel;
    image.src = getAsset(location.background).src;
  };

  const row = (t: DateTree) => {
    const brand = getBrandOrNull(t.brandId);
    const done = state.completedTrees.includes(t.id);
    return (
      <motion.button
        key={t.id}
        className={`${styles.encounter} ${done ? styles.encounterDone : ""}`}
        onClick={() => startEncounter(t)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <span className={styles.sigil} style={{ color: brand?.color }}>
          {brand?.sigil}
        </span>
        <span className={styles.encounterMain}>
          <span className={styles.encounterTitle}>
            {brand?.name} — {t.title}
          </span>
        </span>
        {/* Completion semantics reused read-only: completedTrees = done, dated = met */}
        <span className={`${styles.statusChip} ${done ? styles.statusDone : styles.statusMet}`}>
          {done ? "✓ done" : state.dated.includes(brand?.id ?? "") ? "met again?" : "tonight"}
        </span>
      </motion.button>
    );
  };

  return (
    <motion.div
      className={styles.wrap}
      style={{ "--location-color": location.color } as CSSProperties}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className={styles.dim} />

      <motion.div
        className={styles.panel}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <button className={styles.backBtn} onClick={onBack} aria-label="back to the map">
          ← MAP
        </button>

        <div className={styles.kicker}>LOCATION</div>
        <h1 className={styles.name}>{location.name}</h1>
        <p className={styles.blurb}>{location.blurb}</p>
        <div className={styles.count}>
          {encounters.length === 0
            ? "no one here tonight"
            : `${encounters.length} encounter${encounters.length === 1 ? "" : "s"} here`}
        </div>

        {branded.length > 0 && <div className={styles.section}>WHO&apos;S HERE</div>}
        <div className={styles.roster}>
          {branded.map((t) => (
            <div key={t.id}>{row(t)}</div>
          ))}
        </div>

        {wilds.length > 0 && (
          <>
            <div className={styles.section}>NO BRANDS TONIGHT</div>
            <div className={styles.roster}>
              {wilds.map((t) => (
                <div key={t.id}>{row(t)}</div>
              ))}
            </div>
          </>
        )}
        {encounters.length === 0 && (
          <div className={styles.emptyNote}>the place is empty tonight — come back later</div>
        )}
      </motion.div>
    </motion.div>
  );
}
