# Authoring Guide

Everything narrative is JSON in `content/`. You should be able to add a complete date without
opening anything under `game/` or `components/`. If you find yourself editing engine code to tell
story, stop — that's a missing feature; file it as a brief.

After ANY content change: `npm run validate`. It will refuse loudly and precisely.

## Add a date

Create `content/dates/<brand-or-scene-id>.json`:

```json
{
  "id": "liquid-iv-airport",
  "title": "Gate 34",
  "brandId": "liquid-iv",
  "context": { "location": "airport", "occasion": "travel" },
  "music": "theme-liquid-iv-airport",
  "background": "bg-airport-night",
  "cast": [
    { "assetId": "char-liquid-iv-neutral", "position": "center" }
  ],
  "lessons": ["portable functional support", "sweetness can create tension"],
  "start": "intro",
  "nodes": { "...": "see below" }
}
```

Register nothing by hand — `registry.ts` globs `dates/*.json` at build time (imported statically).

### Node shape

```json
{
  "intro": {
    "speaker": "Liquid I.V.",
    "sprite": { "expression": "happy", "effect": "enter-from-left" },
    "text": ["Hey. You made it.", "Before we do anything else — drink this."],
    "next": "impression"
  }
}
```

| Field | Meaning |
| --- | --- |
| `speaker` | Name shown on the speaker tab (`"..."` = narration) |
| `text` | Lines shown in order, click to advance through them |
| `next` | Next node id in this tree (omit if `choices` present) |
| `choices` | Array of choice objects (below) |
| `callbacks` | `[{ "if": "<choiceId>", "text": [...] }]` — first match replaces `text` |
| `evidence` | Evidence id → shows `[MEMORY UNLOCKED]` card when the node renders |
| `music` | Track id → crossfade when node renders |
| `background` | Background asset id → crossfade |
| `cg` | CG asset id → full-screen moment until dismissed |
| `sprite` | Per-line sprite direction: expression change / enter / exit / emphasis |
| `conditions` | `{ "flags": { "all": [], "any": [], "none": [] } }` — node only renders if true |

### Choice shape

```json
{
  "id": "rescue",
  "text": "You may have actually saved me.",
  "next": "impression-rescue",
  "playerEffects": { "readiness": 2, "comfort": 1 },
  "brandPerceptionEffects": { "liquid-iv": { "readiness": 1 } },
  "relationshipEffects": { "liquid-iv": 1 },
  "setFlags": ["defended-sweetness"],
  "conditions": { "flags": { "any": ["sipped"] } }
}
```

- `playerEffects`: signed evidence for the player reveal (keep magnitudes ≤3).
- `brandPerceptionEffects`: discovered deltas for that brand's effective profile.
- `relationshipEffects`: chemistry only — flavor, never scored.
- `setFlags`: gate later content with `conditions`, and activate flag-gated modifiers.
- `nextTree`: end this tree, jump to another (`map`, `reveal`). A node with neither `next` nor
  `choices` must carry `nextTree`.
- Callbacks: any later node in the same tree may callback to any earlier choice id in that tree.

### The date rhythm

Author toward five beats: **INTRO → FIRST IMPRESSION → EXPERIENCE → TENSION → CLOSING**. Each date
should simultaneously: reveal something about the player, teach something about the brand, expose
one honest tension, and set up at least one callback in the closing.

## Add a brand

Append to `content/brands.json`. Profiles are −5..+5 per need. Balance rule (validated): each brand
must have ≥2 strongly positive needs AND ≥2 clearly negative needs; no brand may have the highest
sum across all profiles. Fill `claimedProfile` (the pitch) and `perceivedProfile` (the market read)
**separately** — gaps between them are where dates get interesting. Give it `color`, `sigil`,
`setting`, `personality` (voice notes for writers), and asset/music ids.

## Add consumer archetype

`content/archetypes.json` — weights are relative importance (any positive numbers; normalized
internally). Keep descriptions second-person, specific, a little devastating.

## Add evidence

`content/evidence.json` — the [MEMORY UNLOCKED] cards that surface real marketing material inside
dates. `imageRef` is OPTIONAL: with it, the card shows your image; without it, the card renders as
designed typography (title-as-quote over type badge). Bulk workflow:

```bash
# agents/writers drop fragment files, then merge in one command:
npm run sync:evidence
```

Fragments live in `content/evidence-fragments/*.json` and must include an `imageRef` pointing to an
SVG you place at `public/assets/evidence/<id>.svg` (swap with real imagery later — same path).

```json
{
  "id": "ev-liquid-iv-travel-pack",
  "brandId": "liquid-iv",
  "type": "product",
  "title": "The travel pack",
  "description": "Stick packs sized exactly for a water bottle.",
  "imageRef": "/assets/evidence/ev-liquid-iv-travel-pack.svg",
  "effects": { "readiness": 1 }
}
```

Fragments may write `imageRef` as the file path — `sync:evidence` normalizes it to the asset id
and registers the SVG automatically.

Attach to any node via `"evidence": "<card-id>"`. Effects nudge perception once on first unlock.
`sourceIds` (P6-01) may cite `content/sources.json` records when that lands.

## Add a modifier

`content/modifiers.json`:

```json
{
  "id": "mod-liquid-iv-airport",
  "appliesTo": ["liquid-iv"],
  "when": { "location": "airport" },
  "effects": { "readiness": 1 },
  "label": "Exactly the right place to meet"
}
```

Conditions may combine `location`, `occasion`, `dateId`, `hasFlag`. Modifiers stack additively at
read time, clamped to ±5, never mutating base profiles.

## Add assets / music

Never reference file paths from components. Register in `content/assets.json` / `content/audio.json`,
then use IDs. Placeholder files live in `public/assets/**`; regenerate with the scripts in
`scripts/`. Swap real art by replacing files (same names) or updating registry entries — components
never notice.

## Add a location

`content/locations.json` — places the player can travel to (P5-01):

```json
{
  "id": "office",
  "name": "THE OFFICE",
  "blurb": "After hours. Desk drawers and desk-drawer decisions.",
  "background": "bg-hub",
  "music": "mus-hub",
  "map": { "x": 52, "y": 76 }
}
```

`map.x/y` are percentages of the stage. Dates join a location via `"locationId"`. **The same brand
may appear at several locations** — each appearance is its own date tree and resolves different
modifiers onto the same base profile. That contrast is the whole point: Liquid I.V. is readiness at
the airport and desk-drawer comfort at the office.

## AI voice-over

Every dialogue LINE has a deterministic voice slot (P5-03, ADR-13):

```txt
public/assets/vo/<treeId>/<nodeId>/<lineIndex>.mp3   # lineIndex is 0-based in `text`
```

Drop generated clips at those paths; the game plays them on the line with music ducking. Missing
files are silent no-ops — you can VO a scene line-by-line as the pipeline produces it. Content never
stores voice paths; re-recording = replacing one file.

## Checklist before merging content

1. `npm run validate` passes.
2. Play the date once in dev; open the debug panel (`` ` ``) and confirm effects land where intended.
3. Does the date serve at least one of the two reveals? If not, revise.
