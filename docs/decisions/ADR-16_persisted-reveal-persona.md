# ADR-16 — Persist the selected reveal persona

Date: 2026-08-26 · Status: accepted

## Context

The consumer reveal gives the otherwise abstract archetype a named, visual player proxy. The
proxy must not change when the reveal is revisited or a saved game resumes.

## Decision

Each archetype owns one feminine-presenting and one masculine-presenting persona in
`content/archetypes.json`; each references an asset by ID. When the player first enters the
reveal, the React store chooses one of that archetype's two IDs and saves it in
`GameState.revealedPersonaId`. The engine remains free of content names and randomness. The
reveal renders the exact selected alpha sprite first as a CSS-filtered silhouette, then in full
color, then explains the archetype.

## Consequences

The GameState shape changes, so `SAVE_VERSION` is 4. ADR-09's discard-on-mismatch rule applies.
The development-only debug panel can explicitly select any persona for review without affecting
production bundles.
