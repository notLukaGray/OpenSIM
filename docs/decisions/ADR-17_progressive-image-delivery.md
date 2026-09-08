# ADR-17 — Progressive image delivery keeps masters local

Date: 2026-08-26 · Status: accepted

## Context

The game uses many painted character sprites. Serving the PNG masters made first encounters and
the consumer reveal visibly late on uncached connections. Preloading every asset at title would
only move that delay to the start screen and compete with the map and title art.

## Decision

Keep every PNG/JPEG source master and serve a registered WebP derivative whenever it is smaller.
The optimizer processes every raster listed in the content asset registries — characters,
backgrounds, map, title, and reveal sprites — through `npm run assets:optimize`; it will retain a
JPEG source when its WebP would be larger. The same command writes an optimized sibling for the
logo SVG while retaining its source SVG. Next's image optimizer can still negotiate AVIF/WebP
responses and cache them. The title warms the optimized map request, not its raw source. Once a
player has completed three encounters, the map warms only the reveal background and the two
eligible personas for their current archetype.

## Consequences

Master files remain available for later art changes. Delivery is targeted rather than eagerly
loading the entire cast; first reveal navigation should use browser-cached image responses.
