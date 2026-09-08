# ADR-18 — Keep the current screen visible during image handoff

Date: 2026-08-26 · Status: accepted

When a player starts a new game or selects an encounter, navigation must not expose an empty or
partially decoded scene. The current screen remains painted under a small dialogue-styled loading
overlay until the next screen's registered background and cast images (including every registered
expression variant for each cast member) have loaded and decoded.
NEW GAME applies the same rule to the map so its large background is ready before leaving the title.
Image failures resolve the wait and leave existing scene fallbacks in control; loading cannot strand
the player.
