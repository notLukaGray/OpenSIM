// CLI content validator (ADR-10). Loads every JSON under content/, runs the
// shared rule-set in tools/validate-core.mjs, prints precise diagnostics.
// Exit 0 = valid; exit 1 = errors. Wired as `prebuild`.
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
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

// ── P10-01: map hit-zone geometry ─────────────────────────────────────────────
// Locations must carry drawn, unambiguous hit zones in normalized 0–100 space.
// Lives in this CLI (not validate-core) because it is map-renderer specific;
// diagnostics follow the same {file, path, message} shape as the core rules.
function hitZoneDiagnostics(locations) {
  const errors = [];
  const warnings = [];
  const file = "content/locations.json";
  const err = (path, message) => errors.push({ level: "error", file, path, message });
  const warn = (path, message) => warnings.push({ level: "warning", file, path, message });

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const inBounds = (v) => v >= 0 && v <= 100;

  /** Normalize one raw hitZone; pushes diagnostics and returns null when invalid. */
  function parseZone(l) {
    const base = `location[${l.id}]`;
    const hz = l.hitZone;
    if (!hz || typeof hz !== "object") {
      err(base, 'missing hitZone — every location needs drawn map geometry ({ shape: "circle" | "rect" | "poly", … })');
      return null;
    }
    const numsOk = (obj, fields, path) => {
      let ok = true;
      for (const f of fields) {
        if (!isNum(obj[f])) {
          err(`${path}.${f}`, `must be a number, got ${JSON.stringify(obj[f])}`);
          ok = false;
        }
      }
      return ok;
    };
    switch (hz.shape) {
      case "circle": {
        if (!numsOk(hz, ["cx", "cy", "r"], `${base}.hitZone`)) return null;
        if (hz.r <= 0) {
          err(`${base}.hitZone.r`, `radius must be positive, got ${hz.r}`);
          return null;
        }
        const extents = [
          [`cx - r`, hz.cx - hz.r],
          [`cx + r`, hz.cx + hz.r],
          [`cy - r`, hz.cy - hz.r],
          [`cy + r`, hz.cy + hz.r],
        ];
        for (const [label, v] of extents)
          if (!inBounds(v))
            err(`${base}.hitZone`, `out of bounds: ${label} = ${v} leaves the 0..100 map space`);
        return { shape: "circle", cx: hz.cx, cy: hz.cy, r: hz.r };
      }
      case "rect": {
        if (!numsOk(hz, ["x", "y", "w", "h"], `${base}.hitZone`)) return null;
        if (hz.w <= 0 || hz.h <= 0) {
          err(`${base}.hitZone`, `width and height must be positive, got ${hz.w}×${hz.h}`);
          return null;
        }
        for (const [label, v] of [["x", hz.x], ["y", hz.y], ["x + w", hz.x + hz.w], ["y + h", hz.y + hz.h]])
          if (!inBounds(v))
            err(`${base}.hitZone`, `out of bounds: ${label} = ${v} leaves the 0..100 map space`);
        return { shape: "rect", x: hz.x, y: hz.y, w: hz.w, h: hz.h };
      }
      case "poly": {
        if (!Array.isArray(hz.points) || hz.points.length < 3) {
          err(`${base}.hitZone.points`, `a polygon needs at least 3 [x, y] points`);
          return null;
        }
        const points = [];
        let ok = true;
        for (const [i, pt] of hz.points.entries()) {
          if (!Array.isArray(pt) || pt.length !== 2 || !isNum(pt[0]) || !isNum(pt[1])) {
            err(`${base}.hitZone.points[${i}]`, `must be an [x, y] pair of numbers`);
            ok = false;
            continue;
          }
          if (!inBounds(pt[0]) || !inBounds(pt[1]))
            err(`${base}.hitZone.points[${i}]`, `out of bounds: (${pt[0]}, ${pt[1]}) leaves the 0..100 map space`);
          points.push(pt);
        }
        return ok ? { shape: "poly", points } : null;
      }
      default:
        err(`${base}.hitZone.shape`, `unknown shape "${String(hz.shape)}" (valid: circle | rect | poly)`);
        return null;
    }
  }

  // point-in-shape tests (strict interiors — exactly touching is not overlap)
  const inCircle = (z, x, y) => (x - z.cx) ** 2 + (y - z.cy) ** 2 < z.r ** 2;
  const inRect = (z, x, y) => x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h;
  function inPoly(z, x, y) {
    let inside = false;
    const pts = z.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const containsPoint = (z, x, y) =>
    z.shape === "circle" ? inCircle(z, x, y) : z.shape === "rect" ? inRect(z, x, y) : inPoly(z, x, y);

  // segment intersection (for polygon edges)
  function segmentsCross(p1, p2, p3, p4) {
    const cross = (a, b, o) => (b[0] - a[0]) * (o[1] - a[1]) - (b[1] - a[1]) * (o[0] - a[0]);
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** Distance from a point to a segment (circle × poly edge test). */
  function distToSegment(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  const polyEdges = (z) => z.points.map((p, i) => [p, z.points[(i + 1) % z.points.length]]);

  function zonesOverlap(a, b) {
    const key = `${a.shape}:${b.shape}`;
    const polyOf = (z) => (z.shape === "poly" ? z : null);
    switch (key) {
      case "circle:circle":
        return (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2 < (a.r + b.r) ** 2;
      case "rect:rect":
        return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      case "circle:rect":
      case "rect:circle": {
        const c = a.shape === "circle" ? a : b;
        const r = a.shape === "rect" ? a : b;
        const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
        const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
        return (c.cx - nx) ** 2 + (c.cy - ny) ** 2 < c.r ** 2;
      }
      case "circle:poly":
      case "poly:circle": {
        const c = a.shape === "circle" ? a : b;
        const p = polyOf(a) ?? polyOf(b);
        return (
          containsPoint(p, c.cx, c.cy) ||
          polyEdges(p).some(([s1, s2]) => distToSegment(c.cx, c.cy, s1, s2) < c.r)
        );
      }
      default: {
        // rect/poly and poly/poly: vertex containment or crossing edges
        const pa = polyOf(a) ?? rectAsPoly(a);
        const pb = polyOf(b) ?? rectAsPoly(b);
        return (
          pa.points.some((p) => containsPoint(pb, p[0], p[1])) ||
          pb.points.some((p) => containsPoint(pa, p[0], p[1])) ||
          polyEdges(pa).some((e1) => polyEdges(pb).some((e2) => segmentsCross(e1[0], e1[1], e2[0], e2[1])))
        );
      }
    }
  }
  const rectAsPoly = (r) => ({
    shape: "poly",
    points: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]],
  });

  const parsed = new Map();
  for (const l of locations) {
    if (typeof l.color !== "string" || !/^#[0-9a-f]{6}$/i.test(l.color))
      err(`location[${l.id}].color`, "must be a six-digit hex color");
    const zone = parseZone(l);
    if (zone) parsed.set(l.id, zone);
    // The status marker sits at map.x/map.y — it should land on the zone it marks.
    if (zone && isNum(l.map?.x) && isNum(l.map?.y) && !containsPoint(zone, l.map.x, l.map.y))
      warn(`location[${l.id}].map`, `map anchor (${l.map.x}, ${l.map.y}) sits outside its own hitZone — the status marker will float off the drawn area`);
  }

  // Ambiguity guard: overlapping zones make tap resolution ambiguous.
  const entries = [...parsed.entries()];
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, zoneA] = entries[i];
      const [idB, zoneB] = entries[j];
      if (zonesOverlap(zoneA, zoneB))
        err(
          `location[${idB}].hitZone`,
          `overlaps location[${idA}]'s hit zone — zones must be unambiguous so a tap has exactly one target`
        );
    }

  return { errors, warnings };
}

const geometry = hitZoneDiagnostics(locations);
result.errors.push(...geometry.errors);
result.warnings.push(...geometry.warnings);

result.ok = result.errors.length === 0;

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
    `${bundle.locations.length} map hit zones`,
  ].join(", ");
  console.log(`✓ Content valid — ${counts}${result.warnings.length ? ` (+${result.warnings.length} warnings)` : ""}`);
}
