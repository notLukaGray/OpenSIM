# Architecture

The game is split into four layers: **content** (JSON), **engine** (pure logic), **presentation** (React components), and **persistence** (localStorage + audio).

## Content layer (`content/`)

All game knowledge is JSON. The content registry enforces schema at import, normalizes partial vectors to full need vectors, and exports typed collections. This keeps story knowledge out of the engine.

### Core collections

- **`brands.json`** — 25 brands with claimed vs. perceived profiles. Each profile is a need vector (10 dimensions: control, readiness, reassurance, aspiration, belonging, mastery, comfort, excitement, self-expression, trust). Claimed profile is what the brand says about itself; perceived is what players discover. Profiles range from -5 (strong negative) to +5 (strong positive).
  
- **`archetypes.json`** — 9 consumer archetypes. Each has a need weight vector (what matters to this consumer), and two personas (feminine + masculine representations).

- **`evidence.json`** — 18 sourced evidence cards, each tied to a brand. Cards reveal real claims about real brands (ad spend, product features, investment activity). Every card cites published sources in `sources.json`. When a player first encounters a date node or choice that unlocks a card, the card's effects are applied once to that brand's perceived profile and cached in `unlockedEvidence`.

- **`sources.json`** — Source metadata for evidence cards. Every source has a title, publisher, year (optional), and URL. Evidence card descriptions cite these by ID and are expected to read like actual journalism.

- **`modifiers.json`** — 37 context-dependent effects. A modifier activates when a brand appears at a specific location, in a specific date, or when the player has set a specific flag. Modifiers stack additively onto a brand's profile at read time only; they never mutate stored state. Active modifiers are resolved in `game/modifiers.ts` and applied in `game/compatibility.ts` during brand matching.

- **`assets.json`** — 100 referenced binary assets (character sprites, backgrounds, CG, music). IDs map to paths in `public/assets/`. Sprites include character name, expression, and position. Assets are auto-discovered and validated; a missing asset reference fails validation.

- **`audio.json`** — 15 music tracks, each with duration and loop range in beats.

- **`locations.json`** — World map locations. Each location has coordinates (as percentages of the square world), a name, a blurb, background, music, and a color for the UI.

### Dates: branching dialogue trees

Each **date** is a JSON file in `content/dates/<id>.json`. A date tree is:

- An **encounter** between the player and a brand at a location.
- A **branching dialogue tree** with nodes, choices, and conditional flow.
- A vehicle for **evidence unlocks**, **choice effects**, and **player perception changes**.

#### Date structure

```json
{
  "id": "brand-location",
  "brandId": "brand-id-or-null",
  "title": "Human-readable title",
  "locationId": "location-id",
  "context": { "location": "location-id", "occasion": "occasion-type" },
  "music": "track-id-or-null",
  "background": "asset-id-or-null",
  "cast": [{ "assetId": "char-id", "position": "center" }],
  "startNode": "first-node-id",
  "entryPoints": ["conditional-entry-id"],
  "nodes": {
    "node-id": {
      "speaker": "BRAND_NAME or ...",
      "text": ["line 1", "line 2"],
      "sprite": { "expression": "happy", "position": "center" },
      "evidence": "ev-id",
      "choices": [
        {
          "id": "choice-id",
          "text": "Player answer",
          "playerEffects": { "control": 2 },
          "brandPerceptionEffects": { "brand-id": { "trust": -1 } },
          "relationshipEffects": { "brand-id": 1 },
          "next": "next-node-id"
        }
      ],
      "next": "next-node-id",
      "nextTree": "other-date-id"
    }
  }
}
```

#### Effect ledger (per choice)

When a player makes a choice, three ledgers are updated atomically:

1. **`playerEffects`** — Changes to the player's hidden evidence vector (what the player reveals about themselves). Capped at ±3 per choice.

2. **`brandPerceptionEffects`** — Changes to the player's discovered perception of a brand's profile. Stored per-brand in `GameState.brandPerception`. The base profile in `brands.json` is never touched; these are deltas.

