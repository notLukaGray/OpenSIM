# ADR-06 — One WebAudio manager; unlock on gesture

Date: 2026-08-23 · Status: accepted

All audio flows through `AudioManager` (WebAudio singleton): master → music/sfx buses, crossfading
music tracks (~1.2s), one-shot SFX, persisted mute/volumes, tab-blur ducking. Browsers block audio
before a user gesture — the manager queues the first requested track and starts it on first
pointer/keydown. Content references tracks by ID (`content/audio.json`); brand logic never touches
audio devices.

Consequence: no `<audio>` elements scattered in components; autoplay policy handled once.
