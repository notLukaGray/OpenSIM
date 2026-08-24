# ADR-14: Brand-history conditions for encounter entry

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Dates need to distinguish a consumer's first encounter with a brand from a
later encounter with that same brand. That distinction is story state, not a
new consumer trait: `GameState.dated` already records brands met after an
encounter is completed.

## Decision

Content conditions may declare `brand: { id, met }`. `met: false` is true only
when the brand is absent from `state.dated`; `met: true` is true only after it
has been recorded there. The date-entry helper resolves conditional
pass-through nodes before rendering the first node, just as forward traversal
already does.

## Consequences

- A single date tree can carry a first-meeting and already-using scene without
  duplicating a tree or changing saved-state shape.
- Conditions stay content-authored and the engine stays brand-blind.
- Validation confirms that a condition references a real brand and that `met`
  is boolean.
- This does not require a `SAVE_VERSION` bump because it reads an existing
  persisted field.
