#!/usr/bin/env node
/**
 * generate-placeholder-audio.mjs
 *
 * Dependency-free placeholder audio generator for DSIM. Writes mono 16-bit
 * PCM WAV files at 22050 Hz into public/assets/music/ and public/assets/sfx/.
 * The ids below are mirrored by the game's audio registry — keep them exact.
 *
 * Music tracks are seamless 8.000 s loops (176400 samples exactly):
 *   - Every oscillator frequency is snapped to a whole number of cycles per
 *     loop, so each partial returns to its starting phase at the seam.
 *   - Every amplitude LFO completes whole cycles inside the 8 s window.
 *   - Optional pulse/swell envelopes are whole-cycle or point-symmetric.
 *   - Only low harmonics (sine / triangle) are used, and the result is peak
 *     normalized to 0.35 for a calm bed.
 * => the loop point is mathematically click-free.
 *
 * SFX are short one-shots with exponential decays and edge fades.
 *
 * Usage (from the repo root):   node scripts/generate-placeholder-audio.mjs
 *
 * Deterministic: pure math, no randomness, no clock reads — a second run
 * produces byte-identical output. Uses only node:fs and node:path.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 22050;
const MUSIC_SECONDS = 8.0;
const MUSIC_SAMPLES = Math.round(SAMPLE_RATE * MUSIC_SECONDS); // 176400 exactly
const MUSIC_TARGET_PEAK = 0.35;

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

/** Equal-temperament frequency in Hz for a MIDI note number (A4 = 69 = 440 Hz). */
function hz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Snap a frequency to the nearest whole number of cycles per music loop so the
 * partial lands exactly back on its starting phase when the loop wraps. Worst
 * detune is a fraction of a cent at these frequencies — inaudible — but it
 * guarantees a click-free seam.
 */
function snapToLoop(freqHz) {
  return Math.round(freqHz * MUSIC_SECONDS) / MUSIC_SECONDS;
}

// Oscillators take "cycles" (phase in whole cycles), not radians.
function sineOsc(cycles) {
  return Math.sin(2 * Math.PI * cycles);
}

function triangleOsc(cycles) {
  const p = cycles - Math.floor(cycles);
  return 4 * Math.abs(p - 0.5) - 1; // [-1, 1], odd harmonics only (soft)
}

/**
 * Unipolar smooth LFO in [0, 1] that completes exactly `cycles` whole cycles
 * across the 8 s loop (so it is identical at t=0 and t=8).
 */
function loopLfo(t, cycles, phaseRad) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * cycles * t) / MUSIC_SECONDS + phaseRad);
}

function normalize(samples, targetPeak) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak === 0) return;
  const scale = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
}

/** Linear fade of the last `sec` seconds so one-shots never truncate audibly. */
function fadeOut(samples, sec) {
  const nFade = Math.min(samples.length, Math.round(sec * SAMPLE_RATE));
  const start = samples.length - nFade;
  for (let i = 0; i < nFade; i++) samples[start + i] *= 1 - i / nFade;
}

function toInt16(samples) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = Math.round(v * 32767);
  }
  return pcm;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Render an ambient pad loop from a spec:
 *   partials: [{ note, gain, wave: 'sine'|'triangle', lfo?: {cycles, depth, phase} }]
 *             — the chord; 3–5 low partials, each with its own gentle LFO.
 *   pulse?:   { cycles, depth } — faint rhythmic bump, whole cycles per loop.
 *   swell?:   { peakSec, floor } — single symmetric swell peaking at peakSec.
 */
function renderMusic(spec) {
  const out = new Float64Array(MUSIC_SAMPLES);

  for (const p of spec.partials) {
    const osc = p.wave === 'triangle' ? triangleOsc : sineOsc;
    const freq = snapToLoop(hz(p.note));
    for (let i = 0; i < MUSIC_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      let amp = p.gain;
      if (p.lfo) amp *= 1 - p.lfo.depth + p.lfo.depth * loopLfo(t, p.lfo.cycles, p.lfo.phase);
      out[i] += amp * osc(freq * t);
    }
  }

  if (spec.pulse) {
    const { cycles, depth } = spec.pulse;
    for (let i = 0; i < MUSIC_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const bump = Math.max(0, Math.sin((2 * Math.PI * cycles * t) / MUSIC_SECONDS));
      out[i] *= 1 - depth + depth * bump * bump; // sin^2 => smooth bumps
    }
  }

  if (spec.swell) {
    const { peakSec, floor } = spec.swell;
    for (let i = 0; i < MUSIC_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      // 0 at both ends, 1 at t=peakSec — symmetric around the peak, loop-safe.
      const shape = 0.5 - 0.5 * Math.cos((Math.PI * t) / peakSec);
      out[i] *= floor + (1 - floor) * shape;
    }
  }

  normalize(out, MUSIC_TARGET_PEAK);
  return toInt16(out);
}

