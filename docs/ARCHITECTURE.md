# Architecture

DSIM is a Next.js 15 + React 19 + TypeScript app. Desktop 16:9 is the priority; the stage is
letterboxed to a fixed aspect ratio and scaled to fit. There is no persistent server — all content
ships as static JSON in the bundle, state lives in memory + localStorage.

```text
content/*.json ──► content/registry.ts (typed registries) ──┐
                                                            ▼
user input ──► hooks/useGame (reducer store) ──► game/engine (pure) ──► new state
                                                            │
                    components/ (VN stage, reveals, panels) ◄┘
                                    │
                    public/assets via asset registry IDs
```

## Layer contracts

| Layer | May import | Must never |
| --- | --- | --- |
| `game/` | `content/registry` types only | touch DOM, React, audio devices, or story literals |
| `hooks/` | `game/*`, React | know any content shape beyond registry lookups |
| `components/` | `hooks/*`, registries, CSS | compute scores or mutate state directly |
| `scripts/` | Node builtins, `tools/validate-core.mjs` | import app code |

## Directory map

```text
app/                      layout.tsx (metadata/fonts), page.tsx (<Game/>), globals.css
components/
  stage/                  Stage, CharacterSprite, TransitionLayer, CGViewer, EvidenceOverlay
  dialogue/               DialogueBox, SpeakerTab, ChoiceList, ContinueIndicator, GameControls
  reveal/                 ConsumerReveal, MatchReveal
  meta/                   TitleScreen, SettingsPanel
  debug/                  DebugPanel (dev-only)
content/
  needs.json?             (no — needs are code-level constants in game/types.ts)
  brands.json             brand records: claimedProfile + perceivedProfile (-5..5)
  dates/*.json            one file per date; hub is dates/home.json
  archetypes.json         5 consumer archetypes as target need-weight profiles
  modifiers.json          contextual perception modifiers
  evidence.json           brand evidence cards (real-world material placeholders)
  assets.json             asset registry (id → type/src/alt/preload/fallback)
  audio.json              music/sfx registry (id → src/loop/volume/fade)
  registry.ts             static imports, TS satisfaction checks, dev validation hook
game/
  types.ts                Need set, vectors, Brand/Archetype/GameState types, SAVE_VERSION
  engine.ts               applyChoice, resolveLines, markDated — pure transforms
  compatibility.ts        needWeights, closestArchetype, effectiveProfile, matchScore, rankedBrands
  modifiers.ts            modifier activation/resolution for a context
  conditions.ts           flag condition evaluation for nodes/choices
  save.ts                 serialize/deserialize/migrate localStorage envelope
  audio/AudioManager.ts   WebAudio singleton: music bus, sfx bus, fades, crossfade, unlock
hooks/
  useGame.tsx             reducer store provider; autosave middleware
public/assets/            characters/ backgrounds/ cg/ ui/ music/ sfx/ (generated placeholders)
scripts/
  validate-content.mjs    CLI validator (prebuild gate)
  generate-placeholder-art.mjs / -audio.mjs   deterministic placeholder generation
tools/
  validate-core.mjs       dependency-free validation rules shared by CLI and dev overlay
```

## The dimension set

One shared set of emotional needs organizes players, brands, archetypes, evidence effects, and
modifiers (defined once in `game/types.ts`, mirrored by validator):

`control, readiness, reassurance, aspiration, belonging, mastery, comfort, excitement,
selfExpression, trust`

- **Player**: choices accumulate signed evidence per need. Hidden during play.
- **Brands**: profiles on **−5..+5** per need. `claimedProfile` = the brand's pitch;
  `perceivedProfile` = broad market read. These may intentionally differ (that gap is content).

## State

