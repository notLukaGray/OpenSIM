# ADR-13 — Voice lines are addressed by convention, not stored paths

Date: 2026-08-23 · Status: accepted

Every dialogue line has a deterministic VO slot: `/assets/vo/<treeId>/<nodeId>/<lineIndex>.mp3`
(lineIndex = 0-based position in the node's `text` array). The engine attempts the fetch when a line
starts; a missing file is a silent no-op. A dedicated `voice` bus (own persisted volume + settings
slider) sits under master, and music ducks to ~35% while a clip plays.

Rationale: dialogue will be AI voice-acted in bulk. A convention means the pipeline can generate
files against stable addresses with zero content edits, and partial coverage (some scenes voiced,
some not) degrades gracefully.

Consequence: re-recording a line = replacing one file; inserting a line mid-node shifts later
indexes (regenerate or rename those files); content never stores voice paths.
