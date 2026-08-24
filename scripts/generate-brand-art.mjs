// Generates character sprites for every brand in the BRANDS table below
// (deterministic, flat-vector, same visual language as the baseline set).
// Writes SVGs to public/assets/characters/ AND emits
// content/asset-characters.generated.json for the asset registry merge.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "public", "assets", "characters");
const manifestOut = path.join(root, "content", "asset-characters.generated.json");

const EXPRESSIONS = [
  ["neutral", { tilt: 0, marks: "" }],
  ["happy", { tilt: -3, marks: `<path d="M-26 -118 q10 -12 20 -4" stroke="ACCENT" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M6 -122 q10 -8 20 2" stroke="ACCENT" stroke-width="5" fill="none" stroke-linecap="round"/>` }],
  ["annoyed", { tilt: 4, marks: `<rect x="-30" y="-132" width="24" height="7" fill="#0b0e17" opacity="0.55" transform="rotate(-8 -18 -128)"/><rect x="4" y="-130" width="24" height="7" fill="#0b0e17" opacity="0.55" transform="rotate(8 16 -126)"/>` }],
  ["embarrassed", { tilt: -2, marks: `<ellipse cx="-22" cy="-108" rx="16" ry="9" fill="ACCENT" opacity="0.35"/><ellipse cx="22" cy="-108" rx="16" ry="9" fill="ACCENT" opacity="0.35"/>` }],
  ["special", { tilt: 0, marks: `<g fill="ACCENT"><circle cx="0" cy="-150" r="4"/><circle cx="34" cy="-140" r="3"/><circle cx="-36" cy="-136" r="3"/></g>` }],
];

const BRANDS = [
  ["sleep", "#b8b5e8"],
  ["gym", "#c97b4a"],
  ["starbucks", "#00a862"],
  ["oura", "#c9a7eb"],
  ["zen", "#9fd8cb"],
  ["red-bull", "#db0a40"],
  ["eight-sleep", "#4cc3ff"],
  ["liquid-death", "#e5e3df"],
  ["white-claw", "#37b6ff"],
  ["athletic-brewing", "#f0a35e"],
  ["zyn", "#baf5c0"],
  ["na-spirits", "#b9c99a"],
];

function sprite(brand, accent, [expr, cfg]) {
  const tilt = cfg.tilt;
  const marks = cfg.marks.replaceAll("ACCENT", accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100">
<defs>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#232a44"/><stop offset="1" stop-color="#10131f"/>
</linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${accent}" stop-opacity="0.95"/><stop offset="1" stop-color="${accent}" stop-opacity="0.25"/>
</linearGradient>
</defs>
<g transform="rotate(${tilt} 450 700)">
<path d="M450 250 m-120 0 a120 128 0 1 0 240 0 a120 128 0 1 0 -240 0" fill="url(#body)"/>
<path d="M450 372 c-190 40 -260 210 -270 520 h540 c-10 -310 -80 -480 -270 -520 z" fill="url(#body)"/>
<path d="M330 250 a120 128 0 0 1 240 0" fill="none" stroke="url(#rim)" stroke-width="10"/>
<path d="M182 892 c60 -160 150 -230 268 -236 v456 h-282 z" fill="${accent}" opacity="0.14"/>
${marks}
</g>
</svg>`;
}

mkdirSync(outDir, { recursive: true });
const manifest = [];
for (const [brand, accent] of BRANDS) {
  for (const [expr, cfg] of EXPRESSIONS) {
    const id = `char-${brand}-${expr}`;
    const file = path.join(outDir, `${id}.svg`);
    writeFileSync(file, sprite(brand, accent, [expr, cfg]));
    const type = `character-${expr}`;
    manifest.push({ id, type, src: `/assets/characters/${id}.svg`, alt: `${brand} (${expr})` });
  }
}
writeFileSync(manifestOut, JSON.stringify(manifest, null, 2));
console.log(`✓ ${manifest.length} character sprites + registry fragment`);