/**
 * Render a one-shot SFX from a spec:
 *   { seconds, tones: [{ start, midi?|freqHz?, gain, tau, attack }],
 *     fadeOutSec, targetPeak }
 * Each tone is a sine with exponential decay tau and a short linear attack.
 */
function renderOneShot(spec) {
  const n = Math.round(SAMPLE_RATE * spec.seconds);
  const out = new Float64Array(n);
  for (const tone of spec.tones) {
    const freq = tone.midi !== undefined ? hz(tone.midi) : tone.freqHz;
    const iStart = Math.round(tone.start * SAMPLE_RATE);
    for (let i = iStart; i < n; i++) {
      const dt = (i - iStart) / SAMPLE_RATE;
      const env = Math.exp(-dt / tone.tau) * Math.min(1, dt / tone.attack);
      out[i] += tone.gain * sineOsc(freq * dt) * env;
    }
  }
  fadeOut(out, spec.fadeOutSec ?? 0.01);
  normalize(out, spec.targetPeak);
  return toInt16(out);
}

// ---------------------------------------------------------------------------
// WAV container (RIFF -> fmt -> data), written by hand — no libraries.
// ---------------------------------------------------------------------------

function writeWav(filePath, pcm, sampleRate) {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4); // rest of file after this field
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  buf.writeUInt16LE(1, 20); // audio format: PCM
  buf.writeUInt16LE(1, 22); // channels: mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  writeFileSync(filePath, buf);
}

// ---------------------------------------------------------------------------
// Synthesis specs (MIDI notes: C4=60). Chords per the asset brief.
// ---------------------------------------------------------------------------

const SPECS = {
  'mus-hub': {
    // Warm Amaj7 pad (A2 C#4 E4 G#4), very slow shimmer.
    partials: [
      { note: 45, gain: 1.0, wave: 'sine', lfo: { cycles: 1, depth: 0.2, phase: 0.0 } },
      { note: 61, gain: 0.5, wave: 'sine', lfo: { cycles: 1, depth: 0.28, phase: 2.09 } },
      { note: 64, gain: 0.42, wave: 'sine', lfo: { cycles: 2, depth: 0.16, phase: 4.19 } },
      { note: 68, gain: 0.26, wave: 'triangle', lfo: { cycles: 2, depth: 0.22, phase: 1.05 } },
    ],
  },
  'mus-airport': {
    // Brighter Fmaj9 (F2 A3 C4 E4 G4) + faint pulse, 4 cycles per 8 s.
    partials: [
      { note: 41, gain: 0.9, wave: 'sine', lfo: { cycles: 1, depth: 0.15, phase: 0.0 } },
      { note: 57, gain: 0.6, wave: 'sine', lfo: { cycles: 2, depth: 0.2, phase: 1.3 } },
      { note: 60, gain: 0.5, wave: 'sine', lfo: { cycles: 2, depth: 0.18, phase: 3.6 } },
      { note: 64, gain: 0.42, wave: 'triangle', lfo: { cycles: 4, depth: 0.15, phase: 5.0 } },
      { note: 67, gain: 0.3, wave: 'sine', lfo: { cycles: 4, depth: 0.2, phase: 2.2 } },
    ],
    pulse: { cycles: 4, depth: 0.14 }, // like distant announcements
  },
  'mus-nightgym': {
    // Dark minor drone (D2 A2 F3), slightly colder via triangles.
    partials: [
      { note: 38, gain: 1.0, wave: 'sine', lfo: { cycles: 1, depth: 0.18, phase: 0.0 } },
      { note: 45, gain: 0.5, wave: 'triangle', lfo: { cycles: 1, depth: 0.25, phase: 2.5 } },
      { note: 53, gain: 0.3, wave: 'triangle', lfo: { cycles: 2, depth: 0.2, phase: 4.4 } },
    ],
  },
  'mus-rooftop': {
    // Airy sus2 (G2 A3 D4), open feeling, slow drifting motion.
    partials: [
      { note: 43, gain: 0.85, wave: 'sine', lfo: { cycles: 1, depth: 0.18, phase: 0.4 } },
      { note: 57, gain: 0.55, wave: 'sine', lfo: { cycles: 3, depth: 0.2, phase: 2.0 } },
      { note: 62, gain: 0.45, wave: 'triangle', lfo: { cycles: 3, depth: 0.24, phase: 4.7 } },
    ],
  },
  'mus-kitchen': {
    // Gentle C major (C3 E3 G3 B3), morning warmth.
    partials: [
      { note: 48, gain: 1.0, wave: 'sine', lfo: { cycles: 2, depth: 0.15, phase: 0.0 } },
      { note: 52, gain: 0.7, wave: 'sine', lfo: { cycles: 2, depth: 0.2, phase: 1.8 } },
      { note: 55, gain: 0.55, wave: 'sine', lfo: { cycles: 1, depth: 0.22, phase: 3.5 } },
      { note: 59, gain: 0.35, wave: 'sine', lfo: { cycles: 4, depth: 0.18, phase: 5.2 } },
    ],
  },
  'mus-reveal': {
    // Emotional wide Amaj voicing (A2 E3 A3 C#4 E4), one symmetric swell
    // peaking at 4 s so the endpoints match and the loop stays seamless.
    partials: [
      { note: 45, gain: 1.0, wave: 'sine', lfo: { cycles: 1, depth: 0.12, phase: 0.0 } },
      { note: 52, gain: 0.6, wave: 'sine', lfo: { cycles: 1, depth: 0.15, phase: 2.7 } },
      { note: 57, gain: 0.55, wave: 'sine', lfo: { cycles: 2, depth: 0.14, phase: 4.1 } },
      { note: 61, gain: 0.4, wave: 'triangle', lfo: { cycles: 2, depth: 0.18, phase: 1.2 } },
      { note: 64, gain: 0.35, wave: 'sine', lfo: { cycles: 4, depth: 0.15, phase: 3.3 } },
    ],
    swell: { peakSec: 4, floor: 0.55 },
  },

  'sfx-click': {
    // 40 ms soft blip: 1200 Hz sine, fast decay.
    seconds: 0.04,
    tones: [{ start: 0, freqHz: 1200, gain: 1.0, tau: 0.009, attack: 0.002 }],
    fadeOutSec: 0.005,
    targetPeak: 0.55,
  },
  'evidence-chime': {
    // 600 ms two-note chime: E5 then B5, sine + decay.
    seconds: 0.6,
    tones: [
      { start: 0.0, midi: 76, gain: 1.0, tau: 0.2, attack: 0.003 }, // E5
      { start: 0.15, midi: 83, gain: 0.9, tau: 0.22, attack: 0.003 }, // B5
    ],
    fadeOutSec: 0.01,
    targetPeak: 0.6,
  },
  'heart-beat': {
    // 700 ms double thump: 70 Hz bursts at t=0 and t=0.28 s, exp decay.
    seconds: 0.7,
    tones: [
      { start: 0.0, freqHz: 70, gain: 1.0, tau: 0.09, attack: 0.005 },
      { start: 0.28, freqHz: 70, gain: 0.8, tau: 0.09, attack: 0.005 },
    ],
    fadeOutSec: 0.02,
    targetPeak: 0.85,
  },
};

