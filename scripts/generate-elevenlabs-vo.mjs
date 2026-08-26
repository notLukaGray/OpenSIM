// Generates deterministic static VO clips with the ElevenLabs Text-to-Speech API.
// Credentials and voice IDs are read only from the process environment or .env.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(root, "public", "assets", "vo", "manifest.json");
const outputRoot = path.dirname(manifestPath);
const args = new Set(process.argv.slice(2));
const treeArg = process.argv.slice(2).find((arg) => arg.startsWith("--tree="));
const treeId = treeArg?.slice("--tree=".length);
const locationArg = process.argv.slice(2).find((arg) => arg.startsWith("--location="));
const locationId = locationArg?.slice("--location=".length);

async function loadDotEnv() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  const contents = await readFile(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const [, key, rawValue] = match;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

function voiceEnvKey(speaker) {
  return `ELEVENLABS_VOICE_${speaker.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase()}_ID`;
}

const textOnlySpeakers = new Set(["PLAYER", "...", "NARRATOR", "JUST THE GYM", "SLEEP"]);
const isVoiced = (speaker) => !textOnlySpeakers.has(speaker);
const expressionDirections = {
  happy: "[warmly]",
  special: "[confidently]",
  embarrassed: "[slightly sheepish]",
  annoyed: "[dryly]",
  neutral: "[calmly]",
};

await loadDotEnv();
if (treeId && locationId) {
  console.error("Use either --tree=<treeId> or --location=<locationId>, not both.");
  process.exit(1);
}
const apiKey = process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_LABS_KEY;
if (!apiKey) {
  console.error("Missing ELEVENLABS_API_KEY (or ELEVEN_LABS_KEY). Add it to the ignored .env file or export it before running this command.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const slots = manifest.lines.filter(
  (line) => isVoiced(line.speaker) && (!treeId || line.treeId === treeId) && (!locationId || line.locationId === locationId),
);
const selection = treeId ? `tree "${treeId}"` : locationId ? `location "${locationId}"` : "the full manifest";
if ((treeId || locationId) && slots.length === 0) {
  console.error(`No brand-character voice lines found for ${selection}.`);
  process.exit(1);
}

const missingVoiceKeys = [...new Set(slots.map((line) => voiceEnvKey(line.speaker)).filter((key) => !process.env[key]))];
if (missingVoiceKeys.length) {
  console.error(`Missing voice ID environment variable(s): ${missingVoiceKeys.join(", ")}`);
  process.exit(1);
}

const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3";
const force = args.has("--force");
let created = 0;
let skipped = 0;

for (const slot of slots) {
  const outputPath = path.join(outputRoot, slot.file);
  if (!force && existsSync(outputPath)) {
    skipped++;
    continue;
  }

  const voiceId = process.env[voiceEnvKey(slot.speaker)];
  // Eleven v3 recognizes these as non-spoken delivery cues. Other models receive
  // the original dialogue untouched, rather than accidentally speaking a cue aloud.
  const text = modelId === "eleven_v3"
    ? `${expressionDirections[slot.expression] ?? expressionDirections.neutral} ${slot.text}`
    : slot.text;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${slot.file}: ElevenLabs returned ${response.status} ${response.statusText}: ${detail}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  created++;
  console.log(`✓ ${slot.file}`);
}

console.log(`✓ ElevenLabs VO complete for ${selection}: ${created} generated, ${skipped} unchanged (${slots.length} eligible lines).`);
