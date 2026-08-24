// Modifier resolution (ADR-07): context activates modifiers; they stack onto a
// profile at READ time only. Nothing here mutates stored state or base profiles.
import type { Modifier } from "@/content/schema";
import { modifiers } from "@/content/registry";
import { NeedVector, clampNeed } from "./types";

/** Everything that can activate a modifier right now. */
export type ModifierContext = {
  treeId?: string;
  location?: string;
  occasion?: string;
  flags: Record<string, boolean | number | string>;
};

const matches = (m: Modifier, ctx: ModifierContext): boolean => {
  const w = m.when;
  if (w.location !== undefined && w.location !== ctx.location) return false;
  if (w.occasion !== undefined && w.occasion !== ctx.occasion) return false;
  if (w.dateId !== undefined && w.dateId !== ctx.treeId) return false;
  if (w.hasFlag !== undefined && !ctx.flags[w.hasFlag]) return false;
  return true;
};

/**
 * Modifiers applying to `brandId` in this context, in deterministic registry
 * order, each at most once.
 */
export function activeModifiers(brandId: string, ctx: ModifierContext): Modifier[] {
  return modifiers.filter((m) => m.appliesTo.includes(brandId) && matches(m, ctx));
}

/** Additive stack, clamped into the ±5 profile range, as a fresh vector. */
export function applyModifierStack(base: NeedVector, mods: Modifier[]): NeedVector {
  const out = { ...base };
  for (const m of mods)
    for (const [need, delta] of Object.entries(m.effects))
      out[need as keyof NeedVector] = clampNeed(out[need as keyof NeedVector] + (delta ?? 0));
  return out;
}
