"use client";
// The game store (P1-03): one reducer over GameState + Navigation + Settings.
// Pure reducer; persistence and audio application are effects at this layer.
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { HUB_TREE_ID, dateTreeList, getTree } from "@/content/registry";
import type { DateTree } from "@/content/schema";
import type { Choice } from "@/content/schema";
import { evalCondition } from "@/game/conditions";
import { applyChoice, applyEvidenceUnlock, markCompleted } from "@/game/engine";
import {
  GameState,
  Navigation,
  Phase,
  SAVE_VERSION,
  Settings,
  createGameState,
  defaultSettings,
} from "@/game/types";
import { clearSave, loadSave, loadSettings, persistSave, persistSettings } from "@/game/save";

type StoreState = { state: GameState; nav: Navigation; settings: Settings };

type Action =
  | { type: "NEW_GAME" }
  | { type: "HYDRATE_SETTINGS"; settings: Settings }
  | { type: "HYDRATE"; state: GameState; navigation: Navigation }
  | { type: "TO_TITLE" }
  | { type: "RESET_ALL" }
  | { type: "ADVANCE" }
  | { type: "CHOOSE"; choice: Choice }
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "UPDATE_SETTINGS"; patch: Partial<Settings> }
  | { type: "DEBUG_PATCH"; patch: (s: GameState) => GameState }
  | { type: "DEBUG_JUMP"; treeId: string; nodeId?: string }
  | { type: "TRAVEL"; treeId: string };

const initialNav: Navigation = { phase: "title", treeId: null, nodeId: null };
const initialState: StoreState = {
  state: createGameState(),
  nav: initialNav,
  settings: defaultSettings(),
};

const fails = (cond: Parameters<typeof evalCondition>[0], s: GameState) => !evalCondition(cond, s);

function getTreeOrNull(id: string): DateTree | null {
  try {
    return getTree(id);
  } catch {
    return null;
  }
}

/** Enter a node of a tree, applying node-entry effects (evidence unlocks). */
function enter(store: StoreState, treeId: string, requestedNodeId?: string): StoreState {
  const tree = getTree(treeId);
  const nodeId = requestedNodeId ?? tree.startNode;
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`Unknown node "${treeId}/${nodeId}"`);
  const state = applyEvidenceUnlock(store.state, node);
  return { ...store, state, nav: { ...store.nav, phase: "play", treeId, nodeId } };
}

/** Follow a node/choice exit (`next` within a tree, `nextTree` across trees). */
function follow(store: StoreState, next?: string, nextTree?: string): StoreState {
  if (nextTree !== undefined) {
    // Completing an encounter marks the tree done + brand met BEFORE any exit
    // hands off — including map/reveal early-returns (P5-01/P7-01 regression fix).
    const leaving = store.nav.treeId ? getTreeOrNull(store.nav.treeId) : null;
    const state =
      leaving?.brandId && !store.state.completedTrees.includes(leaving.id)
        ? markCompleted(store.state, leaving.id, leaving.brandId)
        : store.state;

    if (nextTree === "reveal")
      return {
        ...store,
        state: { ...state, hasSeenReveal: true },
        nav: { ...store.nav, phase: "reveal", treeId: null, nodeId: null },
      };
    if (nextTree === "map")
      return { ...store, state, nav: { ...store.nav, phase: "map", treeId: null, nodeId: null } };
    return enter({ ...store, state }, nextTree);
  }
  if (next === undefined) return store;
  const tree = getTree(store.nav.treeId!);
  // Skip forward through pass-through nodes whose conditions fail (P1-05).
  let cursorId: string | undefined = next;
  let cursor = cursorId ? tree.nodes[cursorId] : undefined;
  let guard = 0;
  while (
    cursor &&
    !cursor.choices &&
    cursor.next &&
    !cursor.nextTree &&
    fails(cursor.conditions, store.state)
  ) {
    if (++guard > 100) throw new Error(`Condition skip loop in "${tree.id}"`);
    cursorId = cursor.next;
    cursor = tree.nodes[cursorId];
  }
  if (!cursor || !cursorId) throw new Error(`Broken exit "${String(next)}" in "${tree.id}"`);
  return enter(store, tree.id, cursorId);
}

