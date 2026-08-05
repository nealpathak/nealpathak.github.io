// 3D Perlin noise and the planet's terrain function.
//
// The single most important rule in this file: terrain height is a PURE
// FUNCTION of a direction on the unit sphere. The mesh is built from it, trees
// are planted with it, and creatures stand on it. If height ever got baked into
// the mesh alone, everything else would float or sink.

import { makeRng } from './rng.js';

/**
 * Classic Perlin noise in 3 dimensions, seeded.
 * Gradient noise rather than value noise: no visible grid artifacts, which
 * matters a lot when the result is displayed as faceted terrain.
 */
export function makeNoise3(seed) {
  const rng = makeRng(seed);

  // Seeded Fisher-Yates shuffle of 0..255, duplicated to avoid index wrapping.
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);

  // The 12 edge-midpoint gradients of a cube, selected by hash.
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    return lerp(
      lerp(
        lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  };
}

/** Fractal Brownian motion: sum octaves of noise at doubling frequency. */
function fbm(noise, x, y, z, octaves, lacunarity, gain) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Build the terrain for a planet.
 *
 * `opts` comes from world/state.json so the shape of the world is data, not
 * code — a future update can raise the mountains without touching this file.
 *
 * Elevation is measured in world units relative to sea level:
 *   > 0  land
 *   = 0  shoreline
 *   < 0  seabed
 */
export function makeTerrain(opts) {
  const {
    seed,
    continentScale = 1.15,
    detailScale = 3.4,
    landHeight = 1.9,
    seabedDepth = 0.7,
    seaLevel = 0.08,
  } = opts;

  // Two independent noise fields: one shapes the continents, one adds
  // ridges and roughness on top of them.
  const shape = makeNoise3(seed);
  const detail = makeNoise3(seed ^ 0x9e3779b9);

  /**
   * Raw signed elevation for a unit-length direction, before the land/sea
   * split. Roughly -1..1.
   */
  function field(x, y, z) {
    const continents = fbm(shape, x * continentScale, y * continentScale, z * continentScale, 4, 2.0, 0.5);
    const rough = fbm(detail, x * detailScale, y * detailScale, z * detailScale, 5, 2.1, 0.5);
    return continents + rough * 0.28;
  }

  /**
   * Elevation above (+) or below (-) sea level, in world units.
   * `v` must be a unit-length THREE.Vector3-like object.
   */
  function heightAt(v) {
    const e = field(v.x, v.y, v.z) - seaLevel;
    if (e > 0) {
      // Exponent > 1 keeps coastlines broad and flat while letting the
      // high interior push up into distinct peaks.
      return Math.pow(e, 1.35) * landHeight;
    }
    // Seabed: shallow near shore, flattening out into basins.
    return -Math.pow(-e, 0.75) * seabedDepth;
  }

  function isLand(v) {
    return heightAt(v) > 0;
  }

  // Scratch vectors reused across slope queries; this runs in placement loops.
  const _a = { x: 0, y: 0, z: 0 };
  const _b = { x: 0, y: 0, z: 0 };

  /**
   * Approximate terrain steepness at a point, as a 0..1-ish ratio of vertical
   * change to horizontal distance. Used to keep trees off cliff faces.
   * `tanU`/`tanV` are two unit tangents perpendicular to `v`.
   */
  function slopeAt(v, tanU, tanV, eps = 0.04) {
    const h = heightAt(v);
    let du = 0;
    let dv = 0;

    for (const [tan, isU] of [[tanU, true], [tanV, false]]) {
      const t = isU ? _a : _b;
      t.x = v.x + tan.x * eps;
      t.y = v.y + tan.y * eps;
      t.z = v.z + tan.z * eps;
      const len = Math.hypot(t.x, t.y, t.z);
      t.x /= len;
      t.y /= len;
      t.z /= len;
      const d = Math.abs(heightAt(t) - h) / eps;
      if (isU) du = d;
      else dv = d;
    }
    return Math.max(du, dv);
  }

  return { heightAt, isLand, slopeAt, seaLevel };
}
