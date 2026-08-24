// WebAudio singleton (ADR-06): buses, crossfading music, one-shot SFX,
// autoplay unlock, persisted volumes. Content references tracks by ID only.
import { audioTracks } from "@/content/registry";
import type { Settings } from "@/game/types";

const MUSIC_FADE_S = 1.2;

type Voice = { src: AudioBufferSourceNode; gain: GainNode };

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
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

  /**
   * Voice-over (P5-03 / ADR-13): play one dialogue line's clip from the
   * convention path `/assets/vo/<key>.mp3` while ducking music. Missing files
   * are a silent no-op — placeholder mode is file absence.
   */
  async speak(key: string): Promise<void> {
    const ctx = this.unlocked ? this.ctx : null;
    if (!ctx || !this.voiceBus || !this.musicBus) return;
    let buf: AudioBuffer;
    try {
      const res = await fetch(`/assets/vo/${key}.mp3`);
      if (!res.ok) return; // no VO recorded for this line yet
      buf = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return; // absent/undecodable clip — never disturb gameplay
    }
    const now = ctx.currentTime;

    // duck music under speech, restore when the clip ends
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.35, now, 0.12);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.voiceBus);
    source.onended = () => {
      if (!ctx || !this.musicBus) return;
      this.musicBus.gain.setTargetAtTime(this.settings.music, ctx.currentTime, 0.4);
    };
    source.start();
  }
}

export const AudioManager = new AudioManagerImpl();
