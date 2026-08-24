// CLI content validator (ADR-10). Loads every JSON under content/, runs the
// shared rule-set in tools/validate-core.mjs, prints precise diagnostics.
// Exit 0 = valid; exit 1 = errors. Wired as `prebuild`.
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "../tools/validate-core.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentDir = path.join(root, "content");
const datesDir = path.join(contentDir, "dates");

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function tag(items, relFile) {
  return items.map((it) => ({ ...it, file: relFile }));
}

const brands = await loadJson(path.join(contentDir, "brands.json"));
const archetypes = await loadJson(path.join(contentDir, "archetypes.json"));
const modifiers = await loadJson(path.join(contentDir, "modifiers.json"));
const evidence = await loadJson(path.join(contentDir, "evidence.json"));
const assetsJson = await loadJson(path.join(contentDir, "assets.json"));
const audioTracks = await loadJson(path.join(contentDir, "audio.json"));
const locations = await loadJson(path.join(contentDir, "locations.json"));
let sources = [];
try { sources = await loadJson(path.join(contentDir, "sources.json")); } catch {}
let charactersGenerated = [];
try {
  charactersGenerated = await loadJson(path.join(contentDir, "asset-characters.generated.json"));
} catch { /* generator not yet run */ }
const assets = [...assetsJson, ...charactersGenerated];

const dateFiles = readdirSync(datesDir).filter((f) => f.endsWith(".json")).sort();
const trees = [];
for (const f of dateFiles) {
  const t = await loadJson(path.join(datesDir, f));
  trees.push({ ...t, file: `content/dates/${f}` });
}

const bundle = {
  brands: tag(brands, "content/brands.json"),
  archetypes: tag(archetypes, "content/archetypes.json"),
  modifiers: tag(modifiers, "content/modifiers.json"),
  evidence: tag(evidence, "content/evidence.json"),
  assets: tag(assets, "content/assets.json"),
  audioTracks: tag(audioTracks, "content/audio.json"),
  locations: tag(locations, "content/locations.json"),
  sources: tag(sources, "content/sources.json"),
  trees,
};

const result = validateContent(bundle);

if (result.warnings.length) {
  console.log(`\nWarnings (${result.warnings.length}):`);
  for (const w of result.warnings)
    console.log(`  ⚠ ${w.file} :: ${w.path}\n     ${w.message}`);
}
if (result.errors.length) {
  console.error(`\n✗ Content validation FAILED — ${result.errors.length} error(s):\n`);
  for (const e of result.errors)
    console.error(`  ✗ ${e.file} :: ${e.path}\n     ${e.message}`);
  console.error("\nFix the content. Do not weaken the validator (AGENTS.md rule 4).");
  process.exit(1);
} else {
  const counts = [
    `${bundle.brands.length} brands`,
    `${bundle.trees.length} trees`,
    `${bundle.assets.length} assets`,
    `${bundle.audioTracks.length} tracks`,
    `${bundle.evidence.length} evidence`,
    `${bundle.modifiers.length} modifiers`,
  ].join(", ");
  console.log(`✓ Content valid — ${counts}${result.warnings.length ? ` (+${result.warnings.length} warnings)` : ""}`);
}
