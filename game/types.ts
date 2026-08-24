// ─── The shared vocabulary (ADR-03) ──────────────────────────────────────────
// One set of emotional needs organizes players, brands, archetypes, evidence,
// and modifiers. Defined ONCE here; mirrored by tools/validate-core.mjs.

export const needs = [
  "control",
  "readiness",
  "reassurance",
  "aspiration",
  "belonging",
  "mastery",
  "comfort",
  "excitement",
  "selfExpression",
  "trust",
] as const;

export type Need = (typeof needs)[number];
export type NeedVector = Record<Need, number>;

/** Human-facing labels for UI surfaces (reveal screens, debug panel). */
export const NEED_LABELS: Record<Need, string> = {
  control: "control",
  readiness: "readiness",
  reassurance: "reassurance",
  aspiration: "aspiration",
  belonging: "belonging",
  mastery: "mastery",
  comfort: "comfort",
  excitement: "excitement",
  selfExpression: "self-expression",
  trust: "trust",
};

export const zeroNeeds = (): NeedVector =>
  Object.fromEntries(needs.map((n) => [n, 0])) as NeedVector;

/** Brand/archetype profile range. */
export const PROFILE_MIN = -5;
export const PROFILE_MAX = 5;
/** Per-choice player-evidence magnitude cap (validator-enforced). */
export const EFFECT_CAP = 3;
/** Asymmetric weight applied to negative compatibility contributions (ADR-08). */
export const TENSION_WEIGHT = 1.5;

export const clampNeed = (n: number): number =>
  Math.max(PROFILE_MIN, Math.min(PROFILE_MAX, n));

// ─── Save envelope (ADR-09) ──────────────────────────────────────────────────
export const SAVE_VERSION = 2;
export const SAVE_KEY = "dsim.save.v1";
export const SETTINGS_KEY = "dsim.settings.v1";

// Player + brand state lives under one versioned envelope so a shape change is
// a version bump, not archaeology.
export type FlagValue = boolean | number | string;
export type FlagMap = Record<string, FlagValue>;

export type GameState = {
  /** What the player's choices reveal about them. Hidden until the reveal. */
  evidence: NeedVector;
  /** Per-brand discovered deltas from date choices (ADR-01). Base never mutates. */
  brandPerception: Record<string, NeedVector>;
  /** Flavor-only chemistry per brand. Never feeds compatibility (ADR-02). */
  chemistry: Record<string, number>;
  /** Choice ids made per tree id — powers callbacks and conditions. */
  choiceLog: Record<string, string[]>;
  flags: FlagMap;
  unlockedEvidence: string[];
  /** Brands whose dates completed this run. */
  dated: string[];
  choicesMade: number;
};

export const createGameState = (): GameState => ({
  evidence: zeroNeeds(),
  brandPerception: {},
  chemistry: {},
  choiceLog: {},
  flags: {},
  unlockedEvidence: [],
  dated: [],
  choicesMade: 0,
});

export type Phase = "title" | "play" | "reveal" | "match";

/** Where the player is; play-phase position persists inside the save. */
export type Navigation = {
  phase: Phase;
  treeId: string | null;
  nodeId: string | null;
};

export type Settings = {
  master: number; // 0..1
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
  /** Dialogue characters per second (typewriter). */
  textSpeed: number;
};

export const defaultSettings = (): Settings => ({
  master: 0.8,
  music: 0.7,
  sfx: 0.8,
  muted: false,
  textSpeed: 45,
});

export type SaveEnvelope = {
  version: number;
  savedAt: string;
  state: GameState;
  navigation: Navigation;
};
