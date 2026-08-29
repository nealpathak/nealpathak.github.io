// Per-day personal bests and ghost replays, kept in localStorage.
// Everything degrades to in-memory if storage is unavailable (private mode,
// blocked cookies), so the game never breaks on a failed write.

const KEY = 'slipstream.v1';
const KEEP_DAYS = 14; // prune older ghosts; ghosts dominate the footprint

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // quota or disabled storage: scores just won't persist
  }
}

export function getRecord(courseKey) {
  const all = readAll();
  const r = all[courseKey];
  if (!r || typeof r.best !== 'number') return null;
  return r;
}

// Only writes when the run actually beat the stored time.
export function saveRecord(courseKey, timeSec, ghostB64) {
  const all = readAll();
  const prev = all[courseKey];
  if (prev && typeof prev.best === 'number' && prev.best <= timeSec) return false;
  all[courseKey] = { best: timeSec, ghost: ghostB64 || null, at: Date.now() };
  prune(all);
  writeAll(all);
  return true;
}

// Keeps every best time but drops ghost blobs for all but the newest days.
function prune(all) {
  const keys = Object.keys(all).filter((k) => k !== '__flags').sort();
  const stale = keys.slice(0, Math.max(0, keys.length - KEEP_DAYS));
  for (const k of stale) if (all[k]) all[k].ghost = null;
}

// Small persistent flags (tutorial progress and the like), kept beside the
// records so one key holds everything the game remembers.
export function getFlag(name, fallback = 0) {
  const all = readAll();
  const f = all.__flags;
  return f && f[name] !== undefined ? f[name] : fallback;
}

export function setFlag(name, value) {
  const all = readAll();
  if (!all.__flags) all.__flags = {};
  all.__flags[name] = value;
  writeAll(all);
}

export function allRecords() {
  const all = readAll();
  return Object.entries(all)
    .filter(([k, r]) => k !== '__flags' && r && typeof r.best === 'number')
    .map(([key, r]) => ({ key, best: r.best, at: r.at || 0 }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

// Float32Array <-> base64. Chunked so long ghosts don't blow the argument
// limit of String.fromCharCode.
export function encodeFloats(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

export function decodeFloats(b64) {
  try {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    // Copy into an aligned buffer: the Float32Array view needs 4-byte alignment.
    return new Float32Array(bytes.buffer.slice(0));
  } catch {
    return null;
  }
}
