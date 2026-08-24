# DSIM — Love, Loyalty & Brand Preference

A browser-based, Japanese-style dating sim about **brand perception** and **consumer expectation**.
You think you are dating brands and learning which one you like. In reality, every choice is
revealing the consumer you are playing — and every date teaches you what each brand actually means,
positively and negatively.

**The two reveals everything serves:**

1. **Who is this consumer?** — inferred from accumulated choice evidence, never shown raw.
2. **What do these brands actually mean to them?** — claimed image vs. perceived reality vs. your
   own discovered experience of them.

The player spends the game thinking they are judging brands. By the end, they realize the brands
have been helping reveal them. The game never implies one brand is universally "best."

## Status: BETA (infrastructure complete, story content placeholder)

Deploy target: **Vercel** (Next.js + TypeScript, static-friendly, no persistent server).

| Works today |
| --- |
| Data-driven encounters (a date = brand × location) — add one without touching the engine |
| Travel map: locations as destinations, products showing up in multiple places |
| Hidden player-evidence model → consumer archetype reveal |
| Claimed vs. perceived brand profiles + per-playthrough discovered perception |
| Context modifiers that stack without mutating base profiles |
| Brand evidence cards surfaced inside dates ([MEMORY UNLOCKED] moments) |
| Dating chemistry kept strictly separate from strategic compatibility |
| Weighted product matching with why-it-works / tension breakdowns |
| Asset + music registries (IDs everywhere), placeholder art & generated audio |
| Per-line AI-VO slots (`/assets/vo/<tree>/<node>/<line>.mp3`) with voice bus + music ducking |
| VN stage: sprites, expressions, positions, transitions, CG viewer, fades/wipes |
| Save / Continue / Reset via localStorage, volume + mute settings |
| Loud content validation (prebuild gate + dev overlay) |
| Dev-only debug panel (inspect, jump, force, adjust) |

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
npm run validate   # validate all content loudly
npm run build      # gated by validation; must pass before deploy
```

## Repository map

```text
app/            Next.js shell (routes, metadata, global styles)
components/     Presentation layer — VN primitives, reveals, title, debug panel
content/        ALL game content as JSON + typed registries (no story logic anywhere else)
game/           Pure engine — state, effects, modifiers, compatibility, save, audio manager
hooks/          React bindings for the game store
public/assets/  Served binaries (art/audio) referenced ONLY through the asset registry
scripts/        Content validator CLI, placeholder art/audio generators
docs/           Architecture, authoring guide, briefs, ADRs, journal
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — every system, its contract, and why it exists.
- [`docs/AUTHORING.md`](docs/AUTHORING.md) — how to add a date / brand / evidence / modifier / assets.
- [`docs/briefs/`](docs/briefs/) — ordered build briefs (phases) with observable results per brief.
- [`docs/decisions/`](docs/decisions/) — ADRs: the decisions you must not silently reverse.
- [`docs/JOURNAL.md`](docs/JOURNAL.md) — resumable execution record (commands + exit codes).
- [`AGENTS.md`](AGENTS.md) — standing rules for any agent working in this repo.

## How work gets added

Work is specified as **briefs** under `docs/briefs/<phase>/`, executed one at a time in table order.
Each brief states its outcome, allowed files, definition of done, and stop conditions. Finished
briefs get marked DONE in the phase README and logged in `docs/JOURNAL.md`. To change architecture,
write an ADR first. This mirrors the documentation system proven in `nlg-site`.
