// Attaches each evidence card to a sensible node in its brand's trees so the
// [MEMORY UNLOCKED] moments appear in play. Deterministic; hand-tune after.
// Usage: node scripts/attach-evidence.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const datesDir = path.join(root, "content", "dates");
const contentDir = path.join(root, "content");

const evidence = JSON.parse(readFileSync(path.join(contentDir, "evidence.json"), "utf8"));
const byBrand = new Map();
for (const e of evidence) {
  if (!byBrand.has(e.brandId)) byBrand.set(e.brandId, []);
  byBrand.get(e.brandId).push(e);
}

const assignments = [];
for (const f of readdirSync(datesDir).filter((f) => f.endsWith(".json")).sort()) {
  const file = path.join(datesDir, f);
  const tree = JSON.parse(readFileSync(file, "utf8"));
  const cards = byBrand.get(tree.id) ?? byBrand.get(tree.brandId);
  if (!cards?.length || !tree.brandId) continue;
  // skip trees already carrying this card
  const already = Object.values(tree.nodes).some((n) => n.evidence && cards.some((c) => c.id === n.evidence));
  if (already) continue;

  // prefer an existing memory/experience node; else the node right after start
  const nodeIds = Object.keys(tree.nodes);
  let target = nodeIds.find((id) => /memory|experience/.test(id)) ?? nodeIds[1] ?? nodeIds[0];
  // avoid overwriting an existing evidence reference
  for (let guard = 0; tree.nodes[target]?.evidence && guard < nodeIds.length; guard++) {
    target = nodeIds[(nodeIds.indexOf(target) + 1) % nodeIds.length];
  }
  if (tree.nodes[target].evidence) continue;

  const card = cards[assignIndex(tree.id, cards.length)];
  tree.nodes[target].evidence = card.id;
  writeFileSync(file, JSON.stringify(tree, null, 2));
  assignments.push(`${card.id} → ${tree.id}/${target}`);
}

function assignIndex(treeId, mod) {
  let h = 0;
  for (const ch of treeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % mod;
}

console.log(assignments.length ? assignments.join("\n") : "no attachments needed");
