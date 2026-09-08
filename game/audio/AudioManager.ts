// WebAudio singleton (ADR-06): buses, crossfading music, one-shot SFX,
// autoplay unlock, persisted volumes. Content references tracks by ID only.
import { audioTracks } from "@/content/registry";
import type { Settings } from "@/game/types";

const MUSIC_FADE_S = 1.2;
/** How far music drops under speech. VO is the point of this game, so the bed
 *  goes well down rather than politely aside: at 0.22 the music sits ~15 dB
 *  under a normalised line instead of ~10 dB. */
const MUSIC_DUCK_UNDER_VO = 0.22;

// ── voice loudness ──────────────────────────────────────────────────────────
// Per-clip normalisation makes lines EQUAL; on its own it cannot make them
// LOUD, because each clip's gain is capped by its own peaks (median crest
// factor here is 15.8 dB). A bus limiter was tried and rejected: a
// DynamicsCompressor is not a brickwall, consonant transients slip through
// during its attack window, and the make-up then clips them. So the crest
// factor is reduced per clip instead — soft-limit the peaks, which buys real
// headroom and is bounded by construction: output can never exceed the
// ceiling, with or without anything downstream.
/** Soft-limiting starts here (linear). Below this samples pass untouched, so
 *  ordinary speech is unaffected and only peaks are shaped. */
const VO_SOFT_KNEE = 0.6;

// ── VO loudness normalisation ────────────────────────────────────────────────
// The recorded VO is not level-matched: measured across all 612 clips the
// gated loudness spans 18.4 dB (quietest brand median -24.0, loudest -15.7),
// and single brands vary by >10 dB internally, so some lines are inaudible
// under the music bed while others jump. Rather than re-encode 65 MB of mp3,
// each clip is measured once on decode and played through a make-up gain.
/** Target gated loudness in dB. Reachable now that peaks are soft-limited
 *  rather than merely gain-capped: -14 puts VO ~7 dB above where it used to
 *  sit while the ceiling below still guarantees no clipping. This is the knob
 *  for how loud VO is; VO_SOFT_KNEE trades peak shaping against it. */
const VO_TARGET_DB = -14;
/** Make-up gain limits. Beyond 4x a genuinely quiet clip only gains hiss. */
const VO_GAIN_MIN = 0.25;
const VO_GAIN_MAX = 4;
/** Post-gain peak ceiling — a boost must never push a clip into clipping. */
const VO_PEAK_CEILING = 0.98;
/** Loudness window: BS.1770 uses 400 ms blocks; the quarter-block hop keeps
 *  short lines from being measured on a single unlucky window. */
const VO_BLOCK_S = 0.4;

/**
 * Gated loudness + true peak of a decoded clip, in one pass per channel.
 * Gating (drop blocks more than 10 dB below the clip's own mean) is what makes
 * this track perceived level: without it, leading silence and the pauses
 * between sentences drag a clip's average down and it gets over-boosted.
 */
function measureLoudness(buf: AudioBuffer): { db: number; peak: number } {
  const n = buf.length;
  if (!n) return { db: VO_TARGET_DB, peak: 0 };
  // Mono-sum once; loudness is a property of the clip, not of one channel.
  const mono = new Float32Array(n);
  const chans = buf.numberOfChannels;
  for (let c = 0; c < chans; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += data[i] / chans;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
  }
  const block = Math.max(1, Math.floor(buf.sampleRate * VO_BLOCK_S));
  const hop = Math.max(1, Math.floor(block / 4));
  const blocks: number[] = [];
  for (let i = 0; i + block <= n; i += hop) {
    let sum = 0;
    for (let j = i; j < i + block; j++) sum += mono[j] * mono[j];
    blocks.push(sum / block);
  }
  if (!blocks.length) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += mono[i] * mono[i];
    blocks.push(sum / n);
  }
  const audible = blocks.filter((b) => b > 1e-7);
  if (!audible.length) return { db: VO_TARGET_DB, peak };
  const mean = audible.reduce((a, b) => a + b, 0) / audible.length;
  const gate = mean * 0.1; // -10 dB relative to the clip's own mean
  const kept = audible.filter((b) => b > gate);
  const use = kept.length ? kept : audible;
  const ms = use.reduce((a, b) => a + b, 0) / use.length;
  return { db: 10 * Math.log10(ms + 1e-12), peak };
}

