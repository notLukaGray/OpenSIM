# DSIM — Love, Loyalty & Brand Preference

A browser-based, Japanese-style visual novel about brand perception and consumer expectation. You think you are dating brands and choosing which ones you like. In reality, every choice reveals the consumer you are playing — and every date teaches you what each brand actually means to them.

## The two reveals

The entire design serves these two moments:

1. **Who is this consumer?** — Your choices accumulate a hidden evidence vector that resolves into one of five consumer archetypes at the end. The game never shows you the vector; you only see your revealed archetype, a brief description of what matters to you, and one of that archetype's two personas, feminine or masculine, embodying the type.

2. **What do these brands actually mean to them?** — The game tracks both claimed brand images (what brands say they stand for) and perceived realities (what the player discovers through dates and evidence cards). At reveal, you see ranked recommendations of which brands match your needs best, paired with breakdowns of why each one fits or clashes.

The game never implies any brand is universally "best." Every recommendation is personal to you.

## What it is

A complete, fully voiced dating sim built in Next.js 15 and TypeScript. The game contains 25 brands, 56 date encounters across locations on a panning/zoomable world map, 18 sourced evidence cards (real claims about real brands), and 1,029 lines of dialogue across 992 nodes, every character line voiced. All game content lives as JSON in `content/`, with no story logic embedded in the engine.

- **Encounter system:** Each date is a brand × location pairing. A date is a branching dialogue tree with choices that modify player evidence, perceived brand profiles, and in-game flags. Dates auto-discover via JSON — add one without touching the engine.
- **Evidence:** Real, researched claims about brands, tied to the specific date that unlocks each card. Every card cites published sources (press releases, news coverage, reviews). This sourced integrity is a design constraint, not decoration.
- **Brand matching:** A weighted compatibility system compares accumulated player evidence against each brand's perceived profile, weighted by player needs. Modifiers contextually adjust brand profiles by location or game flag — e.g., a fitness brand feels stronger at a gym.
- **World map:** Locations are content-defined destinations on a pannable, zoomable square world. Presentation state (camera, pan, zoom) lives in React and never enters game state, keeping the engine pure.
- **Voice-over:** every character line is voiced — 612 clips against 612 voice-eligible lines, complete coverage. The other 417 lines are deliberately text-only: `PLAYER`, `NARRATOR`, and the `...` narration that unbranded encounters use. Clips resolve by convention at `/assets/vo/<tree>/<node>/<line>.mp3`, with no manifest to keep in sync; a missing file is a silent no-op rather than an error. The audio engine measures gated loudness on decode and levels each clip, because the recordings arrive spanning 18 dB.
- **Persistence:** Save game and settings via localStorage with version checking. A corrupted or outdated save doesn't break the game; you just start over.

Deploy target: **Vercel** (static-friendly Next.js).

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
npm run validate   # content validation (run before build)
npm run build      # runs validate as a prebuild gate; fails loudly if content invalid
```

## Repository map

```
app/               Next.js App Router shell, routes, metadata, global styles
components/        Presentation layer — dialogue UI, reveal, title, debug panel
content/           All game content as JSON + typed registries (no story logic elsewhere)
game/              Pure engine — state, effects, compatibility, audio, save
hooks/             React bindings — game store, map pan/zoom
public/assets/     Served binaries (art, audio); referenced only via asset registry
scripts/           Content validator CLI, placeholder art/audio generators
docs/              Architecture, authoring guide, ADRs
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — every system, its contract, and why it exists.
- [`docs/AUTHORING.md`](docs/AUTHORING.md) — how to add a date, brand, evidence card, modifier, or asset.
- [`docs/decisions/`](docs/decisions/) — the ADRs. Source comments cite these by number
  (`AudioManager.ts` says ADR-06, `save.ts` says ADR-09); this is where to read what that means.
  They record decisions not to silently reverse.

## How npm scripts work

- **`npm run dev`** — Start the Next.js dev server (port 3000 by default).
- **`npm run validate`** — Run full content validation. Prints real counts and fails loudly on errors.
- **`npm run build`** — Build for production; validation runs first as a prebuild gate.
- **`npm run sync:dates`** — Regenerate `content/date-registry.generated.ts` from all `content/dates/*.json` files. Run this after adding or removing a date file.
- **`npm run vo:manifest`** — Export a manifest of which VO clips the game expects.
- **`npm run vo:generate`** — Generate the voice-over through the ElevenLabs API. Costs money; needs an API key in `.env`.
- **`npm run assets:optimize`** — Compress images and SVGs in place.

## Content validation

Validation is a hard prebuild gate. Every build runs `npm run validate`, which checks:

- All JSON files conform to the content schema (no missing required fields).
- All cross-references resolve (evidence IDs, source IDs, asset IDs, brand IDs).
- ID uniqueness per collection.
- Need vector ranges: -5..+5 for profiles, capped at ±3 for evidence and modifier effects.
- Modifier and node activation conditions are well-formed.
- Every dialogue node is reachable from its tree's start node; unreachable nodes warn.

The validation script prints real totals and stops the build if anything is wrong. This is a feature — inconsistent content stops immediately, never deploys.

## Design principles

The engine lives in `game/` and knows nothing about story content. All story knowledge arrives via arguments. This keeps the engine testable, reusable, and free of hardcoded brand/need/archetype names.

Presentation state (camera, pan, zoom) never enters game state. The map's pan/zoom hook holds only camera transforms; game state holds only player choices, evidence, and persistence flags.

Brand profiles are never mutated. Base profiles exist in `brands.json`. Modifiers stack onto them at read time only, and per-date perception deltas are stored separately. This preserves determinism: replaying a choice sequence always produces the same state.

All game content is JSON. The content registry enforces schema, normalizes partial vectors to full need vectors, and exports typed registries. You author content naturally (partial vectors, no boilerplate); the registry layer adds rigor at the boundary.
