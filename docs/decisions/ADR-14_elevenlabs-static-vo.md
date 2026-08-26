# ADR-14 — ElevenLabs generates static VO assets

## Context

Dialogue VO remains static, per-line media addressed by ADR-13. Amazon Polly was used only by
the offline generation workflow, and its credentials were retained in a developer environment.

## Decision

The offline generator uses ElevenLabs' synchronous Text-to-Speech API. It reads the existing VO
manifest, skips `PLAYER`, narrator, ellipsis, `JUST THE GYM`, and `SLEEP` lines, then writes
`mp3_44100_128` files to their existing deterministic addresses under `public/assets/vo/`. The web
client continues to use only those static files and never receives an API key. The two unbranded
control characters remain deliberately text-only.

The manifest carries a dialogue node's authored sprite expression. With the default `eleven_v3`
model, the generator maps it to a non-spoken delivery cue: happy/warmly, special/confidently,
embarrassed/slightly sheepish, annoyed/dryly, and neutral/calmly. Other models receive the original
dialogue unchanged, so those model families never speak a bracketed cue aloud.

Each speaker's ElevenLabs voice ID is an environment variable derived from the speaker label;
e.g. `LIQUID I.V.` uses `ELEVENLABS_VOICE_LIQUID_I_V_ID`. `npm run vo:generate -- --tree=<treeId>`
limits a generation run to one date tree; `--location=<locationId>` produces every eligible scene at
one location; `--force` regenerates existing eligible clips.

## Consequences

Generated files are disposable build artifacts. Deleting `public/assets/vo/` is safe; the command
recreates the manifest and the selected clips. AWS is not used by the VO pipeline. Existing AWS
credentials must be revoked or rotated outside this repository.
