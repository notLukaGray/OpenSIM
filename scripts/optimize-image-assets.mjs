// Preserve raster masters and write matching WebP delivery derivatives.
// Registry edits are limited to `src` suffixes, preserving author formatting.
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registries = [
  path.join(root, "content/assets.json"),
  path.join(root, "content/asset-characters.generated.json"),
];
const rasterExtensions = [".png", ".jpg", ".jpeg"];

function masterFor(publicSrc) {
  const noExtension = publicSrc.replace(/\.(?:png|jpe?g|webp)$/i, "");
  return rasterExtensions
    .map((extension) => `${noExtension}${extension}`)
    .find((candidate) => existsSync(path.join(root, "public", candidate)));
}

let converted = 0;
for (const registry of registries) {
  const raw = await readFile(registry, "utf8");
  const entries = JSON.parse(raw);
  let next = raw;

  for (const entry of entries) {
    if (typeof entry.src !== "string" || !entry.src.startsWith("/assets/")) continue;
    const master = masterFor(entry.src);
    if (!master) continue;
    const output = master.replace(/\.(?:png|jpe?g)$/i, ".webp");
    const isPng = master.endsWith(".png");
    await sharp(path.join(root, "public", master))
      .webp({ quality: isPng ? 90 : 82, alphaQuality: 100, effort: 4 })
      .toFile(path.join(root, "public", output));
    converted++;
    const [masterStats, outputStats] = await Promise.all([
      stat(path.join(root, "public", master)),
      stat(path.join(root, "public", output)),
    ]);
    // Some existing JPEGs are already highly compressed; do not make their
    // delivery source larger just to normalize extensions.
    const delivery = outputStats.size < masterStats.size ? output : master;
    next = next.replaceAll(`"src": "${entry.src}"`, `"src": "${delivery}"`);
  }

  if (next !== raw) await writeFile(registry, next);
}

console.log(`Wrote ${converted} WebP delivery derivatives; original PNG/JPEG masters were retained.`);
