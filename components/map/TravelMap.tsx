"use client";
// TravelMap (P5-02 hub, rebuilt by P10-01): the world is larger than the
// viewport now. Locations are content-defined hit zones drawn over a pannable
// canvas (middle-mouse / two-finger / empty-space drag — see useWorldPan);
// tapping a zone opens that place's own screen (LocationView) where encounters
// are picked. Map = travel, LocationView = meeting.
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dateTreeList, getAsset, getBrandOrNull, getTree, locations } from "@/content/registry";
import type { MapHitZone } from "@/content/registry";
import type { DateTree } from "@/content/schema";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import { useWorldPan } from "@/hooks/useWorldPan";
import DateDebrief from "./DateDebrief";
import ArchivePanel from "./ArchivePanel";
import LocationView from "./LocationView";
import styles from "./TravelMap.module.css";
import { REVEAL_MIN_ENCOUNTERS } from "@/game/types";

// Session-level marker so each completed encounter's debrief shows exactly once.
const lastDebriefShown = { id: null as string | null };
// The threshold-crossing popup announces itself once per run (P7-01 moment).
const thresholdAnnouncedAt = { count: -1 };

// Touch rule: every zone gets an invisible circular pad of this radius so its
// effective target stays ≥44px even when the drawn geometry is small.
const ZONE_PAD_R_PX = 27; // 54px diameter

// The hub's ambient theme, in exactly one place — LocationView resumes it when
// a place's screen closes (ADR-06: track ids resolve through content/audio).
const MAP_MUSIC_ID = "mus-title";

type WorldPx = { w: number; h: number };

/** Bounding box of a hit zone in world pixels — the slot its replaceable art
 *  file renders into. x stretches with width, y with height (the same stretch
 *  the backdrop gets), so what you see is exactly what is tappable. All
 *  geometry comes from the registry — no literals here. */
