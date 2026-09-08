# Authoring Guide

This guide explains how to add game content: dates (encounters), evidence cards, modifiers, brands, archetypes, and assets.

## Adding a date (encounter)

A date is a branching dialogue tree between the player and a brand at a location. It's a single JSON file.

### 1. Create the date file

Create `content/dates/<brand>-<location>.json`. Use lowercase IDs with hyphens (e.g., `starbucks-kitchen.json`).

```json
{
  "id": "starbucks-kitchen",
  "brandId": "starbucks",
  "title": "Personal Cups and Expiring Stars",
  "locationId": "kitchen",
  "context": {
    "location": "kitchen",
    "occasion": "morning"
  },
  "music": "track-morning-light",
  "background": "bg-kitchen",
  "cast": [
    {
      "assetId": "char-starbucks-neutral",
      "position": "center",
      "name": "Starbucks"
    }
  ],
  "startNode": "entry-return",
  "entryPoints": ["entry-first"],
  "lessons": [
    "The player learns X.",
    "The player learns Y."
  ],
  "nodes": {
    "entry-first": {
      "speaker": "...",
      "conditions": { "brand": { "id": "starbucks", "met": false } },
      "text": ["First time meeting this brand here."],
      "next": "shared-content"
    },
    "entry-return": {
      "speaker": "...",
      "conditions": { "brand": { "id": "starbucks", "met": true } },
      "text": ["Returning after meeting before."],
      "next": "shared-content"
    },
    "shared-content": {
      "speaker": "STARBUCKS",
      "sprite": { "expression": "happy", "position": "center" },
      "text": ["A dialogue line."],
      "next": "choice-node"
    },
    "choice-node": {
      "speaker": "STARBUCKS",
      "text": ["Question?"],
      "choices": [
        {
          "id": "choice-1",
          "text": "Player response 1",
          "playerEffects": { "control": 2, "readiness": 1 },
          "brandPerceptionEffects": {
            "starbucks": { "comfort": 1 }
          },
          "relationshipEffects": {
            "starbucks": 1
          },
          "evidence": "ev-starbucks-cups",
          "next": "after-choice-1"
        },
        {
          "id": "choice-2",
          "text": "Player response 2",
          "playerEffects": { "aspiration": 2 },
          "brandPerceptionEffects": {
            "starbucks": { "aspiration": 1 }
          },
          "next": "after-choice-2"
        }
      ]
    },
    "after-choice-1": {
      "speaker": "STARBUCKS",
      "text": ["Response to choice 1."],
      "nextTree": "map"
    },
    "after-choice-2": {
      "speaker": "STARBUCKS",
      "text": ["Response to choice 2."],
      "nextTree": "map"
    }
  }
}
```

### 2. Sync the date registry

After creating or removing a date file, regenerate the auto-discovered registry:

```bash
npm run sync:dates
```

This updates `content/date-registry.generated.ts` to include your new date.

### 3. Link evidence to the date

If your date tree has choice or node `evidence` fields that reference evidence cards from `content/evidence.json`, run validation to derive the `dateId`:

```bash
npm run validate
```

Validation scans all dates for evidence references and injects each card's `dateId` (which date unlocks it) into the evidence record. This link is used to report which dates unlock which cards.

### 4. Validate

```bash
npm run validate
```

This checks:
- All referenced brands, locations, assets, and evidence cards exist.
- Need vectors are in valid ranges (player effects -3 to +3, brand profiles -5 to +5).
- No orphaned content.
- Evidence cards are locked to a date.

## Adding an evidence card

Evidence cards are real, sourced claims about brands. They reinforce or challenge the player's perception.

### 1. Add the card to `content/evidence.json`

```json
{
  "id": "ev-starbucks-cups",
  "brandId": "starbucks",
  "type": "retail",
  "title": "Personal Cup Rewards",
  "description": "Starbucks rewards customers with Stars for bringing reusable cups to any order (cafe, drive-thru, mobile). This incentivizes sustainable behavior through the Rewards program.",
  "imageRef": "ev-starbucks-cups",
  "sourceIds": [
    "src-starbucks-sustainability",
    "src-starbucks-rewards-faq"
  ],
  "effects": {
    "comfort": 1,
    "readiness": 1
  }
}
```

**Fields:**

- **`id`** — Unique identifier (e.g., `ev-brand-topic`).
- **`brandId`** — Which brand this card is about.
- **`type`** — One of: `ad`, `campaign`, `product`, `culture`, `retail`, `social`.
- **`title`** — Short headline.
- **`description`** — Paragraph describing the real claim, with enough specificity that someone could fact-check it.
- **`imageRef`** — Optional asset ID for a card image. If omitted, the card renders as text.
- **`sourceIds`** — Array of source IDs from `content/sources.json` that back this claim. Every card should cite at least one real source.
- **`effects`** — Need vector deltas (-5 to +5) applied once to the brand's perceived profile when the card is unlocked.

