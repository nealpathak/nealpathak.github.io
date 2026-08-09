// Player settings, persisted.
//
// Mouse sensitivity especially: there is no correct default, because it depends
// on the player's mouse DPI and how much desk they have. Shipping one hardcoded
// number and hoping is the single easiest way to make a shooter feel wrong to
// most of the people who try it.

const KEY = 'nightshift.settings.v1';

/** Radians of view rotation per pixel of mouse travel at sensitivity 1. */
export const BASE_SENSITIVITY = 0.0022;

export const SCHEMA = [
  { id: 'sensitivity', label: 'Mouse sensitivity', min: 0.25, max: 3, step: 0.05,
    format: (v) => v.toFixed(2) + '×' },
  { id: 'fov', label: 'Field of view', min: 70, max: 110, step: 1,
    format: (v) => Math.round(v) + '°' },
  { id: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05,
    format: (v) => Math.round(v * 100) + '%' },
];

export const TOGGLES = [
  { id: 'invertY', label: 'Invert vertical aim' },
  { id: 'shadows', label: 'Shadows', note: 'Turn off if the frame rate suffers' },
];

const DEFAULTS = {
  sensitivity: 1,
  fov: 78,
  volume: 0.5,
  invertY: false,
  shadows: true,
};

export function defaults() { return { ...DEFAULTS }; }

export function load() {
  const s = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const d = JSON.parse(raw);
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof d?.[k] === typeof DEFAULTS[k]) s[k] = d[k];
    }
    // Never trust a stored number to be in range — a corrupt value here would
    // make the game unplayable with no obvious way back.
    for (const f of SCHEMA) s[f.id] = Math.min(f.max, Math.max(f.min, s[f.id]));
  } catch { /* storage unavailable; defaults are fine */ }
  return s;
}

export function save(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
