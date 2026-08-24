// Compatibility & reveal math (P1-06, ADR-08). Pure functions over state.
import { archetypes, brands, getBrandOrNull } from "@/content/registry";
import type { Archetype } from "@/content/schema";
import { activeModifiers, applyModifierStack, ModifierContext } from "./modifiers";
import { GameState, Need, NeedVector, TENSION_WEIGHT } from "./types";

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
    for (const n of Object.keys(deltas) as Need[]) withDeltas[n] += deltas[n];
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
    .filter((b) => !b.unbranded)
    .map((brand) => ({
      brandId: brand.id,
      dated: state.dated.includes(brand.id),
      profile: effectiveProfile(brand.id, state, ctx),
      ...matchBreakdown(weights, effectiveProfile(brand.id, state, ctx)),
    }))
    .sort((a, b) => b.score - a.score);
}
