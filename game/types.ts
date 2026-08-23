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
export const zeroNeeds = (): NeedVector => Object.fromEntries(needs.map((n) => [n, 0])) as NeedVector;

export type BrandId = "liquid-iv" | "whoop" | "celsius" | "ag1";
export const brandIds: BrandId[] = ["liquid-iv", "whoop", "celsius", "ag1"];

export type Brand = {
  id: BrandId;
  name: string;
  archetype: string;
  color: string;
  sigil: string;
  setting: string;
  // What the brand wants you to believe about it.
  claimedProfile: NeedVector;
  // What people broadly seem to believe about it, before any date-specific discovery.
  perceivedProfile: NeedVector;
};

export type ArchetypeId = "optimizer" | "pragmatist" | "ritualist" | "striver" | "socialExplorer";
export type Archetype = { id: ArchetypeId; name: string; description: string; weights: NeedVector };

export type GameState = {
  // What the player's choices reveal about them.
  evidence: NeedVector;
  // Per-brand deltas discovered during that brand's date — layered on top of
  // its perceivedProfile at match time. Distinct from `evidence`: this is
  // what changed about the player's perception of the brand, not the brand itself.
  brandPerception: Record<BrandId, NeedVector>;
  // Flavor-only chemistry per brand, from relationshipEffects. Never feeds match score.
  chemistry: Record<BrandId, number>;
  // Ids of choices made so far, in order, keyed by whichever dialogue tree
  // they happened in (a BrandId during a date, or "home" in the hub) — lets
  // a later node (e.g. a closing) callback to something specific the player said.
  choiceLog: Record<string, string[]>;
  dated: BrandId[];
  choicesMade: number;
};

export const createGameState = (): GameState => ({
  evidence: zeroNeeds(),
  brandPerception: Object.fromEntries(brandIds.map((id) => [id, zeroNeeds()])) as Record<BrandId, NeedVector>,
  chemistry: Object.fromEntries(brandIds.map((id) => [id, 0])) as Record<BrandId, number>,
  choiceLog: {},
  dated: [],
  choicesMade: 0,
});
