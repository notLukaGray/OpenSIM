// Generates ambient location themes (mono 22050 Hz 16-bit WAV, seamless 8s
// loops) for the expanded location roster. Deterministic.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "public", "assets", "music");

const SR = 22050;
const DUR = 8;
const N = SR * DUR;

// [freqHz, amp] partials chosen to sit in a calm ambient register.
const THEMES = {
  "mus-beach-day": [[130.81, 0.3], [196.0, 0.22], [261.63, 0.18], [329.63, 0.12]],
  "mus-music-festival": [[110.0, 0.28], [164.81, 0.2], [220.0, 0.18], [277.18, 0.14]],
  "mus-corner-cafe": [[146.83, 0.3], [220.0, 0.22], [293.66, 0.16]],
  "mus-bedroom-night": [[98.0, 0.32], [146.83, 0.24], [196.0, 0.16]],
  "mus-grocery-store": [[123.47, 0.26], [185.0, 0.2], [246.94, 0.16], [311.13, 0.1]],
};

function synth(partials) {
  const data = Buffer.alloc(N * 2);
  // integer cycle counts per partial => click-free seam
  const oscs = partials.map(([f, a]) => {
    const cycles = Math.max(1, Math.round((f * DUR) / (2 * Math.PI) || f * DUR));
    return { w: (2 * Math.PI * Math.round(f * DUR)) / DUR / DUR === 0 ? f : (Math.round(f * DUR) * 2 * Math.PI) / DUR, a };
  });
  let peak = 0;
  const smp = new Float64Array(N);
  for (const { w, a } of oscs) {
    for (let i = 0; i < N; i++) smp[i] += Math.sin(w * (i / SR)) * a;
  }
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(smp[i]));
  const norm = peak > 0 ? 0.35 / peak : 0;
  for (let i = 0; i < N; i++) data.writeInt16LE(Math.round(smp[i] * norm * 32767), i * 2);
  return { data, samples: N };
}

function wav(data, samples) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data.subarray(0, samples * 2)]);
}

mkdirSync(outDir, { recursive: true });
for (const [id, partials] of Object.entries(THEMES)) {
  const { data } = synth(partials);
  writeFileSync(path.join(outDir, `${id}.wav`), wav(data, N));
  console.log(`✓ ${id}.wav`);
}
