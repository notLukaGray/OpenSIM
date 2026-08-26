// Keep SVG masters and create optimized delivery siblings for registered SVG UI art.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "svgo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/assets/ui/logo-dsim.svg");
const output = path.join(root, "public/assets/ui/logo-dsim.min.svg");
const result = optimize(await readFile(source, "utf8"), { multipass: true, path: source });
await writeFile(output, result.data);
console.log("Wrote optimized logo SVG; original SVG master retained.");
