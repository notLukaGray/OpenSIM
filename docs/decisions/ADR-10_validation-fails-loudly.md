# ADR-10 — Validation fails loudly, twice

Date: 2026-08-23 · Status: accepted

One dependency-free rule-set (`tools/validate-core.mjs`) runs in two places: `npm run validate` (as
`prebuild`, non-zero exit blocks deploy) and a dev-only overlay validating the bundled registries at
boot. Diagnostics name file, JSON path, and reason. Weakening a check to make bad content pass is
forbidden; fix the content.

Consequence: malformed content cannot silently break halfway through a date (brief §14).
