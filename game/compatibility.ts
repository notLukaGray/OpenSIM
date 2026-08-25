// Compatibility & reveal math (P1-06, ADR-08). Pure functions over state.
import { archetypes, brands, getBrandOrNull, getTree } from "@/content/registry";
import type { Archetype } from "@/content/schema";
import { activeModifiers, applyModifierStack, ModifierContext } from "./modifiers";
import { GameState, Need, NeedVector, REVEAL_MIN_ENCOUNTERS, REVEAL_TARGET_ENCOUNTERS, TENSION_WEIGHT, clampNeed, needs, zeroNeeds } from "./types";

/**
 * Normalizes accumulated |evidence| into weights summing to 1 — how much the
 * player revealed they care about each need, direction-independent.
 */
export function needWeights(state: GameState): NeedVector {
  const entries = (Object.keys(state.evidence) as Need[]).map((n) => [n, Math.abs(state.evidence[n])] as const);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return Object.fromEntries(entries.map(([n]) => [n, 0])) as NeedVector;
  return Object.fromEntries(entries.map(([n, v]) => [n, v / total])) as NeedVector;
}

/** Player's top needs by revealed weight, descending. */
export function topNeeds(weights: NeedVector, count = 3): Need[] {
  return (Object.keys(weights) as Need[])
    .sort((a, b) => weights[b] - weights[a] || a.localeCompare(b))
    .slice(0, count)
    .filter((n) => weights[n] > 0);
}

const normalizeWeights = (v: NeedVector): NeedVector => {
  const total = (Object.keys(v) as Need[]).reduce((s, n) => s + Math.max(0, v[n]), 0);
  if (total === 0) return v;
  return Object.fromEntries(
    (Object.keys(v) as Need[]).map((n) => [n, Math.max(0, v[n]) / total])
  ) as NeedVector;
};