### 2. Add sources to `content/sources.json`

If your card references sources that don't exist, add them:

```json
{
  "id": "src-starbucks-sustainability",
  "title": "Starbucks Sustainability Practices",
  "publisher": "Starbucks Stories",
  "year": 2024,
  "url": "https://www.starbucksstories.com/stories/sustainability"
}
```

**Fields:**

- **`id`** — Unique source identifier.
- **`title`** — Source title.
- **`publisher`** — Where it's from (press release, news outlet, blog, etc.).
- **`year`** — Optional publication year.
- **`url`** — Optional URL. If provided, it's validated to not 404.

### 3. Link the card to a date

Add an `evidence` field to a node or choice in a date tree that will unlock this card:

```json
"evidence": "ev-starbucks-cups"
```

Run `npm run validate` to verify the link and auto-inject `dateId` into the evidence record.

## Adding a modifier

Modifiers contextually adjust a brand's profile. They activate when a brand appears at a specific location, in a specific date, or when a flag is set.

### Add to `content/modifiers.json`

```json
{
  "id": "mod-starbucks-home",
  "appliesTo": ["starbucks"],
  "when": {
    "location": "kitchen"
  },
  "effects": {
    "comfort": 2,
    "belonging": 1
  },
  "label": "It feels like home"
}
```

**Fields:**

- **`id`** — Unique identifier (e.g., `mod-brand-context`).
- **`appliesTo`** — Array of brand IDs this modifier affects. A modifier can apply to multiple brands.
- **`when`** — Activation condition. All specified conditions must match:
  - **`location`** — Location ID (from `content/locations.json`).
  - **`occasion`** — Occasion type (from date context).
  - **`dateId`** — Specific date tree ID.
  - **`hasFlag`** — Game flag that must be set (boolean).
- **`effects`** — Need vector deltas (-5 to +5) added to the brand's effective profile when active.
- **`label`** — Human-readable reason why this modifier applies (shown in debug panel).

Modifiers stack additively at read time. They never mutate stored state. If multiple modifiers activate, all their effects stack (clamped into ±5).

## Adding a brand

Brands are rosters of products or companies the player can date.

### Add to `content/brands.json`

```json
{
  "id": "my-brand",
  "name": "My Brand",
  "archetype": "The Optimizer",
  "color": "#FF6B6B",
  "sigil": "✦",
  "setting": "The city's newest spot",
  "personality": "Friendly and pragmatic",
  "claimedProfile": {
    "control": 2,
    "readiness": 1,
    "comfort": 0,
    "trust": 3
  },
  "perceivedProfile": {
    "control": 1,
    "readiness": 0,
    "comfort": 2,
    "trust": 2
  },
  "recommendationEligible": true
}
```

**Fields:**

