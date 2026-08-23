# ADR-11 — Debug panel exists only in development

Date: 2026-08-23 · Status: accepted

`components/debug/DebugPanel.tsx` mounts only when `process.env.NODE_ENV !== "production"`. It can
inspect everything and mutate anything (jump to scene, force archetype/ending, adjust values) —
which is exactly why it must never ship. Verified by grepping the production bundle.

Consequence: story development gets full x-ray vision; players never do.