/**
 * Bring one clip to VO_TARGET_DB, in place. Samples are gained, then anything
 * past VO_SOFT_KNEE is bent asymptotically toward the ceiling, so a loud target
 * costs peak shape rather than headroom and the result cannot exceed
 * VO_PEAK_CEILING. Returns the gain applied, for logging/tests.
 */
function levelClip(buf: AudioBuffer): number {
  const { db } = measureLoudness(buf);
  const gain = Math.min(VO_GAIN_MAX, Math.max(VO_GAIN_MIN, Math.pow(10, (VO_TARGET_DB - db) / 20)));
  const knee = VO_SOFT_KNEE;
  const span = VO_PEAK_CEILING - knee;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = data[i] * gain;
      const a = Math.abs(v);
      if (a <= knee) {
        data[i] = v;
      } else {
        // tanh knee: continuous at the join, asymptotic to the ceiling.
        data[i] = Math.sign(v) * (knee + span * Math.tanh((a - knee) / span));
      }
    }
  }
  return gain;
}

type Voice = { src: AudioBufferSourceNode; gain: GainNode };

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
  /** A monotonically increasing token invalidates superseded VO fetches. */
  private voiceRequest = 0;
  /** Gain applied per VO key, kept for debugging (buffers are decoded fresh). */
  private voiceGains = new Map<string, number>();
  private currentVoice: AudioBufferSourceNode | null = null;
  private musicVoices: Voice[] = [];
  private currentMusicId: string | null = null;
  private settings: Settings = { master: 0.8, music: 0.7, sfx: 0.8, muted: false, textSpeed: 45, voice: 0.9 };
  private pendingMusicId: string | null = null;
  private unlocked = false;

  /** Call from a real user gesture once; safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      // Dev-only debug handle for browser-console probing; dead-code-eliminated in prod.
      (window as unknown as Record<string, unknown>).__audioManager = this;
    }
    if (this.unlocked && this.ctx) return;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.voiceBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.voiceBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        document.addEventListener("visibilitychange", () => this.applyDucking());
      }
      await this.ctx.resume();
      this.unlocked = true;
      this.applyVolumes();
      if (this.pendingMusicId) {
        const id = this.pendingMusicId;
        this.pendingMusicId = null;
        void this.playMusic(id);
      }
    } catch {
      /* audio unavailable — game stays fully playable */
    }
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  setSettings(s: Settings): void {
    this.settings = s;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus || !this.voiceBus) return;
    const t = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(this.settings.voice, t, 0.05);
  }

  private applyDucking(): void {
    if (!this.ctx || !this.master) return;
    const hidden = document.visibilityState === "hidden";
    const m = this.settings.muted ? 0 : this.settings.master;
    this.master.gain.setTargetAtTime(hidden ? m * 0.25 : m, this.ctx.currentTime, 0.1);
  }

  private async bufferFor(id: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const track = audioTracks.find((t) => t.id === id);
    if (!track) throw new Error(`AudioManager: unknown track "${id}"`);
    let p = this.loading.get(id);
    if (!p) {
      p = fetch(track.src)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${track.src}`);
          return r.arrayBuffer();
        })
        .then((ab) => {
          if (!this.ctx) throw new Error("no AudioContext");
          return this.ctx.decodeAudioData(ab);
        })
        .then((buf) => {
          this.buffers.set(id, buf);
          this.loading.delete(id);
          return buf;
        })
        .catch((e) => {
          console.error(`[audio] failed to load "${id}"`, e);
          this.loading.delete(id);
          throw e;
        });
      this.loading.set(id, p);
    }
    return p;
  }

  /**
   * True while `id` (or any track when omitted) has live music voices —
   * callers use this to avoid restarting a track that is already playing.
   */
  isMusicPlaying(id?: string): boolean {
    if (id === undefined) return this.musicVoices.length > 0;
    return this.currentMusicId === id && this.musicVoices.length > 0;
  }

  /**
   * Crossfade to `id`. If the same track already has live voices, this is a
   * no-op — transitions between screens sharing a track never restart it.
   * If audio isn't unlocked yet, remember the request and start on the first
   * gesture instead of violating autoplay policy.
   */
  async playMusic(id: string): Promise<void> {
    if (!this.unlocked || !this.ctx) {
      // Queue latest intent; duplicate requests for the queued track are no-ops.
      if (this.pendingMusicId !== id || this.currentMusicId !== id) {
        this.pendingMusicId = id;
        this.currentMusicId = id;
      }
      return;
    }
    if (this.isMusicPlaying(id)) return;
    this.currentMusicId = id;
    let buf: AudioBuffer;
    try {
      buf = (await this.bufferFor(id))!;
    } catch {
      return;
    }
    if (this.currentMusicId !== id) return; // superseded while loading

    const now = this.ctx.currentTime;
    const track = audioTracks.find((t) => t.id === id)!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, track.volume), now + MUSIC_FADE_S);
    src.connect(gain).connect(this.musicBus!);
    src.start(now);

    // fade out + dispose previous voices
    const old = this.musicVoices;
    this.musicVoices = [{ src, gain }];
    for (const v of old) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + MUSIC_FADE_S);
      try {
        v.src.stop(now + MUSIC_FADE_S + 0.05);
      } catch {
        /* already stopped */
      }
    }
  }

  async playSfx(id: string): Promise<void> {
    if (!this.unlocked || !this.ctx) return;
    let buf: AudioBuffer;
    try {
      buf = (await this.bufferFor(id))!;
    } catch {
      return;
    }
    const track = audioTracks.find((t) => t.id === id)!;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = track.volume;
    src.connect(gain).connect(this.sfxBus!);
    src.start();
  }

  /** Stop the current line and invalidate any VO clip still loading. */
  stopVoice(): void {
    this.voiceRequest++;
    if (this.currentVoice) {
      this.currentVoice.onended = null;
      try {
        this.currentVoice.stop();
      } catch {
        /* already stopped */
      }
      this.currentVoice = null;
    }
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.settings.music, this.ctx.currentTime, 0.12);
    }
  }

  /**
   * Voice-over (P5-03 / ADR-13): play one dialogue line's clip from the
   * convention path `/assets/vo/<key>.mp3` while ducking music. Missing files
   * are a silent no-op — placeholder mode is file absence.
   */
  async speak(key: string): Promise<void> {
    const ctx = this.unlocked ? this.ctx : null;
    if (!ctx || !this.voiceBus || !this.musicBus) return;
    // Dialogue is a single-voice channel. This also invalidates an older clip
    // still decoding, so rushing forward cannot make it start late.
    this.stopVoice();
    const request = this.voiceRequest;
    let buf: AudioBuffer;
    try {
      const res = await fetch(`/assets/vo/${key}.mp3`);
      if (!res.ok) {
        return; // no VO recorded for this line yet
      }
      buf = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return; // absent/undecodable clip — never disturb gameplay
    }
    if (request !== this.voiceRequest) return; // superseded while loading
    const now = ctx.currentTime;

    // duck music under speech, restore when the clip ends
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(this.settings.music * MUSIC_DUCK_UNDER_VO, now, 0.12);

    // Loudness match in place, before the buffer is handed to the graph. The
    // player's voice setting still scales the whole channel on top of this.
    this.voiceGains.set(key, levelClip(buf));
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.voiceBus);
    this.currentVoice = source;
    source.onended = () => {
      if (request !== this.voiceRequest) return;
      this.currentVoice = null;
      if (!ctx || !this.musicBus) return;
      this.musicBus.gain.setTargetAtTime(this.settings.music, ctx.currentTime, 0.4);
    };
    source.start();
  }
}

export const AudioManager = new AudioManagerImpl();
