// Saved progress. An hour is longer than most people sit down for, so a run
// has to survive closing the tab.
//
// The save point is the *start of a level*, never mid-level: it matches the
// death rule (you restart the level you died on) so resuming and dying land you
// in exactly the same place.

const KEY = 'nightshift.run.v1';

export function save(campaign) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      difficulty: campaign.difficulty.id,
      levelIndex: campaign.levelIndex,
      taken: campaign.taken,
      kills: campaign.kills,
      elapsed: Math.round(campaign.elapsed),
      at: Date.now(),
    }));
  } catch {
    // Private mode, disabled storage, quota — none of it is worth interrupting
    // a run over. The game simply doesn't resume.
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d?.levelIndex !== 'number' || !Array.isArray(d?.taken)) return null;
    return d;
  } catch {
    return null;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* see above */ }
}

/** Best completed run per difficulty, for the victory screen. */
const BEST = 'nightshift.best.v1';

export function recordWin(difficultyId, seconds, kills, accuracy) {
  try {
    const all = JSON.parse(localStorage.getItem(BEST) || '{}');
    const prev = all[difficultyId];
    if (!prev || seconds < prev.seconds) {
      all[difficultyId] = { seconds: Math.round(seconds), kills, accuracy };
      localStorage.setItem(BEST, JSON.stringify(all));
      return true;      // new best
    }
  } catch { /* ignore */ }
  return false;
}

export function bests() {
  try { return JSON.parse(localStorage.getItem(BEST) || '{}'); } catch { return {}; }
}