/** Closest consumer archetype by weighted overlap with normalized targets. */
export function closestArchetype(weights: NeedVector): { archetype: Archetype; fit: number } {
  const w = normalizeWeights(weights);
  let best = archetypes[0];
  let bestScore = -Infinity;
  for (const a of archetypes) {
    const target = normalizeWeights(a.weights);
    const score = (Object.keys(w) as Need[]).reduce((sum, n) => sum + w[n] * target[n], 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return { archetype: best, fit: bestScore };
}

/**
 * Perceived profile + discovered deltas + live context modifiers (ADR-01/07),
 * clamped to ±5. Base profiles are never touched.
 */
export function effectiveProfile(brandId: string, state: GameState, ctx?: ModifierContext): NeedVector {
  const brand = getBrandOrNull(brandId);
  if (!brand) throw new Error(`effectiveProfile: unknown brand "${brandId}"`);
  const base = brand.perceivedProfile;
  const deltas = state.brandPerception[brandId];
  const withDeltas = { ...base };
  if (deltas)
    for (const n of Object.keys(deltas) as Need[]) withDeltas[n] = clampNeed(withDeltas[n] + deltas[n]);
  if (!ctx) return withDeltas;
  return applyModifierStack(withDeltas, activeModifiers(brandId, ctx));
}

export type Contribution = { need: Need; contribution: number };

export type MatchBreakdown = {
  score: number;
  why: Contribution[];
  tension: Contribution[];
};

/**
 * Weighted compatibility with ASYMMETRIC tension (ADR-08): negative
 * contributions count TENSION_WEIGHT× against the match, so a strong brand
 * negative colliding with an important player need hurts more than the
 * equivalent positive helps. Mapped onto 0–100.
 */
export function matchBreakdown(weights: NeedVector, profile: NeedVector): MatchBreakdown {
  const contributions = (Object.keys(weights) as Need[]).map((n) => ({
    need: n,
    contribution: weights[n] * profile[n],
  }));
  const raw = contributions.reduce(
    (sum, c) => sum + (c.contribution < 0 ? c.contribution * TENSION_WEIGHT : c.contribution),
    0
  );
  const score = Math.max(0, Math.min(100, Math.round(((raw + 5) / 10) * 100)));
  const sorted = [...contributions].sort((a, b) => b.contribution - a.contribution);
  return {
    score,
    why: sorted.filter((c) => c.contribution > 0.001).slice(0, 3),
    tension: sorted.filter((c) => c.contribution < -0.001).reverse().slice(0, 2),
  };
}

export type BrandMatch = {
  brandId: string;
  dated: boolean;
  profile: NeedVector;
} & MatchBreakdown;

/**
 * Every ranked brand best-first (P8-01: unbranded wilds are baseline — they
 * arm comparison lines, never compete). Undated ones flagged `dated:false`.
 */
export function rankAllBrands(state: GameState, weights: NeedVector, ctx?: ModifierContext): BrandMatch[] {
  return brands
    // The recommendation portfolio is content-owned. A historical or
    // unbranded roster record cannot leak into the consumer-facing answer.
    .filter((b) => !b.unbranded && b.recommendationEligible)
    .map((brand) => ({
      brandId: brand.id,
      dated: state.dated.includes(brand.id),
      profile: effectiveProfile(brand.id, state, ctx),
      ...matchBreakdown(weights, effectiveProfile(brand.id, state, ctx)),
    }))
    .sort((a, b) => b.score - a.score);
}

type RankedArchetype = { archetype: Archetype; fit: number };

function rankArchetypes(weights: NeedVector): RankedArchetype[] {
  const normalized = normalizeWeights(weights);
  return archetypes
    .map((archetype) => {
      const target = normalizeWeights(archetype.weights);
      return {
        archetype,
        fit: (Object.keys(normalized) as Need[]).reduce((sum, need) => sum + normalized[need] * target[need], 0),
      };
    })
    .sort((a, b) => b.fit - a.fit);
}

/** Rebuild a subset of player evidence from the persisted choice log. */
function evidenceForTrees(state: GameState, excludedTreeId?: string): NeedVector {
  const evidence = zeroNeeds();
  for (const [treeId, choiceIds] of Object.entries(state.choiceLog)) {
    if (treeId === excludedTreeId) continue;
    try {
      const tree = getTree(treeId);
      for (const node of Object.values(tree.nodes))
        for (const choice of node.choices ?? [])
          if (choiceIds.includes(choice.id))
            for (const [need, amount] of Object.entries(choice.playerEffects ?? {}))
              evidence[need as Need] += amount ?? 0;
    } catch {
      // A removed tree should not make an old save unrevealable.
    }
  }
  return evidence;
}

function mostDisputedNeed(first: Archetype, second: Archetype): Need {
  return [...needs]
    .sort((a, b) => Math.abs(second.weights[b] - first.weights[b]) - Math.abs(second.weights[a] - first.weights[a]))[0];
}

export type AuditReadiness = {
  encounters: number;
  choices: number;
  locations: number;
  archetypeMargin: number;
  recommendationMargin: number;
  stableArchetype: boolean;
  stableRecommendation: boolean;
  canReveal: boolean;
  confident: boolean;
  disputedNeed: Need | null;
};

/**
 * The reveal is a confidence decision, not a fixed-date counter. It checks
 * whether removing any one completed encounter changes either conclusion.
 * This stays pure and derives its history from choiceLog, so saves keep their
 * existing shape.
 */
export function auditReadiness(state: GameState): AuditReadiness {
  const completed = state.completedTrees;
  const choices = completed.reduce((total, id) => total + (state.choiceLog[id]?.length ?? 0), 0);
  const locations = new Set(completed.map((id) => {
    try { return getTree(id).locationId; } catch { return undefined; }
  }).filter(Boolean)).size;
  const evidence = evidenceForTrees(state);
  const weights = needWeights({ ...state, evidence });
  const archetypesRanked = rankArchetypes(weights);
  const recommendationContext = { flags: state.flags };
  const brandRanked = rankAllBrands({ ...state, evidence }, weights, recommendationContext);
  const topArchetype = archetypesRanked[0];
  const topBrand = brandRanked[0];
  const archetypeMargin = topArchetype ? topArchetype.fit - (archetypesRanked[1]?.fit ?? 0) : 0;
  const recommendationMargin = topBrand ? topBrand.score - (brandRanked[1]?.score ?? 0) : 0;
  let stableArchetype = Boolean(topArchetype);
  let stableRecommendation = Boolean(topBrand);

  for (const treeId of completed) {
    const leaveOneOutEvidence = evidenceForTrees(state, treeId);
    const leaveOneOutWeights = needWeights({ ...state, evidence: leaveOneOutEvidence });
    if (rankArchetypes(leaveOneOutWeights)[0]?.archetype.id !== topArchetype?.archetype.id) stableArchetype = false;
    if (rankAllBrands({ ...state, evidence: leaveOneOutEvidence }, leaveOneOutWeights, recommendationContext)[0]?.brandId !== topBrand?.brandId)
      stableRecommendation = false;
  }

  const enoughBreadth = choices >= 6 && locations >= 3;
  const confident = completed.length >= REVEAL_MIN_ENCOUNTERS && enoughBreadth && stableArchetype && stableRecommendation;
  return {
    encounters: completed.length,
    choices,
    locations,
    archetypeMargin,
    recommendationMargin,
    stableArchetype,
    stableRecommendation,
    canReveal: confident || completed.length >= REVEAL_TARGET_ENCOUNTERS,
    confident,
    disputedNeed: archetypesRanked.length > 1 ? mostDisputedNeed(archetypesRanked[0].archetype, archetypesRanked[1].archetype) : null,
  };
}
