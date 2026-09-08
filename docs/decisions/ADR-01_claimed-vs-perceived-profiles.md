# ADR-01 — Two-axis brand model: claimed vs perceived

Date: 2026-08-23 · Status: accepted

Every brand carries `claimedProfile` (what the brand wants you to believe) and `perceivedProfile`
(what consumers broadly associate) on the same −5..+5 need scale. They may intentionally differ;
that gap is strategic content and drives date tension. Dates never edit either axis — they add
per-playthrough *discovered deltas* (`state.brandPerception`), stacked at read time only.

Consequence: match math always reads an *effective* profile = perceived + discovered + modifiers,
clamped ±5. There is no code path that mutates base profiles.