function zoneBBox(zone: MapHitZone, world: WorldPx) {
  const sx = world.w / 100;
  const sy = world.h / 100;
  switch (zone.shape) {
    case "circle":
      return {
        x: (zone.cx - zone.r) * sx,
        y: (zone.cy - zone.r) * sy,
        w: zone.r * 2 * sx,
        h: zone.r * 2 * sy,
      };
    case "rect":
      return { x: zone.x * sx, y: zone.y * sy, w: zone.w * sx, h: zone.h * sy };
    case "poly": {
      const xs = zone.points.map(([x]) => x * sx);
      const ys = zone.points.map(([, y]) => y * sy);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
  }
}

export default function TravelMap() {
  const game = useGame();
  const { state } = game;
  // The open location's own screen; null = world map.
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);
  // Debrief for the encounter completed most recently (shown once per arrival).
  const [debriefTree, setDebriefTree] = useState<DateTree | null>(null);
  // Threshold moment (P7-01): crossing REVEAL_MIN_ENCOUNTERS triggers a one-time
  // dramatic popup over the map — the reveal is a bigger deal than a button.
  const [thresholdPopup, setThresholdPopup] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Mirrors openLocationId for the dependency-free Escape handler below.
  const openLocRef = useRef<string | null>(null);

  // Pan/tap camera (component-local presentation state only).
  const pan = useWorldPan<HTMLDivElement>({
    onTapZone: (zoneId) => {
      void AudioManager.playSfx("sfx-click");
      setOpenLocationId(zoneId);
    },
  });

  useEffect(() => {
    const done = state.completedTrees;
    const newest = done.length > 0 ? done[done.length - 1] : null;
    if (newest && newest !== lastDebriefShown.id) {
      try {
        setDebriefTree(getTree(newest));
        lastDebriefShown.id = newest;
      } catch {
        /* tree vanished from registry — skip debrief */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void AudioManager.playMusic(MAP_MUSIC_ID);
    // Threshold moment fires once, the first time the map loads with enough
    // nights banked and the reveal still unseen.
    if (
      state.completedTrees.length >= REVEAL_MIN_ENCOUNTERS &&
      !state.hasSeenReveal &&
      thresholdAnnouncedAt.count < REVEAL_MIN_ENCOUNTERS
    ) {
      thresholdAnnouncedAt.count = state.completedTrees.length;
      void AudioManager.playSfx("heart-beat");
      setThresholdPopup(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc peels one layer: location view → map → title.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openLocRef.current) {
        setOpenLocationId(null);
        openLocRef.current = null;
      } else {
        game.toTitle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLocation = (id: string | null) => {
    openLocRef.current = id;
    setOpenLocationId(id);
  };
  const openedLocation = useMemo(
    () => locations.find((l) => l.id === openLocationId) ?? null,
    [openLocationId]
  );

  // Encounters per locationId, grouped straight from existing date data.
  const encountersByLoc = useMemo(() => {
    const m = new Map<string, DateTree[]>();
    for (const t of dateTreeList) {
      if (!t.locationId) continue;
      if (!m.has(t.locationId)) m.set(t.locationId, []);
      m.get(t.locationId)!.push(t);
    }
    return m;
  }, []);

  const available = useMemo(
    () => dateTreeList.filter((t) => !state.completedTrees.includes(t.id)),
    [state.completedTrees]
  );

  const allDone = available.length === 0;
  // Standing rule R1: the reveal is reachable in ≤10 minutes — after any two
  // encounters the player may audit themselves early, or keep exploring.
  const canReveal = state.completedTrees.length >= REVEAL_MIN_ENCOUNTERS;
  const bg = getAsset("bg-hub");
  const { world, offset } = pan;

  return (
    <div className={styles.wrap}>
      <div
        ref={pan.viewportRef}
        className={`${styles.viewport} ${pan.isPanning ? styles.panning : ""}`}
        {...pan.handlers}
      >
        <div
          className={styles.world}
          style={{
            width: world.w || undefined,
            height: world.h || undefined,
            transform: `translate3d(${-offset.x}px, ${-offset.y}px, 0)`,
          }}
        >
          <Image src={bg.src} alt="" fill priority draggable={false} className={styles.backdrop} />
          <div className={styles.dim} />

          <motion.div
            className={styles.headingWrap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className={styles.heading}>WHERE TO TONIGHT?</h1>
            <div className={styles.subheading}>
              the same product means something different in every place
            </div>
          </motion.div>

          {/* Hit zones live in SVG over the world; geometry resolves through the registry. */}
          <svg
            className={styles.zones}
            width={world.w || undefined}
            height={world.h || undefined}
            viewBox={`0 0 ${world.w} ${world.h}`}
          >
            {locations.map((loc, i) => {
              const bb = zoneBBox(loc.hitZone, world);
              const art = getAsset(loc.zoneArt);
              const anchorX = loc.map.x * (world.w / 100);
              const anchorY = loc.map.y * (world.h / 100);
              const all = encountersByLoc.get(loc.id) ?? [];
              const doneCount = all.filter((t) => state.completedTrees.includes(t.id)).length;
              const remaining = all.length - doneCount;
              // Zone status reuses completion semantics read-only:
              //   alive = encounters left tonight · done = everything here completed.
              const status = doneCount === 0 ? "quiet" : remaining === 0 ? "done" : "met";
              const marker = remaining === 0 && doneCount > 0 ? "✓" : doneCount > 0 ? "♥" : "·";
              const statusClass =
                status === "done"
                  ? styles.zoneDone
                  : status === "met"
                    ? styles.zoneMet
                    : styles.zoneQuiet;
              return (
                <motion.g
                  key={loc.id}
                  data-map-zone={loc.id}
                  className={`${styles.zone} ${statusClass}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${loc.name} — ${
                    remaining > 0 ? `${remaining} encounter${remaining === 1 ? "" : "s"} tonight` : "no one here tonight"
                  }${doneCount > 0 ? `, ${doneCount} completed` : ""}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openLocation(loc.id);
                    }
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                >
                  {/* ≥44px effective touch pad, centered on the content anchor */}
                  <circle className={styles.zonePad} cx={anchorX} cy={anchorY} r={ZONE_PAD_R_PX} />

                  {/* Replaceable marker art (P10-01): one file per location under
                      public/assets/map/zones/, resolved through assets.json — swap
                      the file (svg or png) to restyle a zone, no code changes. The
                      tappable region stays the content-defined hitZone + pad. */}
                  <image
                    className={styles.zoneArt}
                    href={art.src}
                    x={bb.x}
                    y={bb.y}
                    width={bb.w}
                    height={bb.h}
                    preserveAspectRatio="xMidYMid meet"
                  />

                  <g className={styles.marker}>
                    <circle className={styles.markerBg} cx={anchorX} cy={anchorY} r={13} />
                    <text className={styles.markerGlyph} x={anchorX} y={anchorY}>
                      {marker}
                    </text>
                  </g>

                  {/* Name surfaces on hover (desktop) or keyboard focus */}
                  <text className={styles.zoneLabel} x={anchorX} y={anchorY - ZONE_PAD_R_PX - 10}>
                    {loc.name}
                  </text>
                </motion.g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Global controls stay on the MAP level (placement decision, P10-01):
          travel and self-audit are world concerns; the LocationView handles meetings. */}

      {(canReveal || allDone) && (
        <motion.div
          className={styles.globalActions}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <p className={styles.actionsNote}>
            {allDone
              ? "That's everyone. Time to think about what all this meant."
              : state.hasSeenReveal
                ? "The audit updates with everything you learn."
                : "Enough to start seeing the shape of you — or keep exploring."}
          </p>
          <div className={styles.actionsRow}>
            {state.hasSeenReveal && (
              <button className={styles.thinkItOver} onClick={() => game.setPhase("match")}>
                RE-AUDIT ME
              </button>
            )}
            <button className={styles.thinkItOver} onClick={() => game.setPhase("reveal")}>
              {allDone ? "THINK IT OVER" : state.hasSeenReveal ? "RE-SEE THE REVEAL" : "SEE WHO YOU'VE BEEN"}
            </button>
          </div>
        </motion.div>
      )}

      <button
        className={styles.archiveBtn}
        onClick={(e) => {
          e.stopPropagation();
          setArchiveOpen(true);
        }}
      >
        ARCHIVE
      </button>
      <div className={styles.controlsHint}>drag to explore · esc · title</div>

      <AnimatePresence>
        {/* Every direct child of AnimatePresence needs a unique explicit key:
            keyless children all collapse to framer-motion's "" key and collide
            whenever two overlays coexist (or one exits while another enters). */}
        {thresholdPopup && (
          <motion.div
            key="threshold"
            className={styles.thresholdWrap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="the shape of you"
          >
            <motion.div
              className={styles.thresholdCard}
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: [0.85, 1.04, 1], y: [30, 12, 0] }}
              transition={{ duration: 0.9, times: [0, 0.7, 1], ease: "easeOut" }}
            >
              <motion.div
                className={styles.thresholdGlow}
                animate={{ opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
              <div className={styles.thresholdKicker}>[ THREE NIGHTS IN ]</div>
              <h2 className={styles.thresholdTitle}>SOMETHING IS TAKING SHAPE.</h2>
              <p className={styles.thresholdBody}>
                The brands think they&apos;ve been sizing you up.
                <br />
                They&apos;re wrong. The shape getting clearer is yours.
              </p>
              <div className={styles.thresholdActions}>
                <button
                  className={styles.thresholdCta}
                  onClick={(e) => {
                    e.stopPropagation();
                    setThresholdPopup(false);
                    void AudioManager.playSfx("heart-beat");
                    game.setPhase("reveal");
                  }}
                >
                  SEE WHO YOU&apos;VE BEEN
                </button>
                <button
                  className={styles.thresholdSkip}
                  onClick={(e) => {
                    e.stopPropagation();
                    setThresholdPopup(false);
                  }}
                >
                  keep exploring for now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {debriefTree && (
          <DateDebrief
            key="debrief"
            tree={debriefTree}
            state={state}
            onDismiss={() => setDebriefTree(null)}
          />
        )}
        {archiveOpen && <ArchivePanel key="archive" onClose={() => setArchiveOpen(false)} />}
        {openedLocation && (
          <LocationView
            key={`loc-${openedLocation.id}`}
            location={openedLocation}
            ambientMusicId={MAP_MUSIC_ID}
            onBack={() => openLocation(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