function reducer(store: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "NEW_GAME": {
      const fresh: StoreState = { state: createGameState(), nav: initialNav, settings: store.settings };
      return enter(fresh, HUB_TREE_ID, "intro");
    }
    case "HYDRATE_SETTINGS":
      return { ...store, settings: action.settings };
    case "HYDRATE":
      return { ...store, state: action.state, nav: action.navigation };
    case "TO_TITLE":
      return { ...store, nav: initialNav };
    case "RESET_ALL":
      clearSave();
      return { ...initialState, settings: store.settings };
    case "ADVANCE": {
      if (store.nav.phase !== "play") return store;
      const tree = getTree(store.nav.treeId!);
      const node = tree.nodes[store.nav.nodeId!];
      if (node.choices?.length) return store; // a choice owns the interaction
      return follow(store, node.next, node.nextTree);
    }
    case "CHOOSE": {
      if (store.nav.phase !== "play") return store;
      const nextState = applyChoice(store.state, store.nav.treeId!, action.choice);
      return follow({ ...store, state: nextState }, action.choice.next, action.choice.nextTree);
    }
    case "SET_PHASE":
      return {
        ...store,
        // Entering the reveal (from map gate or debug) marks it seen (P7-02).
        state: action.phase === "reveal" ? { ...store.state, hasSeenReveal: true } : store.state,
        nav: {
          ...store.nav,
          phase: action.phase,
          ...(action.phase === "title" ? { treeId: null, nodeId: null } : {}),
        },
      };
    case "UPDATE_SETTINGS":
      return { ...store, settings: { ...store.settings, ...action.patch } };
    case "DEBUG_PATCH":
      return { ...store, state: action.patch(store.state) };
    case "DEBUG_JUMP": {
      const t = getTreeOrNull(action.treeId);
      if (!t) return store;
      return enter({ ...store, nav: { ...store.nav, phase: "play" } }, action.treeId, action.nodeId ?? t.startNode);
    }
    case "TRAVEL": {
      // From the map into an encounter (P5-02).
      const t = getTreeOrNull(action.treeId);
      if (!t || !t.brandId) return store;
      return enter({ ...store, nav: { ...store.nav, phase: "play" } }, action.treeId, t.startNode);
    }
    default:
      return store;
  }
}

export type GameStore = StoreState & {
  saveVersion: number;
  hasSave: () => boolean;
  newGame: () => void;
  continueGame: () => boolean;
  toTitle: () => void;
  resetAll: () => void;
  advance: () => void;
  choose: (choice: Choice) => void;
  setPhase: (p: Phase) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  debugPatch: (patch: (s: GameState) => GameState) => void;
  debugJump: (treeId: string, nodeId?: string) => void;
  travelTo: (treeId: string) => void;
};

const GameContext = createContext<GameStore | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [store, dispatch] = useReducer(reducer, initialState);
  const hydratedSettings = useRef(false);

  // Hydrate saved settings once after mount (client only, avoids SSR mismatch).
  useEffect(() => {
    if (hydratedSettings.current) return;
    hydratedSettings.current = true;
    dispatch({ type: "HYDRATE_SETTINGS", settings: loadSettings() });
  }, []);

  const api = useMemo<GameStore>(
    () => ({
      ...store,
      saveVersion: SAVE_VERSION,
      hasSave: () => loadSave() !== null,
      newGame: () => dispatch({ type: "NEW_GAME" }),
      continueGame: () => {
        const env = loadSave();
        if (!env) return false;
        dispatch({ type: "HYDRATE", state: env.state, navigation: env.navigation });
        return true;
      },
      toTitle: () => dispatch({ type: "TO_TITLE" }),
      resetAll: () => dispatch({ type: "RESET_ALL" }),
      advance: () => dispatch({ type: "ADVANCE" }),
      choose: (choice) => dispatch({ type: "CHOOSE", choice }),
      setPhase: (p) => dispatch({ type: "SET_PHASE", phase: p }),
      updateSettings: (patch) => dispatch({ type: "UPDATE_SETTINGS", patch }),
      debugPatch: (patch) => dispatch({ type: "DEBUG_PATCH", patch }),
      debugJump: (treeId, nodeId) => dispatch({ type: "DEBUG_JUMP", treeId, nodeId }),
      travelTo: (treeId) => dispatch({ type: "TRAVEL", treeId }),
    }),
    [store]
  );

  // Autosave every play-phase change (P1-03).
  useEffect(() => {
    if (store.nav.phase !== "play" || !store.nav.treeId || !store.nav.nodeId) return;
    persistSave({ state: store.state, navigation: store.nav });
  }, [store.state, store.nav]);

  // Persist + push settings into the audio manager.
  useEffect(() => {
    persistSettings(store.settings);
    import("@/game/audio/AudioManager").then(({ AudioManager }) => AudioManager.setSettings(store.settings));
  }, [store.settings]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameStore {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame outside <GameProvider>");
  return ctx;
}
