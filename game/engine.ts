// Pure story-engine transforms. Knows zero plot; everything content-shaped
// arrives via arguments (ADR-04).
import { getEvidence, getTree } from "@/content/registry";
import type { Choice, DateTree, DialogueNode } from "@/content/schema";
import { evalCondition, isPassThrough } from "./conditions";
import { GameState, NeedVector, zeroNeeds } from "./types";

const addInto = (target: NeedVector, delta?: Partial<NeedVector>) => {
  if (!delta) return;
  for (const n of Object.keys(delta) as (keyof NeedVector)[]) target[n] += delta[n] ?? 0;
};

/** Apply a choice's full ledger to state (P1-03). */
export function applyChoice(state: GameState, treeId: string, choice: Choice): GameState {
  const evidence = { ...state.evidence };
  addInto(evidence, choice.playerEffects);

  const brandPerception = { ...state.brandPerception };
  for (const [brandId, delta] of Object.entries(choice.brandPerceptionEffects ?? {})) {
    const current = { ...(brandPerception[brandId] ?? zeroNeeds()) };
    addInto(current, delta);
    brandPerception[brandId] = current;
  }

  const chemistry = { ...state.chemistry };
  for (const [brandId, delta] of Object.entries(choice.relationshipEffects ?? {}))
    chemistry[brandId] = (chemistry[brandId] ?? 0) + delta;

  const flags = { ...state.flags };
  for (const f of choice.setFlags ?? []) flags[f] = true;

  const choiceLog = {
    ...state.choiceLog,
    [treeId]: [...(state.choiceLog[treeId] ?? []), choice.id],
  };

  const next = {
    ...state,
    evidence,
    brandPerception,
    chemistry,
    flags,
    choiceLog,
    choicesMade: state.choicesMade + 1,
  };
  return applyEvidenceById(next, choice.evidence);
}

/**
 * First-time render of a node: unlocks its evidence card and applies the
 * evidence's perception effects once (reinforcing or challenging perception —
 * brief §4). Returns unchanged state if already unlocked / no evidence.
 */
export function applyEvidenceUnlock(state: GameState, node: DialogueNode): GameState {
  return applyEvidenceById(state, node.evidence);
}

/** First-time evidence application shared by node and choice material beats. */
function applyEvidenceById(state: GameState, evidenceId?: string): GameState {
  if (!evidenceId || state.unlockedEvidence.includes(evidenceId)) return state;
  const ev = getEvidence(evidenceId); // throws loudly on unknown id
  const brandPerception = { ...state.brandPerception };
  const current = { ...(brandPerception[ev.brandId] ?? zeroNeeds()) };
  addInto(current, ev.effects);
  brandPerception[ev.brandId] = current;
  return { ...state, brandPerception, unlockedEvidence: [...state.unlockedEvidence, evidenceId] };
}

/**
 * Resolve the effective next position after `node`: follows `next`, skipping
 * pass-through nodes whose conditions fail; returns null when the tree hands
 * control to choices or exits via nextTree.
 */
export function resolveForward(tree: DateTree, nodeId: string | undefined, state: GameState): string | null {
  let cursor = nodeId ? tree.nodes[nodeId] : undefined;
  let guard = 0;
  while (cursor && isPassThrough(cursor) && !evalCondition(cursor.conditions, state)) {
    if (++guard > 100) throw new Error(`resolveForward: condition skip loop in "${tree.id}"`);
    cursor = cursor.next ? tree.nodes[cursor.next] : undefined;
  }
  return cursor ? (Object.keys(tree.nodes).find((id) => tree.nodes[id] === cursor) ?? null) : null;
}

/**
 * Callback resolution: first callback whose `if` matches any earlier choice in
 * this tree replaces the node's default lines (brief §6).
 */
export function resolveLines(
  defaultText: string[],
  callbacks: { if: string; text: string[] }[] | undefined,
  choiceLog: string[]
): string[] {
  if (!callbacks) return defaultText;
  const match = callbacks.find((c) => choiceLog.includes(c.if));
  return match ? match.text : defaultText;
}

export function markDated(state: GameState, brandId: string): GameState {
  if (!brandId || state.dated.includes(brandId)) return state;
  return { ...state, dated: [...state.dated, brandId] };
}

/** Completing an ENCOUNTER (tree). Meeting a brand anywhere marks it dated. */
export function markCompleted(state: GameState, treeId: string, brandId: string | null): GameState {
  if (state.completedTrees.includes(treeId)) return state;
  const next = { ...state, completedTrees: [...state.completedTrees, treeId] };
  return markDated(next, brandId ?? "");
}

/**
 * Hide choices leading to encounters already completed this run. Brands may
 * appear at multiple locations — completing one appearance never hides another.
 */
export function filterCompletedDates(choices: Choice[] | undefined, state: GameState): Choice[] | undefined {
  if (!choices) return choices;
  return choices.filter((c) => {
    if (!c.nextTree) return true;
    try {
      const t = getTree(c.nextTree);
      return !state.completedTrees.includes(t.id);
    } catch {
      return true;
    }
  });
}
