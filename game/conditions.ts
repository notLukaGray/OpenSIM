// Flag-condition evaluation (P1-05). Pure.
import type { Condition } from "@/content/schema";
import { GameState } from "./types";

export function evalCondition(cond: Condition | undefined, state: GameState): boolean {
  if (!cond?.flags) return true;
  const { all, any, none } = cond.flags;
  if (all && !all.every((f) => Boolean(state.flags[f]))) return false;
  if (any && any.length > 0 && !any.some((f) => Boolean(state.flags[f]))) return false;
  if (none && none.some((f) => Boolean(state.flags[f]))) return false;
  return true;
}

/** A pass-through node the renderer may silently skip when its condition fails. */
export const isPassThrough = (node: { choices?: unknown; next?: string }): boolean =>
  !node.choices && typeof node.next === "string";
