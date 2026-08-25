// Content schema — the shape every JSON file in content/ must satisfy.
// These types are enforced at the registry boundary with `satisfies` and
// semantically by tools/validate-core.mjs (ADR-04, ADR-10).
import { FlagValue, Need, NeedVector } from "@/game/types";

// ─── Flags / conditions ──────────────────────────────────────────────────────
export type FlagCondition = {
  all?: string[];
  any?: string[];
  none?: string[];
};

export type Condition = {
  flags?: FlagCondition;
  /** Whether this brand has already been met in a completed encounter. */
  brand?: { id: string; met: boolean };
  /** Player's revealed archetype id (P7-02 A). True only after the reveal. */
  archetype?: string;
  /** True only once the consumer reveal has been seen (post-reveal content). */
  postReveal?: boolean;
};

// ─── Effects ─────────────────────────────────────────────────────────────────
export type PlayerEffects = Partial<Record<Need, number>>;
export type BrandEffects = Record<string, Partial<NeedVector>>;
export type RelationshipEffects = Record<string, number>;

// ─── Dialogue ────────────────────────────────────────────────────────────────
export type Callback = { if: string; text: string[] };

export type SpriteDirection = {
  /** Which cast slot this touches (assetId). Defaults to the single cast member. */
  assetId?: string;
  position?: "left" | "center" | "right";
  expression?: string;
  effect?: "enter" | "exit" | "none";
};

/** A dialogue choice. */
export type Choice = {
  id: string;
  text: string;
  next?: string;
  nextTree?: string;
  playerEffects?: PlayerEffects;
  brandPerceptionEffects?: BrandEffects;
  relationshipEffects?: RelationshipEffects;
  setFlags?: string[];
  conditions?: Condition;
};

export type DialogueNode = {
  speaker: string;
  text: string[];
  sprite?: SpriteDirection;
  background?: string;
  music?: string;
  cg?: string;
  evidence?: string;
  callbacks?: Callback[];
  conditions?: Condition;
  next?: string;
  choices?: Choice[];
  nextTree?: string;
};

// ─── Dates ───────────────────────────────────────────────────────────────────
export type DateContext = {
  location: string;
  occasion: string;
};

export type CastMember = {
  assetId: string;
  position: "left" | "center" | "right";
  /** Optional display name for a human proxy (for example, ZYN's Counsel). */
  name?: string;
};

export type DateTree = {
  id: string;
  brandId: string | null; // null for the hub
  title: string;
  /** Which place this encounter happens at (content/locations.json). */
  locationId?: string;
  context: DateContext | null;
  music: string | null;
  background: string | null;
  cast: CastMember[];
  startNode: string;
  /** Nodes reached dynamically by the engine (not via static edges), e.g. hub "all-done". */
  entryPoints?: string[];
  nodes: Record<string, DialogueNode>;
};

export type Source = {
  id: string;
  title: string;
  publisher: string;
  year?: number;
  url?: string;
};

// ─── Locations ───────────────────────────────────────────────────────────────
export type GameLocation = {
  id: string;
  name: string;
  blurb: string;
  background: string;
  music: string;
  color: string;
  map: { x: number; y: number }; // percentages of the stage
};

// ─── Brands ──────────────────────────────────────────────────────────────────
export type Brand = {
  id: string;
  name: string;
  archetype: string;
  color: string;
  sigil: string;
  setting: string;
  personality: string;
  claimedProfile: NeedVector;
  perceivedProfile: NeedVector;
  /** True for non-brand encounters (Sleep, the Gym) — excluded from ranked matching (P8-01). */
  unbranded?: boolean;
  /** Explicitly opt a product into the consumer-facing recommendation portfolio. */
  recommendationEligible?: boolean;
};

/** Convenience: is this roster entry one of the unbranded wilds? */
export const isUnbranded = (b: Brand): boolean => Boolean(b.unbranded);

// ─── Archetypes ──────────────────────────────────────────────────────────────
export type Archetype = {
  id: string;
  name: string;
  description: string;
  weights: NeedVector;
};

// ─── Modifiers ───────────────────────────────────────────────────────────────
export type ModifierWhen = {
  location?: string;
  occasion?: string;
  dateId?: string;
  hasFlag?: string;
};

export type Modifier = {
  id: string;
  appliesTo: string[];
  when: ModifierWhen;
  effects: Partial<NeedVector>;
  label: string;
};

// ─── Evidence ────────────────────────────────────────────────────────────────
export type EvidenceType =
  | "ad"
  | "campaign"
  | "product"
  | "culture"
  | "retail"
  | "social";

export type Evidence = {
  id: string;
  brandId: string;
  type: EvidenceType;
  title: string;
  description: string;
  /** Optional — cards render as designed typography when absent (P6-01 path). */
  imageRef?: string;
  sourceIds?: string[];
  /** Reinforces or challenges perception; applied once on first unlock. */
  effects: Partial<NeedVector>;
};

// ─── Assets ──────────────────────────────────────────────────────────────────
export type AssetType =
  | `character-${"neutral" | "happy" | "annoyed" | "embarrassed" | "special"}`
  | "background"
  | "cg"
  | "logo"
  | "ui"
  | "evidence-imagery"
  | "silhouette";

export type AssetReference = {
  id: string;
  type: AssetType;
  src: string;
  alt?: string;
  preload?: boolean;
  fallback?: string;
};

// ─── Audio ───────────────────────────────────────────────────────────────────
export type AudioKind = "music" | "sfx";

export type AudioTrack = {
  id: string;
  kind: AudioKind;
  src: string;
  loop: boolean;
  /** Relative gain for this track within its bus (0..1). */
  volume: number;
};

// Re-exports so consumers can import the whole vocabulary from one place.
export type { FlagValue, Need, NeedVector };
