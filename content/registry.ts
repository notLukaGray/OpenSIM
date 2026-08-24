// The single import point for all game content (ADR-04).
//
// Content JSON is authored ergonomically (partial need vectors, no boilerplate
// dimensions). THIS layer is the boundary: it shape-checks every record loudly
// (missing/misspelled fields throw at import — build fails), normalizes
// vectors to full NeedVectors, and exports typed runtime registries.
// Semantic validation (ids, refs, ranges, balance) lives in
// tools/validate-core.mjs via npm run validate + the dev overlay.
import type {
  Archetype,
  AssetReference,
  AudioTrack,
  Brand,
  DateTree,
  Evidence,
  GameLocation,
  Modifier,
  Source,
} from "./schema";
import type { Need, NeedVector } from "@/game/types";
import { needs, zeroNeeds } from "@/game/types";
import brandsJson from "./brands.json";
import archetypesJson from "./archetypes.json";
import modifiersJson from "./modifiers.json";
import evidenceJson from "./evidence.json";
import assetsJson from "./assets.json";
import audioJson from "./audio.json";
import locationsJson from "./locations.json";
import sourcesJson from "./sources.json";
import { dateFiles } from "./date-registry.generated";

// ── shape guards ─────────────────────────────────────────────────────────────

class ContentError extends Error {}

function req(record: Record<string, unknown>, fields: readonly string[], file: string): void {
  for (const f of fields)
    if (!(f in record)) throw new ContentError(`${file}: record "${record.id ?? "?"}" missing "${f}"`);
}

function fullVector(partial: Record<string, unknown>, file: string, owner: string): NeedVector {
  const out = zeroNeeds();
  for (const [k, v] of Object.entries(partial ?? {})) {
    if (!(needs as readonly string[]).includes(k))
      throw new ContentError(`${file}: ${owner} unknown dimension "${k}"`);
    out[k as Need] = v as number;
  }
  return out;
}

// ── brands ───────────────────────────────────────────────────────────────────
const BRAND_FIELDS = ["id", "name", "color", "claimedProfile", "perceivedProfile"] as const;
export const brands: Brand[] = (brandsJson as Record<string, unknown>[]).map((b, i) => {
  req(b, BRAND_FIELDS, `brands.json[${i}]`);
  return {
    id: b.id as string,
    name: b.name as string,
    archetype: (b.archetype as string) ?? "",
    color: b.color as string,
    sigil: (b.sigil as string) ?? "?",
    setting: (b.setting as string) ?? "",
    personality: (b.personality as string) ?? "",
    unbranded: Boolean(b.unbranded),
    claimedProfile: fullVector(b.claimedProfile as Record<string, unknown>, "brands.json", `${b.id}.claimed`),
    perceivedProfile: fullVector(b.perceivedProfile as Record<string, unknown>, "brands.json", `${b.id}.perceived`),
  } satisfies Brand;
});

// ── archetypes ───────────────────────────────────────────────────────────────
export const archetypes: Archetype[] = (archetypesJson as Record<string, unknown>[]).map((a, i) => {
  req(a, ["id", "name", "description", "weights"], `archetypes.json[${i}]`);
  return {
    id: a.id as string,
    name: a.name as string,
    description: a.description as string,
    weights: fullVector(a.weights as Record<string, unknown>, "archetypes.json", a.id as string),
  } satisfies Archetype;
});

// ── modifiers ────────────────────────────────────────────────────────────────
export const modifiers: Modifier[] = (modifiersJson as unknown as Record<string, unknown>[]).map(
  (m, i) => {
    req(m, ["id", "appliesTo", "when", "effects", "label"], `modifiers.json[${i}]`);
    return {
      id: m.id as string,
      appliesTo: m.appliesTo as string[],
      when: m.when as Modifier["when"],
      label: m.label as string,
      effects: fullVector(m.effects as Record<string, unknown>, "modifiers.json", m.id as string),
    } satisfies Modifier;
  }
);

// ── evidence ─────────────────────────────────────────────────────────────────
export const evidence: Evidence[] = (evidenceJson as unknown as Record<string, unknown>[]).map(
  (e, i) => {
    req(e, ["id", "brandId", "type", "title", "description"], `evidence.json[${i}]`);
    return {
      id: e.id as string,
      brandId: e.brandId as string,
      type: e.type as Evidence["type"],
      title: e.title as string,
      description: e.description as string,
      ...(e.imageRef ? { imageRef: e.imageRef as string } : {}),
      effects: fullVector(e.effects as Record<string, unknown>, "evidence.json", e.id as string),
    } satisfies Evidence;
  }
);

// ── assets ───────────────────────────────────────────────────────────────────
import charactersGenerated from "./asset-characters.generated.json";
export const assets: AssetReference[] = [
  ...(assetsJson as AssetReference[]),
  ...(charactersGenerated as unknown as AssetReference[]),
];

