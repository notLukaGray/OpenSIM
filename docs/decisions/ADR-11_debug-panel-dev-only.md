# ADR-11 — Debug panel exists only in development

Date: 2026-08-23 · Status: accepted

DebugPanel lives behind an inlined dev gate and a lazy `dynamic()` import: the panel is isolated
in a chunk that NO production code references or fetches (verified by grep of the build output),
and it renders only when `process.env.NODE_ENV !== "production"`. It can
inspect everything and mutate anything (jump to scene, force archetype/ending, adjust values) —
which is exactly why it must never ship. Verified by grepping the production bundle.

Consequence: story development gets full x-ray vision; players never do.
