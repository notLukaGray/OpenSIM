# ADR-04 — Content is JSON; engine is story-blind

Date: 2026-08-23 · Status: accepted

All narrative lives in `content/**/*.json` behind typed registries (`content/registry.ts`). JSON
(not TS literals) so a dependency-free Node validator can gate builds without a TS toolchain, and
so content authors never touch code. TS `satisfies` checks at the registry boundary give type
safety; the validator gives semantic safety.

Consequence: adding a date = one JSON file + validation. Engine code contains zero brand names,
lines, or asset paths (grep-enforced).