// ── audio ────────────────────────────────────────────────────────────────────
export const audioTracks: AudioTrack[] = audioJson as AudioTrack[];

// ── locations ────────────────────────────────────────────────────────────────
const LOCATION_FIELDS = ["id", "name", "blurb", "background", "music", "map"] as const;
export const locations: GameLocation[] = (locationsJson as unknown as Record<string, unknown>[]).map(
  (l, i) => {
    req(l, LOCATION_FIELDS, `locations.json[${i}]`);
    const map = l.map as { x?: unknown; y?: unknown };
    if (typeof map?.x !== "number" || typeof map?.y !== "number")
      throw new ContentError(`locations.json[${i}] (${String(l.id)}): map.x/map.y must be numbers`);
    if (!assets.some((a) => a.id === l.background))
      throw new ContentError(`locations.json[${i}]: unknown background asset "${String(l.background)}"`);
    return {
      id: l.id as string,
      name: l.name as string,
      blurb: l.blurb as string,
      background: l.background as string,
      music: l.music as string,
      map: { x: map.x as number, y: map.y as number },
    } satisfies GameLocation;
  }
);
const locationIds = new Set(locations.map((l) => l.id));

// ── sources ──────────────────────────────────────────────────────────────────
export const sources = sourcesJson as unknown as Source[];
const sourceIdSet = new Set(sources.map((x) => x.id));

/** Citation lookup for evidence cards (P6-01). Unknown ids return null. */
export function getSourceOrNull(id: string): Source | null {
  return sources.find((x) => x.id === id) ?? null;
}

// ── dates ────────────────────────────────────────────────────────────────────
// Files are auto-discovered; run `npm run sync:dates` after adding one.
const dateFilesTyped: DateTree[] = dateFiles.map((t) => {
  const tree = t as unknown as DateTree;
  req(tree as unknown as Record<string, unknown>, ["id", "startNode", "nodes"], "dates/*.json");
  if (!tree.nodes[tree.startNode])
    throw new ContentError(`${tree.id}: startNode "${tree.startNode}" does not exist`);
  if (tree.locationId && !locationIds.has(tree.locationId))
    throw new ContentError(`${tree.id}: unknown locationId "${tree.locationId}"`);
  return tree;
});
export const dateTrees = dateFilesTyped;

// ── lookups ──────────────────────────────────────────────────────────────────

const brandMap = new Map(brands.map((b) => [b.id, b]));
const archetypeMap = new Map(archetypes.map((a) => [a.id, a]));
const treeMap = new Map(dateTrees.map((t) => [t.id, t]));
const assetMap = new Map(assets.map((a) => [a.id, a]));
const audioMap = new Map(audioTracks.map((t) => [t.id, t]));
const evidenceMap = new Map(evidence.map((e) => [e.id, e]));

export const HUB_TREE_ID = "home";

/** Trees the hub menu offers as dates (any tree with a brand). */
export const dateTreeList = dateTrees.filter((t) => t.brandId !== null);

export function getBrand(id: string): Brand {
  const b = brandMap.get(id);
  if (!b) throw new Error(`Unknown brand "${id}"`);
  return b;
}

export function getBrandOrNull(id: string | null): Brand | null {
  return id ? (brandMap.get(id) ?? null) : null;
}

export function getArchetypeOrNull(id: string): Archetype | null {
  return archetypeMap.get(id) ?? null;
}

export function getTree(id: string): DateTree {
  const t = treeMap.get(id);
  if (!t) throw new Error(`Unknown dialogue tree "${id}"`);
  return t;
}

export function hasTree(id: string): boolean {
  return treeMap.has(id);
}

export function getAsset(id: string): AssetReference {
  const a = assetMap.get(id);
  if (!a) throw new Error(`Unknown asset "${id}"`);
  return a;
}

export function hasAsset(id: string): boolean {
  return assetMap.has(id);
}

export function getAudioTrack(id: string): AudioTrack {
  const t = audioMap.get(id);
  if (!t) throw new Error(`Unknown audio track "${id}"`);
  return t;
}

export function hasAudioTrack(id: string): boolean {
  return audioMap.has(id);
}

export function getEvidence(id: string): Evidence {
  const e = evidenceMap.get(id);
  if (!e) throw new Error(`Unknown evidence "${id}"`);
  return e;
}

export function getLocationOrNull(id: string | null): GameLocation | null {
  return id ? (locationIdsGet(id) ?? null) : null;
}

function locationIdsGet(id: string): GameLocation | undefined {
  return locations.find((l) => l.id === id);
}

/** Everything the validator needs, in one bundle. */
export const contentBundle = {
  brands,
  archetypes,
  modifiers,
  evidence,
  assets,
  audioTracks,
  locations,
  trees: dateTrees,
};
export type ContentBundle = typeof contentBundle;