```ts
type GameState = {
  version: number;                 // SAVE_VERSION, migration anchor
  evidence: NeedVector;            // player reveal evidence (signed)
  brandPerception: Record<BrandId, NeedVector>; // discovered deltas this playthrough
  chemistry: Record<BrandId, number>;           // flavor only, never scored
  choiceLog: Record<TreeId, ChoiceId[]>;        // powers callbacks & conditions
  flags: Record<string, boolean | number | string>;
  unlockedEvidence: EvidenceId[];
  dated: BrandId[];
  choicesMade: number;
};

type Navigation = { phase: "title" | "play" | "reveal"; treeId: string; nodeId: string };
type Settings = { master: number; music: number; sfx: number; muted: boolean };
```

Persisted envelope (localStorage key `dsim.save.v1`): `{ version, savedAt, state, navigation }`.
Settings persist separately (`dsim.settings.v1`). Autosave fires on every node advance / choice.

## Perception resolution order (match time)

```
effectiveProfile(brand, context) =
  clamp( perceivedProfile
       + discoveredDeltas(state.brandPerception[brand])     // from date choices
       + Σ activeModifiers(context, flags).effects          // location/occasion/flags
       , -5, +5 )
```

Base `perceivedProfile` and `claimedProfile` are never written to. Modifier activation is computed,
not stored: given `{treeId, location, occasion}` plus current flags, `resolveModifiers` returns the
stack (each modifier applies at most once per evaluation, deterministic order = registry order).

## Scoring

1. `needWeights(state)` — normalize `|evidence|` into weights summing to 1 ("how much did they
   reveal they care about each need", direction-independent).
2. Archetype fit — cosine-style weighted overlap of weights against each archetype's normalized
   target weights; highest wins.
3. Compatibility — weighted dot product of weights × effective profile with **asymmetric tension**:
   negative contributions are multiplied by `TENSION_WEIGHT` (>1), because a strong brand negative
   colliding with an important player need should hurt more than the equivalent positive helps.
   Mapped to 0–100. Every dated brand is listed; top match shown with why/tension breakdowns.
4. Chemistry — running total per brand; thresholds gate flirtier lines, sprite affection variants,
   and date-closing tone. Never enters scoring.

## Reveal pipeline

`phase: "reveal"` renders `ConsumerReveal` then `MatchReveal`:

1. WHO HAVE YOU BEEN PLAYING? → silhouette (asset id `reveal-silhouette`)
2. archetype card + short personalized explanation
3. top emotional needs (normalized weight bars)
4. MatchReveal: ranked dated brands, YOUR MATCH header, why-it-works (+needs), tension (−needs)

Both are components driven by pure engine output — no scores recomputed inside JSX.

## Audio

`AudioManager` (WebAudio, singleton): `music` and `sfx` GainNodes under master; `playMusic(id)`
crossfades (~1.2s default) with per-track loop points; `playSfx(id)` one-shots; persisted settings;
unlock-on-first-gesture for autoplay policy; tab-blur auto-ducking. Dates/nodes reference tracks by
ID only. Placeholder WAVs are procedurally generated (`scripts/generate-placeholder-audio.mjs`) so
the real pipeline is exercised end-to-end.

## Validation

Single rule-set in `tools/validate-core.mjs` (dependency-free ESM, runs in Node AND browser):

- every node `next`/`choices[].next` resolves within its tree; every `nextTree` exists
- trees reachable from the hub can reach an ending (exit to hub/reveal) — no dead ends
- all asset/music/evidence/modifier/brand/archetype IDs referenced anywhere exist
- all dimension names valid; profile values within −5..+5; player effects within ±3
- callbacks reference choice IDs that exist earlier in their tree; conditions reference declared flags
- balance guard: every brand has ≥2 positive and ≤... at least one negative perceived dimension and
  no brand dominates the sum of all profiles

Wired twice: `npm run validate` (also runs as `prebuild`) and a dev-only overlay that mounts the
same core against the bundled registries. Production builds cannot ship invalid content.

## Performance / Vercel notes

- Static export-friendly: no server runtime; `output` left default (Node server for `next start`
  locally, but nothing request-time dependent).
- Asset preloading: entering a date preloads its background/music/sprite set (registry
  `preload: true` items are warmed during idle on the hub).
- Audio files are lazy `<audio>`/fetch on first use; art is SVG (tiny); no client JS > ~300KB gz.