- **`id`** — Unique identifier.
- **`name`** — Display name.
- **`archetype`** — Which archetype this brand embodies (cosmetic; guides casting but doesn't gate mechanics).
- **`color`** — Hex color for UI branding.
- **`sigil`** — A single character symbol or emoji representing the brand.
- **`setting`** — Where/how the brand shows up (flavor text).
- **`personality`** — One-liner describing the brand's tone.
- **`claimedProfile`** — What the brand says about itself (need vector, -5 to +5). Partial vectors are okay; missing dimensions default to 0.
- **`perceivedProfile`** — What players initially perceive (what you learn on first date). Can differ from claimed.
- **`recommendationEligible`** — Optional. If true, this brand appears in consumer recommendations. Default false. Unbranded wilds (e.g., Sleep, the Gym) should stay false.
- **`unbranded`** — Optional. If true, this brand is excluded from ranked matching. Use for non-commercial encounters.

## Adding an archetype

Archetypes are consumer types revealed at the end. Each has two personas (feminine and masculine).

### Add to `content/archetypes.json`

```json
{
  "id": "the-optimizer",
  "name": "The Optimizer",
  "description": "You prioritize efficiency and measurable results. You want products that work, tracking that proves it, and no wasted motion.",
  "weights": {
    "control": 3,
    "readiness": 2,
    "mastery": 2,
    "comfort": 1,
    "excitement": 0,
    "trust": 1,
    "aspiration": 0,
    "belonging": 0,
    "reassurance": 1,
    "selfExpression": 0
  },
  "personas": {
    "feminine": {
      "id": "opt-fem",
      "name": "The Optimizer (She/Her)",
      "assetId": "char-optimizer-fem"
    },
    "masculine": {
      "id": "opt-masc",
      "name": "The Optimizer (He/Him)",
      "assetId": "char-optimizer-masc"
    }
  }
}
```

**Fields:**

- **`id`** — Unique archetype identifier.
- **`name`** — Display name.
- **`description`** — What this consumer cares about and why.
- **`weights`** — A need vector showing what matters to this consumer (all 10 dimensions required, -5 to +5). These weights are compared against accumulated player evidence to find the closest archetype.
- **`personas.feminine` and `.masculine`** — Two presentation options. Each needs:
  - **`id`** — Unique persona ID.
  - **`name`** — Display name (can include pronouns).
  - **`assetId`** — Character sprite asset to display during the reveal.

At reveal, the engine picks one of the two personas at random (50/50) based on the player's accumulated evidence.

## Adding an asset

Assets are binaries (sprites, backgrounds, music) referenced by ID only.

### 1. Place the file in `public/assets/`

Store assets organized by type:

```
public/assets/
├── characters/       # character sprites
├── backgrounds/      # scene backgrounds
├── cg/              # full-size story images
├── music/           # background tracks
└── vo/              # voice-over audio
    └── <tree-id>/
        └── <node-id>/
            └── <line-index>.mp3
```

Voice-over files follow the convention `/assets/vo/<tree>/<node>/<line>.mp3` automatically based on dialogue line index.

### 2. Add to `content/assets.json`

```json
{
  "id": "char-my-brand-neutral",
  "type": "character-neutral",
  "path": "characters/my-brand-neutral.png"
}
```

**Fields:**

- **`id`** — Unique asset identifier.
- **`type`** — Asset type. Valid types:
  - `character-neutral`, `character-happy`, `character-annoyed`, `character-embarrassed`, `character-special`
  - `background`
  - `cg`
  - `audio-track` (for music in `audio.json`, not here)
- **`path`** — Relative path from `public/assets/`.

### 3. Reference in content

Reference assets by ID in dates:

```json
{
  "cast": [
    {
      "assetId": "char-my-brand-neutral",
      "position": "center"
    }
  ]
}
```

Or in backgrounds:

```json
"background": "bg-living-room"
```

Validation checks that every referenced asset exists.

## Adding music

Music tracks power ambient audio and branching themes.

### Add to `content/audio.json`

```json
{
  "id": "track-morning-light",
  "duration": 180,
  "loopStart": 32,
  "loopEnd": 176,
  "path": "music/morning-light.mp3"
}
```

**Fields:**

- **`id`** — Unique track identifier.
- **`duration`** — Total duration in seconds.
- **`loopStart`** — Beat (or second) where the loop begins.
- **`loopEnd`** — Beat (or second) where the loop ends.
- **`path`** — Path to the MP3 file in `public/assets/`.

Reference tracks by ID in date nodes:

```json
"music": "track-morning-light"
```

## Adding a location

Locations are world-map destinations and encounter settings.

### Add to `content/locations.json`

```json
{
  "id": "kitchen",
  "name": "Kitchen",
  "blurb": "Your everyday breakfast spot",
  "background": "bg-kitchen",
  "music": "track-morning",
  "color": "#FFD93D",
  "map": {
    "x": 45,
    "y": 50
  }
}
```

**Fields:**

- **`id`** — Unique location identifier.
- **`name`** — Display name.
- **`blurb`** — Short description for the map.
- **`background`** — Asset ID for the location background.
- **`music`** — Track ID for ambient music.
- **`color`** — Hex color for the map UI.
- **`map`** — World coordinates as percentages (0–100).

## Running validation

Always validate before committing content:

```bash
npm run validate
```

This checks:
- All JSON files conform to schema (required fields, valid types).
- Cross-references resolve (brands, locations, assets, evidence, archetypes, modifiers, sources).
- Need vectors are in range (-5 to +5 for profiles, -3 to +3 for per-choice effects).
- No orphaned or duplicate IDs.
- Evidence cards cite real sources.
- Evidence is locked to a date.

Validation must pass before the build proceeds.

## Workflow summary

1. **New date:** Create `content/dates/<id>.json`, write dialogue tree, add choices with effects.
2. **Link evidence:** Add `evidence` field to nodes/choices, run `npm run sync:dates` then `npm run validate`.
3. **Add new evidence:** Create card in `content/evidence.json`, add sources to `content/sources.json`, link to date.
4. **Add modifier:** Add to `content/modifiers.json` to contextually adjust brand profiles.
5. **New brand:** Add to `content/brands.json` with claimed vs. perceived profiles.
6. **New archetype:** Add to `content/archetypes.json` with two personas.
7. **New asset:** Place in `public/assets/`, add to `content/assets.json`.
8. **Validate:** Run `npm run validate` to catch errors before deploy.

All changes are caught by validation. The build will not proceed if content is invalid.
