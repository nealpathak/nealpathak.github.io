// Difficulty and the upgrade draft.
//
// Every number the player can change lives in one stats object that the weapon
// and the player both read. Upgrades are pure functions on that object, which
// is what makes them safe to stack in any order.

export const DIFFICULTIES = [
  {
    id: 'rookie', name: 'Rookie',
    blurb: 'They hit softer and move slower, and you carry more ammunition.',
    hp: 0.72, speed: 0.90, damage: 0.65, ammo: 1.35,
  },
  {
    id: 'standard', name: 'Night Shift',
    blurb: 'The way it was built. Expect to lose a level and come back to it.',
    hp: 1, speed: 1, damage: 1, ammo: 1,
  },
  {
    id: 'nightmare', name: 'Nightmare',
    blurb: 'Faster, tougher, and your reserve runs dry. Headshots stop being optional.',
    hp: 1.45, speed: 1.14, damage: 1.40, ammo: 0.78,
  },
];

export const difficultyById = (id) =>
  DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];

export function baseStats() {
  return {
    damage: 34,
    headshotMult: 2.6,
    magSize: 15,
    reloadTime: 1.5,
    fireInterval: 0.14,
    spreadScale: 1,
    ammoPerLevel: 120,   // the reserve you start each level holding
    moveScale: 1,
    maxHealth: 100,
    regenDelay: 4.5,
    regenRate: 22,
  };
}

/**
 * The draft pool. Kept deliberately small and mostly non-overlapping — ten
 * options where every one changes how you play, rather than thirty where most
 * are a percent on a number you never notice.
 */
export const UPGRADES = [
  { id: 'hollow',  name: 'Hollow Points',  desc: '+30% damage',
    apply: (s) => { s.damage *= 1.30; } },
  { id: 'mag',     name: 'Extended Mag',   desc: '+8 rounds per magazine',
    apply: (s) => { s.magSize += 8; } },
  { id: 'speedload', name: 'Speed Load',   desc: 'Reload 40% faster',
    apply: (s) => { s.reloadTime *= 0.60; } },
  { id: 'trigger', name: 'Light Trigger',  desc: 'Fire 25% faster',
    apply: (s) => { s.fireInterval *= 0.75; } },
  { id: 'marksman', name: 'Marksman',      desc: 'Headshots do far more damage',
    apply: (s) => { s.headshotMult += 1.4; } },
  { id: 'steady',  name: 'Steady Hands',   desc: 'Much tighter spread on the move',
    apply: (s) => { s.spreadScale *= 0.35; } },
  { id: 'boots',   name: 'Combat Boots',   desc: '+15% movement speed',
    apply: (s) => { s.moveScale *= 1.15; } },
  { id: 'dressing', name: 'Field Dressing', desc: '+35 maximum health',
    apply: (s) => { s.maxHealth += 35; } },
  { id: 'adrenaline', name: 'Adrenaline',  desc: 'Health starts returning much sooner',
    apply: (s) => { s.regenDelay *= 0.5; s.regenRate *= 1.45; } },
  { id: 'quarter', name: 'Quartermaster',  desc: '+80 reserve ammunition per level',
    apply: (s) => { s.ammoPerLevel += 80; } },
];

const byId = (id) => UPGRADES.find((u) => u.id === id);

/**
 * Offer `count` upgrades the player hasn't taken yet.
 * `rand` is injectable so the tests can be deterministic.
 */
export function draft(taken, count = 3, rand = Math.random) {
  const pool = UPGRADES.filter((u) => !taken.includes(u.id));
  // Late in a run the pool can run dry; allow repeats rather than offering
  // fewer than three cards, since a stacked Hollow Points is a real choice.
  const source = pool.length >= count ? pool : UPGRADES;
  const picked = [];
  const used = new Set();
  while (picked.length < Math.min(count, source.length)) {
    const u = source[(rand() * source.length) | 0];
    if (used.has(u.id)) continue;
    used.add(u.id);
    picked.push(u);
  }
  return picked;
}

/** Rebuild a stats object from base + a list of upgrade ids, in order. */
export function statsFrom(takenIds) {
  const s = baseStats();
  for (const id of takenIds) {
    const u = byId(id);
    if (u) u.apply(s);
  }
  return s;
}
