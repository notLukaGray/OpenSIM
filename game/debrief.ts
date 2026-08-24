// Date debrief (P6-02): what this encounter changed, computed purely from
// state — the marketing lesson lands immediately after the date.
import type { DateTree } from "@/content/schema";
import { getBrandOrNull } from "@/content/registry";
import type { Choice } from "@/content/schema";
import { GameState, NEED_LABELS, Need } from "./types";

export type Debrief = {
  treeTitle: string;
  brandName: string;
  brandColor: string;
  needDeltas: Array<{ need: Need; delta: number }>;
  perception: Array<{ label: string; text: string }>;
  chemistry: Array<{ brand: string; delta: number }>;
  choices: string[];
};

export function summarizeDate(tree: DateTree, state: GameState): Debrief {
  const choiceIds = state.choiceLog[tree.id] ?? [];
  const needTotals = new Map<Need, number>();
  const percTotals = new Map<string, Map<string, number>>();
  const chemTotals = new Map<string, number>();

  for (const nodeId of Object.keys(tree.nodes)) {
    for (const ch of tree.nodes[nodeId].choices ?? []) {
      if (!choiceIds.includes(ch.id)) continue;
      for (const [n, v] of Object.entries(ch.playerEffects ?? {}))
        needTotals.set(n as Need, (needTotals.get(n as Need) ?? 0) + (v ?? 0));
      for (const [bid, vec] of Object.entries(ch.brandPerceptionEffects ?? {})) {
        const m = percTotals.get(bid) ?? new Map();
        for (const [n, v] of Object.entries(vec ?? {})) m.set(n, (m.get(n) ?? 0) + (v ?? 0));
        percTotals.set(bid, m);
      }
      for (const [bid, v] of Object.entries(ch.relationshipEffects ?? {}))
        chemTotals.set(bid, (chemTotals.get(bid) ?? 0) + v);
    }
  }

  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return {
    treeTitle: tree.title,
    brandName: tree.brandId ? (getBrandOrNull(tree.brandId)?.name ?? "") : "",
    brandColor: tree.brandId ? (getBrandOrNull(tree.brandId)?.color ?? "#f2b8c6") : "#f2b8c6",
    needDeltas: [...needTotals.entries()]
      .filter(([, v]) => v !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([need, delta]) => ({ need, delta })),
    perception: [...percTotals.entries()].map(([bid, m]) => ({
      label: getBrandOrNull(bid)?.name ?? bid,
      text: [...m.entries()].filter(([, v]) => v !== 0).map(([n, v]) => `${NEED_LABELS[n as Need]} ${signed(v)}`).join(", ") || "unchanged",
    })),
    chemistry: [...chemTotals.entries()].map(([brand, delta]) => ({ brand, delta })),
    choices: choiceIds,
  };
}
