// Per-device UI preferences. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and falls back to the default.

const PREFIX = 'schism-pref-';

export interface Prefs {
  /** Hotseat: rotate the board to face the side to move. */
  autoRotate: boolean;
  /** Move / capture / check sounds and haptics. */
  sound: boolean;
}

const DEFAULTS: Prefs = { autoRotate: true, sound: true };

export function loadPrefs(): Prefs {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Prefs)[]) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === 'true' || raw === 'false') out[key] = raw === 'true';
    } catch { /* keep default */ }
  }
  return out;
}

export function savePref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch { /* preference simply won't persist */ }
}
