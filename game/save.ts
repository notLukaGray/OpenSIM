// localStorage persistence (ADR-09): versioned save envelope + settings.
// Version mismatch discards; every access is private-mode safe.
import {
  SAVE_KEY,
  SAVE_VERSION,
  SETTINGS_KEY,
  SaveEnvelope,
  Settings,
  defaultSettings,
} from "./types";

export function loadSave(): SaveEnvelope | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveEnvelope;
    if (parsed?.version !== SAVE_VERSION || !parsed.state || !parsed.navigation) return null;
    if (parsed.navigation.phase !== "play" || !parsed.navigation.treeId || !parsed.navigation.nodeId)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistSave(envelope: Omit<SaveEnvelope, "version" | "savedAt">): void {
  try {
    const payload: SaveEnvelope = {
      ...envelope,
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — play on without saves */
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const d = defaultSettings();
    return {
      master: clamp01(parsed.master ?? d.master),
      music: clamp01(parsed.music ?? d.music),
      sfx: clamp01(parsed.sfx ?? d.sfx),
      muted: Boolean(parsed.muted),
      textSpeed: Math.max(10, Math.min(120, parsed.textSpeed ?? d.textSpeed)),
    };
  } catch {
    return defaultSettings();
  }
}

export function persistSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* noop */
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
