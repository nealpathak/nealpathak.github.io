// Player-facing settings. Persisted separately from the save file so graphics
// choices survive starting a new game.

import { bus } from './events.js';

const KEY = 'emberwake.settings.v1';

export const QUALITY_PRESETS = {
  low:    { shadows: false, shadowSize: 1024, bloom: false,  fxaa: false, pixelRatio: 0.75, foliage: 0.25, particles: 0.4, drawDistance: 140 },
  medium: { shadows: true,  shadowSize: 1024, bloom: true,   fxaa: true,  pixelRatio: 1.0,  foliage: 0.6,  particles: 0.7, drawDistance: 200 },
  high:   { shadows: true,  shadowSize: 2048, bloom: true,   fxaa: true,  pixelRatio: 1.0,  foliage: 1.0,  particles: 1.0, drawDistance: 300 },
  ultra:  { shadows: true,  shadowSize: 4096, bloom: true,   fxaa: true,  pixelRatio: 1.5,  foliage: 1.4,  particles: 1.3, drawDistance: 400 },
};

const DEFAULTS = {
  quality: 'high',
  autoQuality: true,
  sensitivity: 1.0,
  invertY: false,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  cameraShake: 1.0,
  fov: 62,
  showDamageNumbers: true,
  showTutorialHints: true,
  // Accessibility
  reduceFlashing: false,
  largeText: false,
  colourblindSafeAffinity: false,
  autoLockOn: false,
  holdToSprint: true,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.load();
  }

  get(k) { return this.values[k]; }

  set(k, v) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    this.save();
    bus.emit('settings:changed', { key: k, value: v, settings: this });
  }

  get preset() { return QUALITY_PRESETS[this.values.quality] ?? QUALITY_PRESETS.high; }

  reset() {
    this.values = { ...DEFAULTS };
    this.save();
    bus.emit('settings:changed', { key: '*', value: null, settings: this });
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch { /* private browsing, quota, corrupt JSON — defaults are fine */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }
}

export const settings = new Settings();
