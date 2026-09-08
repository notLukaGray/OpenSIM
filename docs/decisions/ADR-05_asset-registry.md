# ADR-05 — Assets resolve only through the registry

Date: 2026-08-23 · Status: accepted

`content/assets.json` maps stable IDs to `{type, src, alt, preload, fallback}`. Files live under
`public/assets/**`. No component or content file references a raw path outside the registry.
Placeholders are generated (`scripts/generate-placeholder-art.mjs`) and byte-deterministic so real
art replaces them by file swap with zero code change.

Consequence: asset reorganization never touches game code; preloading decisions live in one place.
