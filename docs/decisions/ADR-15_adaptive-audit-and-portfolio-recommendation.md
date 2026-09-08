# ADR-15 — Adaptive audit and portfolio recommendation

Date: 2026-08-25 · Status: accepted

The consumer reveal is an inference, not a reward for a fixed count of dates. It has a hard floor of
four encounters, resolves early only when choice breadth and leave-one-encounter-out results are
stable, and resolves at seven with a clearly provisional label when necessary. Readiness is derived
from `choiceLog` and the content registry, preserving the save shape.

The recommendation ranks the content-owned `recommendationEligible` portfolio. Dating determines
what has been personally experienced, not what objectively best aligns with the revealed consumer.
The reveal presents these independently as **best fit** and **strongest lived evidence**. Chemistry
continues to affect neither.

Main reveal scoring is deliberately context-free: perceived profile plus discovered deltas and
flag-gated modifiers. A future occasion selector may request a contextual recommendation explicitly;
it must pass that selected context into modifier resolution rather than silently using a prior date.
