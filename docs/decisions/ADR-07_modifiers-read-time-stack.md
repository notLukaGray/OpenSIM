# ADR-07 — Modifiers stack at read time; base profiles immutable

Date: 2026-08-23 · Status: accepted

Context (location/occasion/date/flags) activates modifiers from `content/modifiers.json`, resolved
deterministically in registry order, each applying once, stacked additively and clamped ±5 onto the
perceived profile at read time. Nothing ever writes modifier effects into stored state or base
profiles.

Consequence: the same brand reads differently by context with zero state duplication; the debug
panel can always show exactly which modifiers are live and why.
