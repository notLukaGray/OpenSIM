// Flag/archetype/post-reveal condition evaluation (P1-05, P7-02). Pure.
import type { Condition } from "@/content/schema";
import { GameState } from "./types";

export function evalCondition(cond: Condition | undefined, state: GameState): boolean {
  if (!cond) return true;
  const { flags, archetype, postReveal } = cond;
  if (flags) {
    const { all, any, none } = flags;
    if (all && !all.every((f) => Boolean(state.flags[f]))) return false;
    if (any && any.length > 0 && !any.some((f) => Boolean(state.flags[f]))) return false;
    if (none && none.some((f) => Boolean(state.flags[f]))) return false;
  }
  if (archetype !== undefined) {
    // Only meaningful post-reveal; pre-reveal it fails so variant content hides.
    if (!state.hasSeenReveal || revealedArchetypeId(state) !== archetype) return false;
  }
  if (postReveal !== undefined && postReveal !== state.hasSeenReveal) return false;
  return true;
}

import { closestArchetype } from "./compatibility";

/** Memoized per-state archetype id for condition checks. */
const cache = new WeakMap<GameState, string>();
function revealedArchetypeId(state: GameState): string {
  let id = cache.get(state);
  if (!id) {
    id = closestArchetype(state.evidence).archetype.id;
    cache.set(state, id);
  }
  return id;
}

/** A pass-through node the renderer may silently skip when its condition fails. */
export const isPassThrough = (node: { choices?: unknown; next?: string }): boolean =>
  !node.choices && typeof node.next === "string";
