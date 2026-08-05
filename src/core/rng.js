// Seeded pseudo-random numbers.
//
// The world must look identical every time anyone loads it. Math.random() would
// reshuffle the continents on every visit, so every random decision in this
// project — terrain, tree placement, creature spawns — comes from here instead.

/**
 * mulberry32: small, fast, good enough distribution for a toy world.
 * Returns a function producing floats in [0, 1).
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive an independent stream from a base seed. Each system (flora, wanderers,
 * ...) takes its own stream so adding one system doesn't shift the output of
 * another — otherwise planting a new tree would teleport every creature.
 */
export function streamFor(seed, name) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return makeRng((seed ^ h) >>> 0);
}

/** Random float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max]. */
export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/** Pick one element of an array. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * A uniformly distributed point on the unit sphere.
 * (Naive lat/lon sampling clumps at the poles; this doesn't.)
 */
export function pointOnSphere(rng, out) {
  const z = rng() * 2 - 1;
  const angle = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  out.set(Math.cos(angle) * r, Math.sin(angle) * r, z);
  return out;
}
