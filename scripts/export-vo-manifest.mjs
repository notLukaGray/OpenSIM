// P6-04 — VO manifest exporter. Walks every date tree and emits one record per
// dialogue line: its deterministic VO file address (ADR-13) plus the text a
// voice pipeline needs. Output: public/assets/vo/manifest.json
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const datesDir = path.join(root, "content", "dates");
const outPath = path.join(root, "public", "assets", "vo", "manifest.json");

const files = readdirSync(datesDir).filter((f) => f.endsWith(".json")).sort();
const records = [];
const perTree = [];
const textOnlySpeakers = new Set(["PLAYER", "...", "NARRATOR", "JUST THE GYM", "SLEEP"]);

for (const f of files) {
  const tree = JSON.parse(await readFile(path.join(datesDir, f), "utf8"));
  let count = 0;
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    if (textOnlySpeakers.has(node.speaker)) continue;
    (node.text ?? []).forEach((text, lineIndex) => {
      records.push({
        file: `${tree.id}/${nodeId}/${lineIndex}.mp3`,
        treeId: tree.id,
        nodeId,
        lineIndex,
        speaker: node.speaker,
        expression: node.sprite?.expression ?? "neutral",
        brandId: tree.brandId,
        locationId: tree.locationId ?? null,
        text,
      });
      count++;
    });
  }
  perTree.push([tree.id, count]);
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify({ generatedAtEpochNote: "deterministic content only — regenerate after edits", total: records.length, lines: records }, null, 2));

for (const [id, n] of perTree) console.log(`  ${id}: ${n} lines`);
console.log(`✓ ${records.length} voice slots → public/assets/vo/manifest.json (${files.length} trees)`);