3. **`relationshipEffects`** — "Chemistry" with a brand. Flavor only. Never feeds into matching logic, so you can have high chemistry with a brand you don't actually need.

#### Evidence unlocks

When a player enters a node with an `evidence` field, or makes a choice with an `evidence` field, the card is unlocked and its effects are applied **once** to that brand's perceived profile. Evidence effects are independent from choice effects — they stack. Unlocked evidence is tracked in `unlockedEvidence` so effects are never applied twice.

#### Conditions and entry points

A node can have `conditions` that check:
- **`flags`** — Boolean game flags set by choices. Can require all, any, or none of specific flags.
- **`brand.met`** — Whether the player has completed at least one encounter with this brand.
- **`archetype`** — The player's revealed archetype (only true after the reveal phase).
- **`postReveal`** — Whether the player has seen the reveal (unlocks post-game content).

A date can specify `entryPoints` — node IDs that are dynamically reachable (not via static edges). The engine tries each entry point in order, selecting the first whose conditions pass. If all fail, it falls back to `startNode`. This powers first-meeting vs. returning scenarios without branching the whole tree.

#### Dialogue nodes as pass-through routers

A node with `next` but no `choices` and failing `conditions` is a pass-through router. The engine follows the `next` edge, skipping the node entirely if conditions fail. This powers conditional content flow (e.g., a node that only renders if a flag is set, but if the flag is not set, flow continues past it).

#### Navigation

- **`next`** — Move to another node within the same tree.
- **`nextTree`** — Exit this tree and enter another (or the map, or the reveal).
  - `nextTree: "map"` — Go to the world map.
  - `nextTree: "reveal"` — Go to the consumer archetype reveal.
  - `nextTree: "other-date-id"` — Go to another date tree. The engine automatically marks the current encounter complete and the brand as "dated" before switching.

#### Callbacks (revisit variation)

A node can have `callbacks` — alternate text that plays on revisits if the player made a specific choice earlier in this tree.

```json
"callbacks": [
  { "if": "choice-id", "text": ["Alternate line if this choice was made"] }
]
```

### Auto-discovery and generation

- **Dates:** All files in `content/dates/*.json` are auto-discovered. Run `npm run sync:dates` after adding/removing a date file to regenerate `content/date-registry.generated.ts`.
- **Evidence in dates:** After a date is added, run `npm run validate` to derive each evidence card's `dateId` (which date unlocks it) and inject it into the evidence record.
- **Assets:** All assets in `public/assets/` are scanned and validated. A missing asset reference fails the build.

## Engine layer (`game/`)

Pure, testable logic with no story knowledge. Everything content-shaped arrives via arguments.

### Game state (`game/types.ts`)

```typescript
GameState = {
  evidence: NeedVector,                        // Hidden player evidence (revealed at end)
  brandPerception: Record<brandId, NeedVector>, // Per-brand discovered perception
  chemistry: Record<brandId, number>,          // Flavor-only relationship strength
  choiceLog: Record<treeId, choiceId[]>,       // Choices made per date
  flags: Record<flagName, boolean|number|string>, // Game flags (set by choices)
  unlockedEvidence: evidenceId[],              // Evidence cards already applied
  completedTrees: treeId[],                    // Finished encounters
  dated: brandId[],                            // Brands met at least once
  hasSeenReveal: boolean,                      // Post-game content unlock
  revealedPersonaId: string|null,              // The persona shown at reveal
  choicesMade: number,                         // Total choices across all encounters
}
```

### Core transforms (`game/engine.ts`)