// ---------------------------------------------------------------------------
// Manifest — ids mirror the game's audio registry exactly. Keep in sync.
// ---------------------------------------------------------------------------

const MANIFEST = [
  { id: 'mus-hub', file: 'public/assets/music/mus-hub.wav', type: 'music' },
  { id: 'mus-airport', file: 'public/assets/music/mus-airport.wav', type: 'music' },
  { id: 'mus-nightgym', file: 'public/assets/music/mus-nightgym.wav', type: 'music' },
  { id: 'mus-rooftop', file: 'public/assets/music/mus-rooftop.wav', type: 'music' },
  { id: 'mus-kitchen', file: 'public/assets/music/mus-kitchen.wav', type: 'music' },
  { id: 'mus-reveal', file: 'public/assets/music/mus-reveal.wav', type: 'music' },
  { id: 'sfx-click', file: 'public/assets/sfx/sfx-click.wav', type: 'sfx' },
  { id: 'evidence-chime', file: 'public/assets/sfx/evidence-chime.wav', type: 'sfx' },
  { id: 'heart-beat', file: 'public/assets/sfx/heart-beat.wav', type: 'sfx' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();

if (!existsSync(path.join(REPO_ROOT, 'package.json'))) {
  console.error('error: run this script from the DSIM repo root (package.json not found in cwd)');
  process.exit(1);
}

mkdirSync(path.join(REPO_ROOT, 'public/assets/music'), { recursive: true });
mkdirSync(path.join(REPO_ROOT, 'public/assets/sfx'), { recursive: true });

for (const entry of MANIFEST) {
  const spec = SPECS[entry.id];
  if (!spec) throw new Error(`no synthesis spec for "${entry.id}"`);

  const pcm = entry.type === 'music' ? renderMusic(spec) : renderOneShot(spec);
  const absPath = path.join(REPO_ROOT, entry.file);
  writeWav(absPath, pcm, SAMPLE_RATE);

  const bytes = statSync(absPath).size;
  const duration = pcm.length / SAMPLE_RATE;
  console.log(`[ok] ${entry.file} — ${bytes} bytes (${duration.toFixed(3)} s @ ${SAMPLE_RATE} Hz mono 16-bit)`);
}

console.log(`\n${MANIFEST.length}/${MANIFEST.length} placeholder audio files written.`);
