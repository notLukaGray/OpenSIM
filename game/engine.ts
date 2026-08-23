import { archetypes } from "@/content/archetypes";
import { brands } from "@/content/brands";
import { Archetype, Brand, BrandId, GameState, Need, NeedVector, createGameState, needs, zeroNeeds } from "./types";
import { DialogueCallback, DialogueChoice } from "@/dialogueTrees";

export const createGame = createGameState;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function applyChoice(state: GameState, currentTreeId: string, choice: DialogueChoice): GameState {
  const evidence = { ...state.evidence };
  if (choice.playerEffects) {
    needs.forEach((n) => {
      evidence[n] += choice.playerEffects?.[n] ?? 0;
    });
  }

  const brandPerception = { ...state.brandPerception };
  if (choice.brandPerceptionEffects) {
    (Object.keys(choice.brandPerceptionEffects) as BrandId[]).forEach((brandId) => {
      const delta = choice.brandPerceptionEffects?.[brandId];
      if (!delta) return;
      const current = { ...brandPerception[brandId] };
      needs.forEach((n) => {
        current[n] += delta[n] ?? 0;
      });
      brandPerception[brandId] = current;
    });
  }

  const chemistry = { ...state.chemistry };
  if (choice.relationshipEffects) {
    (Object.keys(choice.relationshipEffects) as BrandId[]).forEach((brandId) => {
      chemistry[brandId] += choice.relationshipEffects?.[brandId] ?? 0;
    });
  }

  const choiceLog = { ...state.choiceLog, [currentTreeId]: [...(state.choiceLog[currentTreeId] ?? []), choice.id] };

  return { ...state, evidence, brandPerception, chemistry, choiceLog, choicesMade: state.choicesMade + 1 };
}

// Picks the first callback whose trigger choice id appears in this brand's
// choice log so far, falling back to the node's default lines.
export function resolveLines(defaultText: string[], callbacks: DialogueCallback[] | undefined, choiceLog: string[]): string[] {
  if (!callbacks) return defaultText;
  const match = callbacks.find((c) => choiceLog.includes(c.if));
  return match ? match.text : defaultText;
}

export function markDated(state: GameState, brandId: BrandId): GameState {
  if (state.dated.includes(brandId)) return state;
  return { ...state, dated: [...state.dated, brandId] };
}

// Normalizes accumulated evidence into weights (0..1, summing to 1) that
// represent how much the player has revealed they care about each need,
// regardless of whether they leaned toward or away from it.
export function needWeights(state: GameState): NeedVector {
  const totalAbs = needs.reduce((sum, n) => sum + Math.abs(state.evidence[n]), 0);
  if (totalAbs === 0) return zeroNeeds();
  return Object.fromEntries(needs.map((n) => [n, Math.abs(state.evidence[n]) / totalAbs])) as NeedVector;
}

const normalizeWeights = (v: NeedVector): NeedVector => {
  const total = needs.reduce((sum, n) => sum + v[n], 0);
  if (total === 0) return zeroNeeds();
  return Object.fromEntries(needs.map((n) => [n, v[n] / total])) as NeedVector;
};

export function closestArchetype(weights: NeedVector): Archetype {
  let best = archetypes[0];
  let bestScore = -Infinity;
  for (const a of archetypes) {
    const aw = normalizeWeights(a.weights);
    const score = needs.reduce((sum, n) => sum + weights[n] * aw[n], 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

// A brand's perceivedProfile plus whatever this playthrough discovered about
// it (accumulated brandPerceptionEffects), clamped back into range.
export function effectiveProfile(brand: Brand, perceptionDelta: NeedVector): NeedVector {
  const profile = { ...brand.perceivedProfile };
  needs.forEach((n) => {
    profile[n] = clamp(profile[n] + perceptionDelta[n], -5, 5);
  });
  return profile;
}

// Weighted dot product of player weights (0..1, sum 1) against a brand's
// effective profile (-5..5), mapped onto a 0-100 match score.
export function matchScore(weights: NeedVector, profile: NeedVector): number {
  const raw = needs.reduce((sum, n) => sum + weights[n] * profile[n], 0);
  return Math.round(clamp(((raw + 5) / 10) * 100, 0, 100));
}

export type BrandBreakdown = {
  brand: Brand;
  score: number;
  profile: NeedVector;
  why: { need: Need; contribution: number }[];
  tension: { need: Need; contribution: number }[];
};

// Only ranks brands the player actually dated — scoring a brand the player
// never met would be showing the back-end's opinion, not the player's.
export function rankedBrands(state: GameState, weights: NeedVector): BrandBreakdown[] {
  return brands
    .filter((brand) => state.dated.includes(brand.id))
    .map((brand) => {
      const profile = effectiveProfile(brand, state.brandPerception[brand.id]);
      const score = matchScore(weights, profile);
      const contributions = needs
        .map((n) => ({ need: n, contribution: weights[n] * profile[n] }))
        .filter((c) => Math.abs(c.contribution) > 0.001)
        .sort((a, b) => b.contribution - a.contribution);
      return {
        brand,
        score,
        profile,
        why: contributions.filter((c) => c.contribution > 0).slice(0, 3),
        tension: contributions.filter((c) => c.contribution < 0).slice(0, 2),
      };
    })
    .sort((a, b) => b.score - a.score);
}