- **`applyChoice(state, treeId, choice)`** — Apply a choice's full ledger: player evidence, brand perception deltas, chemistry, flags, and choice log.
- **`applyEvidenceUnlock(state, node)`** — Unlock evidence and apply effects once (no double-application).
- **`applyEvidenceById(state, evidenceId)`** — Shared by node entry and choice material beats.
- **`markCompleted(state, treeId, brandId)`** — Mark an encounter finished and the brand as dated.
- **`resolveForward(tree, nodeId, state)`** — Follow a `next` edge, skipping pass-through nodes whose conditions fail.
- **`filterCompletedDates(choices, state)`** — Hide choices leading to encounters already completed (so you can't repeat a date).

### Conditions (`game/conditions.ts`)

- **`evalCondition(condition, state)`** — Check if a node's conditions pass (flags, brand met, archetype, postReveal).

### Matching and reveal (`game/compatibility.ts`)

- **`needWeights(state)`** — Normalize player evidence into weights summing to 1 (direction-independent magnitude).
- **`closestArchetype(weights)`** — Find the consumer archetype with highest overlap to the player's needs.
- **`effectiveProfile(brandId, state, context?)`** — Retrieve a brand's profile: base + player perception deltas + active modifiers for this context. Base profile is never mutated.
- **`matchBreakdown(playerWeights, brandProfile)`** — Weighted compatibility scored 0–100, with breakdowns of why it fits and where it clashes. Uses asymmetric tension: negative contributions count TENSION_WEIGHT (1.5x) against the match, so a strong brand negative colliding with an important player need hurts more than an equivalent positive helps.
- **`rankAllBrands(state, weights, context?)`** — All brands ranked best-first by match score. Only brands marked `recommendationEligible` appear; unbranded wilds (e.g., Sleep, the Gym) are excluded.
- **`auditReadiness(state)`** — Confidence decision. Checks whether removing any one completed encounter changes either the archetype or top recommendation. If the top archetype and brand remain stable across all leave-one-out subsets, and the player has met the minimum encounter and choice breadth, the reveal is confident. Otherwise, it's only available after 7 encounters.

The reveal is a stability check, not a counter. It derives history from `choiceLog`, so save games keep their existing shape.

### Modifiers (`game/modifiers.ts`)

- **`activeModifiers(brandId, context)`** — Return all modifiers applying to this brand in the current context (location, date, flag). Modifiers are checked in registry order; each applies at most once.
- **`applyModifierStack(profile, modifiers)`** — Add modifier effects additively to a profile, clamped into ±5.

Modifiers never mutate stored state. They stack at read time when you call `effectiveProfile(...)` with a context.

### Audio (`game/audio/AudioManager.ts`)

WebAudio singleton managing music crossfades, per-line voice-over loudness normalization, and music ducking under speech.

- **Voice-over normalization:** Each of 612 clips is measured for gated loudness on decode. A make-up gain is calculated to normalize to -14 dB target. Clips are soft-limited to prevent clipping when boosted. This makes all VO lines audible and level-matched despite being recorded at different levels.
- **Music ducking:** When VO plays, music volume drops to 0.22x (roughly 15 dB). When VO stops, music fades back up over 1.2 seconds.

### Save and settings (`game/save.ts`)

- **`persistSave(envelope)`** — Write to `localStorage[dsim.save.v1]` with version and timestamp.
- **`loadSave()`** — Read from storage. Version mismatch discards the save (player starts over).
- **`persistSettings(settings)`** — Write volume and text speed.
- **`loadSettings()`** — Read settings with defaults. All settings are local; no server persistence.
- **One-shot flags:** `MAP_HINT_KEY` and `AUDIT_NUDGE_KEY` mark whether the player has seen the map tutorial and the "split audit" nudge, respectively. If localStorage is unavailable (private mode), these default to "already seen" so the player isn't nagged on every visit.

## Presentation layer (`components/`)

React components for dialogue, reveals, title, and debug panel. The presentation layer reads game state via `useGame()` and dispatches actions (choose, advance, travel, reveal).

### Game store (`hooks/useGame.tsx`)

React Context + `useReducer`. Wraps the pure engine and drives persistence.

- **`GameStore`** — The public API: state, navigation, settings, plus methods (newGame, choose, advance, travel, etc.).
- **Reducer** — Handles NEW_GAME, CHOOSE, ADVANCE, TRAVEL, TO_TITLE, SET_PHASE (title → play → map → reveal). Autosaves on every play-phase change.
- **Side effects:**
  - Settings are persisted every time they change and pushed into AudioManager.
  - Game state is autosaved every play-phase change.
  - Settings are hydrated once after mount (client-side only, avoids SSR mismatch).

### World map pan/zoom (`hooks/useWorldPan.ts`)

Component-local presentation state for map camera, pan/zoom/pinch gestures. **No game state enters this hook.** It holds only camera transforms and gesture bookkeeping.

- **Gesture contract:**
  - Middle-mouse drag pans (desktop).
  - Two-finger drag pans (touch).
  - Left-drag on empty space pans (matches every map UI).
  - Wheel zooms (desktop), pinch zooms (touch). Zoom is anchored on cursor/midpoint so the spot under the pointer stays put.
  - Single taps/clicks on hit zones trigger date selection. A tap is only resolved if the pointer stayed within 10px of where it started, so a pan or pinch can never register as a tap.
- **Zoom range:** 1× (opening framing) to 3× (readable detail). Zoom-out floor stops when the world's first axis reaches 100% of the viewport, so the map always fills the screen without letterboxing.

## Persistence layer

### localStorage schema

- **`dsim.save.v1`** — Game state envelope with version, timestamp, and navigation. Version mismatch discards the save.
- **`dsim.settings.v1`** — Audio volumes (master, music, sfx, voice), mute flag, text speed.
- **`dsim.maphint.v1`** — One-shot flag marking that the map control hint has been shown.
- **`dsim.auditnudge.v1`** — One-shot flag marking that the split-audit nudge has been shown.

All access is wrapped in try-catch. Private mode (unavailable storage) defaults to "already seen" for hints and plays without saves.

### Content validation (npm run validate)

Validation is a hard prebuild gate. The validator checks:

1. **Schema** — All JSON files conform to the content schema (required fields present, no unknown fields).
2. **Cross-references** — All IDs referenced (evidence, sources, assets, brands, archetypes, modifiers) actually exist.
3. **ID uniqueness** — No duplicate IDs per collection.
4. **Vector ranges** — Need profiles range -5 to +5; per-choice effects range -3 to +3.
5. **Modifiers** — Conditions (location, occasion, dateId, hasFlag) are valid.
6. **Evidence** — Every sourced card cites real sources. All evidence is locked to a date.
7. **Orphaned content** — No unreferenced files or IDs without referrers.

The validation script lives in `scripts/validate-content.mjs` and is invoked as a prebuild via `npm run validate`. It prints real totals and stops the build if anything is wrong.

## Data flow

1. **Title** — Player presses "New Game" or "Continue".
2. **Hub tree** — Entry point with menu and world map access.
3. **World map** — Player taps a hit zone (location).
4. **Date encounter** — Engine enters the tree, applies entry conditions, unlocks evidence, renders dialogue.
5. **Choice** — Player selects an answer. Engine applies ledger (evidence, perception, chemistry, flags), renders next node.
6. **Next tree** — Player reaches a choice leading to another date, the map, or the reveal.
7. **Reveal** — Engine calculates closest archetype from accumulated evidence. Renders consumer profile and brand recommendations.
8. **Post-reveal** — Player returns to map or exits. Content conditionally gated by `postReveal` flag plays.

Throughout, player progress autosaves every dialogue beat. localStorage always reflects the current play phase and player state.

## ADRs and constraints

- **ADR-01:** Brand perception is not a brand attribute; it's player-discovered. Base profiles live in `brands.json`. Per-date deltas are stored separately, so replaying any choice sequence always produces the same state.
- **ADR-03:** One set of need dimensions (10 total) organizes players, brands, archetypes, evidence, and modifiers. Defined once in `game/types.ts` and mirrored in `tools/validate-core.mjs`.
- **ADR-04:** The engine knows nothing about story content. Everything story-shaped arrives via arguments. Content is the registry boundary; the engine is pure and content-agnostic.
- **ADR-06:** Audio is a WebAudio singleton. Voice-over loudness is normalized per-clip on decode. Music ducks under speech at 0.22x.
- **ADR-08:** Reveal matching uses asymmetric tension weighting. Negative contributions count 1.5x against the match.
- **ADR-09:** Saves are versioned envelopes. Version mismatch discards. Every access is private-mode safe.
