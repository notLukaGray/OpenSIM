"use client";
// TravelMap (P5-02 hub, rebuilt by P10-01): the world is larger than the
// viewport now. Locations are content-defined buttons drawn over a pannable
// canvas (middle-mouse / two-finger / empty-space drag — see useWorldPan);
// tapping a zone opens that place's own screen (LocationView) where encounters
// are picked. Map = travel, LocationView = meeting.
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HUB_TREE_ID, dateTreeList, getAsset, getBrandOrNull, getTree, locations } from "@/content/registry";
import type { DateTree } from "@/content/schema";
import { resolveLines } from "@/game/engine";
import { AudioManager } from "@/game/audio/AudioManager";
import { useGame } from "@/hooks/useGame";
import { useWorldPan } from "@/hooks/useWorldPan";
import DateDebrief from "./DateDebrief";
import ArchivePanel from "./ArchivePanel";
import LocationView from "./LocationView";
import DialogueBox from "@/components/dialogue/DialogueBox";
import GameControls from "@/components/dialogue/GameControls";
import SettingsPanel from "@/components/meta/SettingsPanel";
import styles from "./TravelMap.module.css";
import { REVEAL_MIN_ENCOUNTERS } from "@/game/types";
import { auditReadiness } from "@/game/compatibility";

// Session-level marker so each completed encounter's debrief shows exactly once.
const lastDebriefShown = { id: null as string | null };
// The threshold-crossing popup announces itself once per run (P7-01 moment).
const thresholdAnnouncedAt = { count: -1 };

// The hub's ambient theme, in exactly one place — LocationView resumes it when
// a place's screen closes (ADR-06: track ids resolve through content/audio).
const MAP_MUSIC_ID = "mus-title";

export default function TravelMap() {
  const game = useGame();
  const { state } = game;
  const audit = auditReadiness(state);
  // The open location's own screen; null = world map.
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);
  // Debrief for the encounter completed most recently (shown once per arrival).
  const [debriefTree, setDebriefTree] = useState<DateTree | null>(null);
  // Threshold moment (P7-01): crossing REVEAL_MIN_ENCOUNTERS triggers a one-time
  // dramatic popup over the map — the reveal is a bigger deal than a button.
  const [thresholdPopup, setThresholdPopup] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // The map prompt belongs to the fresh-run intro only. Once an encounter has
  // been completed, returning to the map is navigation, not another greeting.
  const [mapPromptVisible, setMapPromptVisible] = useState(() => state.completedTrees.length === 0);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      audit.canReveal &&
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
  const introActive = game.nav.phase === "play" && game.nav.treeId === "home";
  const introTree = introActive ? getTree(HUB_TREE_ID) : null;
  const introNode = introTree && game.nav.nodeId ? introTree.nodes[game.nav.nodeId] : null;
  // The audit becomes available once its counterfactual read is stable (or at
  // the seven-encounter target); until then the player gets a useful next cue.
  const canReveal = audit.canReveal;
  const bg = getAsset("map-location");
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
          <Image src={bg.src} alt="" fill priority sizes="100vw" draggable={false} className={styles.backdrop} />

          <motion.div
            className={styles.mapTitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <h1>
              <span>Loyalty</span>
              <span>City</span>
            </h1>
          </motion.div>

          {!introActive && !mapPromptVisible && <div className={styles.locations}>
            {locations.map((loc, i) => {
              const anchorX = loc.map.x * (world.w / 100);
              const anchorY = loc.map.y * (world.h / 100);
              const all = encountersByLoc.get(loc.id) ?? [];
              const doneCount = all.filter((t) => state.completedTrees.includes(t.id)).length;
              const remaining = all.length - doneCount;
              // Zone status reuses completion semantics read-only:
              //   alive = encounters left tonight · done = everything here completed.
              const status = doneCount === 0 ? "quiet" : remaining === 0 ? "done" : "met";
              const statusClass =
                status === "done"
                  ? styles.zoneDone
                  : status === "met"
                    ? styles.zoneMet
                    : styles.zoneQuiet;
              return (
                <motion.button
                  key={loc.id}
                  data-map-zone={loc.id}
                  className={`${styles.locationButton} ${statusClass}`}
                  style={{ left: anchorX, top: anchorY, "--location-color": loc.color } as CSSProperties}
                  type="button"
                  role="button"
                  aria-label={`${loc.name} — ${
                    remaining > 0 ? `${remaining} encounter${remaining === 1 ? "" : "s"} tonight` : "no one here tonight"
                  }${doneCount > 0 ? `, ${doneCount} completed` : ""}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openLocation(loc.id);
                    }
                  }}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                >
                  <span className={styles.locationName}>{loc.name}</span>
                </motion.button>
              );
            })}
          </div>}
        </div>
      </div>

      <div className={styles.mapUi}>
        {(introActive || mapPromptVisible) && <DialogueBox
          entryKey={introActive ? `${HUB_TREE_ID}/${game.nav.nodeId}` : "map-prompt"}
          speaker={introActive && introNode ? introNode.speaker : "..."}
          lines={
            introActive && introNode
              ? resolveLines(introNode.text, introNode.callbacks, state.choiceLog.home ?? [])
                : ["where do you want to go?"]
          }
          selectedChoiceId={null}
          textSpeed={game.settings.textSpeed}
          onAdvance={introActive ? game.advance : () => setMapPromptVisible(false)}
          onSelectChoice={() => undefined}
        />}
        <GameControls
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenArchive={() => setArchiveOpen(true)}
          onToTitle={() => game.toTitle()}
        />
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

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
                : audit.confident
                  ? "The audit has a stable read."
                  : "Seven nights in, the audit will show you its best current read."}
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

      {!canReveal && !allDone && state.completedTrees.length >= REVEAL_MIN_ENCOUNTERS && (
        <div className={styles.globalActions}>
          <p className={styles.actionsNote}>
            The audit is still split on {audit.disputedNeed ?? "what matters most"}. Try another location — it needs a different angle.
          </p>
        </div>
      )}

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
              <div className={styles.thresholdKicker}>[ {audit.encounters} NIGHTS IN ]</div>
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
