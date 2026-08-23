# ADR-09 — localStorage saves; version mismatch discards

Date: 2026-08-23 · Status: accepted

Saves are a versioned envelope in localStorage (`dsim.save.v1`: state + navigation + savedAt),
settings separately (`dsim.settings.v1`). On shape change, bump `SAVE_VERSION`; on mismatch the save
is discarded (title screen, fresh start) rather than migrated or crashed. All storage access is
try/catch wrapped (private mode safe).

Consequence: no migration debt during beta; players accept a fresh run when the schema changes.
