// Seeded pseudo-random helpers. Every dataset and simulation on this site is
// generated from a seed committed to the repo, so the same inputs always
// return the same answer.

export function hashSeed(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(typeof seed === 'string' ? hashSeed(seed) : seed);
  let spare = null;
  const rng = {
    next,
    // uniform in [lo, hi)
    uniform(lo = 0, hi = 1) { return lo + (hi - lo) * next(); },
    // integer in [lo, hi] inclusive
    int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    // weighted pick: items = [[value, weight], ...]
    weighted(items) {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
      return items[items.length - 1][0];
    },
    normal(mu = 0, sigma = 1) {
      if (spare !== null) { const v = spare; spare = null; return mu + sigma * v; }
      let u, v, s;
      do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * m;
      return mu + sigma * u * m;
    },
    lognormal(mu, sigma) { return Math.exp(rng.normal(mu, sigma)); },
    // lognormal parameterised by mean and coefficient of variation
    lognormalMeanCv(mean, cv) {
      const s2 = Math.log(1 + cv * cv);
      return rng.lognormal(Math.log(mean) - s2 / 2, Math.sqrt(s2));
    },
    poisson(lambda) {
      if (lambda > 60) return Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= next(); } while (p > L);
      return k - 1;
    },
    exponential(rate) { return -Math.log(1 - next()) / rate; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
  return rng;
}
