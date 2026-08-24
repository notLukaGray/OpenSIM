"use client";
// SettingsPanel (P3-01): volumes, mute, text speed — persisted live.
import { useGame } from "@/hooks/useGame";
import styles from "./SettingsPanel.module.css";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useGame();

  return (
    <div className={styles.veil} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>SETTINGS</h2>

        <label className={styles.row}>
          <span>master volume</span>
          <input
            className={styles.range}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.master}
            onChange={(e) => updateSettings({ master: Number(e.target.value) })}
          />
        </label>
        <label className={styles.row}>
          <span>music</span>
          <input
            className={styles.range}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.music}
            onChange={(e) => updateSettings({ music: Number(e.target.value) })}
          />
        </label>
        <label className={styles.row}>
          <span>sfx</span>
          <input
            className={styles.range}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.sfx}
            onChange={(e) => updateSettings({ sfx: Number(e.target.value) })}
          />
        </label>
        <label className={styles.row}>
          <span>voices</span>
          <input
            className={styles.range}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voice}
            onChange={(e) => updateSettings({ voice: Number(e.target.value) })}
          />
        </label>
        <label className={styles.row}>
          <span>text speed</span>
          <input
            className={styles.range}
            type="range"
            min={10}
            max={120}
            step={5}
            value={settings.textSpeed}
            onChange={(e) => updateSettings({ textSpeed: Number(e.target.value) })}
          />
        </label>

        <button
          className={`${styles.toggle} ${settings.muted ? styles.on : ""}`}
          onClick={() => updateSettings({ muted: !settings.muted })}
        >
          {settings.muted ? "muted" : "sound on"}
        </button>

        <button className={styles.done} onClick={onClose}>
          done
        </button>
      </div>
    </div>
  );
}
