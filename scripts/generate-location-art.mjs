// Generates candidate location backgrounds (1920x1080 flat-vector scenes).
// Deterministic; palette matches the baseline set.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "public", "assets", "backgrounds");

const SCENES = {
  "bg-beach-day": `
<rect width="1920" height="1080" fill="#2b3a55"/>
<rect y="700" width="1920" height="380" fill="#1d2a44"/>
<circle cx="1500" cy="260" r="120" fill="#f2b8c6" opacity="0.8"/>
<rect y="700" width="1920" height="14" fill="#8ecbff" opacity="0.5"/>
<g fill="#141b30"><path d="M300 760 l60 -40 60 40z"/><path d="M420 780 l50 -34 50 34z"/><path d="M1480 770 l56 -38 56 38z"/></g>`,
  "bg-music-festival": `
<rect width="1920" height="1080" fill="#12101f"/>
<rect x="560" y="520" width="800" height="360" rx="18" fill="#1b1730"/>
<g><polygon points="700,520 760,240 820,520" fill="#edff4c" opacity="0.25"/><polygon points="960,520 1020,200 1080,520" fill="#ff8dce" opacity="0.25"/><polygon points="1180,520 1240,280 1300,520" fill="#8ecbff" opacity="0.25"/></g>
<circle cx="1020" cy="180" r="26" fill="#f4ecf2" opacity="0.9"/>
<g stroke="#2a2440" stroke-width="10"><line x1="0" y1="900" x2="1920" y2="900"/></g>
<g fill="#241f3d"><circle cx="300" cy="880" r="16"/><circle cx="1620" cy="884" r="14"/></g>`,
  "bg-corner-cafe": `
<rect width="1920" height="1080" fill="#171322"/>
<rect x="220" y="160" width="640" height="560" rx="12" fill="#3a2f52"/>
<rect x="250" y="190" width="580" height="500" rx="8" fill="#514273" opacity="0.7"/>
<rect x="1120" y="420" width="600" height="380" rx="14" fill="#241d38"/>
<g fill="#f2b8c6" opacity="0.75"><rect x="1180" y="330" width="90" height="26" rx="12"/><rect x="1320" y="330" width="90" height="26" rx="12"/></g>
<path d="M1250 300 q20 -40 0 -80" stroke="#e8e2f2" stroke-width="8" fill="none" opacity="0.5"/>`,
  "bg-bedroom-night": `
<rect width="1920" height="1080" fill="#0d1020"/>
<rect x="1380" y="140" width="380" height="460" rx="10" fill="#232a44"/>
<circle cx="1570" cy="330" r="70" fill="#f2b8c6" opacity="0.85"/>
<rect x="240" y="720" width="1440" height="240" rx="26" fill="#1b2140"/>
<rect x="240" y="690" width="1440" height="70" rx="26" fill="#28305a"/>
<path d="M300 690 q660 -120 1320 0" stroke="#313a6b" stroke-width="16" fill="none"/>`,
  "bg-grocery-store": `
<rect width="1920" height="1080" fill="#101821"/>
<g fill="#1b2733">
<rect x="160" y="220" width="1600" height="36" rx="6"/><rect x="160" y="430" width="1600" height="36" rx="6"/><rect x="160" y="640" width="1600" height="36" rx="6"/><rect x="160" y="850" width="1600" height="36" rx="6"/>
</g>
<g opacity="0.85">
<rect x="260" y="150" width="90" height="66" rx="8" fill="#8ecbff"/><rect x="420" y="154" width="80" height="62" rx="8" fill="#edff4c" opacity="0.8"/><rect x="600" y="150" width="96" height="66" rx="8" fill="#ff8dce" opacity="0.8"/><rect x="1420" y="152" width="86" height="64" rx="8" fill="#8ced73" opacity="0.8"/>
<rect x="320" y="360" width="84" height="66" rx="8" fill="#f0a35e" opacity="0.85"/><rect x="1280" y="362" width="92" height="64" rx="8" fill="#c9a7eb" opacity="0.8"/>
<rect x="240" y="572" width="88" height="64" rx="8" fill="#37b6ff" opacity="0.8"/><rect x="1360" y="576" width="84" height="60" rx="8" fill="#9fd8cb" opacity="0.85"/>
</g>`,
};

mkdirSync(outDir, { recursive: true });
for (const [id, body] of Object.entries(SCENES)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${body}
</svg>`;
  writeFileSync(path.join(outDir, `${id}.svg`), svg);
  console.log(`✓ ${id}.svg`);
}
