// P6-07 — Content analytics. Per-tree stats + pacing-budget flags.
// Usage: node scripts/content-stats.mjs
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const datesDir = path.join(root, "content", "dates");

// Standing rule R1 pacing: five-beat rhythm floors at ~14 experienced lines
// (~75s of play). The 10-minute-to-reveal math holds easily at this budget.
const LINE_BUDGET = 14;

const rows = [];
for (const f of readdirSync(datesDir).filter((f) => f.endsWith(".json")).sort()) {
  const t = JSON.parse(await readFile(path.join(datesDir, f), "utf8"));
  const nodes = Object.entries(t.nodes ?? {});
  let lines = 0;
  let choiceNodes = 0;
  let choices = 0;
  let beats = new Set();
  for (const [, node] of nodes) {
    // Experienced-line count: default text OR its longest callback variant
    // (callbacks replace text; they're alternatives, not additions).
    let nodeLines = (node.text ?? []).length;
    if (node.callbacks?.length) {
      const longest = Math.max(...node.callbacks.map((c) => (c.text ?? []).length));
      nodeLines = Math.min(nodeLines, longest);
    }
    lines += nodeLines;
    if (node.choices) { choiceNodes++; choices += node.choices.length; }
    // crude beat tagging from ids
    const id = String(node.id ?? "");
    for (const b of ["intro", "impression", "experience", "tension", "memory", "closing", "wrap", "cg"]) {
      if (id.includes(b)) beats.add(b);
    }
  }
  rows.push({ id: t.id, brand: t.brandId ?? "—", loc: t.locationId ?? "—", nodes: nodes.length, lines, choiceNodes, choices });
}

console.log("tree".padEnd(28), "lines  choices  flag");
for (const r of rows) {
  const flag = r.lines > LINE_BUDGET ? `OVER BUDGET (${LINE_BUDGET})` : "";
  console.log(r.id.padEnd(28), String(r.lines).padStart(4), String(r.choiceNodes).padStart(8), flag);
}
const over = rows.filter((r) => r.lines > LINE_BUDGET);
console.log(`\n${rows.length} trees · ${rows.reduce((s, r) => s + r.lines, 0)} lines · ${over.length} over budget`);
process.exit(over.length ? 1 : 0);
