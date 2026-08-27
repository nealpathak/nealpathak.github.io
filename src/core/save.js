// Save/load. One slot, written on rest and on major events, kept small enough
// that localStorage never complains.

import { bus } from './events.js';

const KEY = 'emberwake.save.v1';
const VERSION = 1;

export function hasSave() {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION) {
      console.warn('[save] version mismatch, ignoring old save', data.version);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[save] could not read save', err);
    return null;
  }
}

export function saveGame(data) {
  const payload = { ...data, version: VERSION, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    bus.emit('save:written', payload);
    return true;
  } catch (err) {
    console.warn('[save] could not write save', err);
    bus.emit('save:failed', err);
    return false;
  }
}

export function deleteSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  bus.emit('save:deleted');
}
