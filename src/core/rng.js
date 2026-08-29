// Deterministic seeded randomness. Every player gets the same course on a
// given day, so runs are comparable and ghosts stay meaningful.

// mulberry32: small, fast, good enough distribution for level generation.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Integer hash used for per-feature decisions (which segment holds a pillar,
// how tall it is) without allocating a generator per query.
export function hash2(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// UTC so the daily course flips at the same instant worldwide.
export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Day 1 is the project's first public day; used only for the display label.
const EPOCH = Date.UTC(2026, 7, 29);

export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.max(1, Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1);
}

export function seedForKey(key) {
  return hashString('slipstream:' + key);
}
