# ADR-08 — Asymmetric tension in compatibility; no universal best

Date: 2026-08-23 · Status: accepted

Compatibility weights the player's strongly-revealed needs more (weights = normalized |evidence|)
and multiplies negative contributions by `TENSION_WEIGHT = 1.5`: a strong brand negative colliding
with an important need hurts more than the equivalent positive helps. The validator additionally
requires every brand to carry ≥2 clearly negative perceived dimensions and forbids any brand from
dominating the sum across all profiles.

Consequence: no product can appear perfect; the reveal can honestly say "why it works" AND "the
tension" for every brand.
