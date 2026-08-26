"use client";
// LocationView (P10-01): one place's own screen. The map answers "where am I
// going"; this screen answers "who am I meeting here" — every encounter at
// this locationId, grouped from existing date data exactly as the old hub list
// grouped them (branded encounters + unbranded wilds separately). Picking one
// dispatches the exact same start-date path the hub has always used.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { assets, dateTreeList, getAsset, getBrandOrNull, hasAsset } from "@/content/registry";
import type { MappedGameLocation } from "@/content/registry";
import type { DateTree } from "@/content/schema";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import styles from "./LocationView.module.css";
import LoadingOverlay from "@/components/ui/LoadingOverlay";

/**
 * A date's cast is not just the neutral image shown on entry. Every registered
 * expression for each cast member must be decoded before navigation so the
 * dialogue can switch emotes without introducing a fetch/decode hitch.
 */
function spriteVariantIds(assetId: string): string[] {
  const match = assetId.match(/^char-(.+)-[^-]+$/);
  if (!match) return [assetId];
  const prefix = `char-${match[1]}-`;
  const variants = assets.filter((asset) => asset.id.startsWith(prefix)).map((asset) => asset.id);
  return variants.length ? variants : [assetId];
}

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
  const [pendingEncounter, setPendingEncounter] = useState<DateTree | null>(null);
  const [loadedAssetIds, setLoadedAssetIds] = useState<Set<string>>(() => new Set());
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

  const preloadAssets = useMemo(() => {
    if (!pendingEncounter) return [];
    const backgroundIds = new Set([
      location.background,
      ...(pendingEncounter.background ? [pendingEncounter.background] : []),
    ]);
    const assetIds = [
      ...backgroundIds,
      ...pendingEncounter.cast.flatMap((member) => spriteVariantIds(member.assetId)),
    ];
    return [...new Set(assetIds)]
      .filter(hasAsset)
      .map((id) => ({ id, src: getAsset(id).src, kind: backgroundIds.has(id) ? "background" : "sprite" as const }));
  }, [location.background, pendingEncounter]);

  useEffect(() => {
    if (!pendingEncounter || !preloadAssets.length || loadedAssetIds.size < preloadAssets.length) return;
    const treeId = pendingEncounter.id;
    setPendingEncounter(null);
    game.travelTo(treeId);
  }, [game, loadedAssetIds.size, pendingEncounter, preloadAssets.length]);

  const markAssetLoaded = (assetId: string) => {
    setLoadedAssetIds((loaded) => {
      if (loaded.has(assetId)) return loaded;
      const next = new Set(loaded);
      next.add(assetId);
      return next;
    });
  };

  const startEncounter = (tree: DateTree) => {
    void AudioManager.playSfx("sfx-click");
    setLoadedAssetIds(new Set());
    setPendingEncounter(tree);
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
      {pendingEncounter && <LoadingOverlay label="loading scene" />}
      {pendingEncounter && (
        <div className={styles.preload} aria-hidden="true">
          {preloadAssets.map((asset) => (
            asset.kind === "background" ? (
              <Image key={asset.id} src={asset.src} alt="" fill sizes="100vw" loading="eager" priority onLoad={() => markAssetLoaded(asset.id)} onError={() => markAssetLoaded(asset.id)} />
            ) : (
              <Image key={asset.id} src={asset.src} alt="" width={480} height={586} loading="eager" priority onLoad={() => markAssetLoaded(asset.id)} onError={() => markAssetLoaded(asset.id)} />
            )
          ))}
        </div>
      )}
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
