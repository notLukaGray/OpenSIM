# ADR-02 — Chemistry is separate from compatibility

Date: 2026-08-23 · Status: accepted

Dating chemistry (`relationshipEffects`, `state.chemistry`) gates flavor only: flirtier dialogue,
reactions, callbacks, affectionate sprite variants, closing tone. It NEVER enters compatibility or
match scores. A player can have great chemistry with a functionally poor match — that contrast is
part of the game's point.

Consequence: no scoring function may read `chemistry`. Enforced by review; kept structurally
separate so accidental coupling is visible in diffs.
