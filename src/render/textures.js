// Procedural textures. There are no image files in this project — every surface
// detail is generated into a canvas at boot. It costs a few milliseconds and
// saves megabytes of downloads.

import * as THREE from 'three';

const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// --- tileable value noise -------------------------------------------------

function makePermutation(seed) {
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  return p;
}

/** Tileable gradient noise over a `period` x `period` lattice. */
function gradNoise(x, y, period, perm) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const wrap = (n) => ((n % period) + period) % period;
  const grad = (ix, iy, dx, dy) => {
    const h = perm[(wrap(ix) + perm[wrap(iy)]) & 511] & 7;
    const gx = [1, -1, 1, -1, 1, -1, 0, 0][h];
    const gy = [1, 1, -1, -1, 0, 0, 1, -1][h];
    return gx * dx + gy * dy;
  };
  const n00 = grad(xi, yi, xf, yf);
  const n10 = grad(xi + 1, yi, xf - 1, yf);
  const n01 = grad(xi, yi + 1, xf, yf - 1);
  const n11 = grad(xi + 1, yi + 1, xf - 1, yf - 1);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/**
 * Tileable fBm height field as a Float32Array of size*size in 0..1.
 * `octaves`, `lacunarity` and `gain` behave the way they do everywhere else.
 */
export function fbmField(size, { octaves = 5, frequency = 4, lacunarity = 2, gain = 0.5, seed = 1, ridged = false, warp = 0 } = {}) {
  const perm = makePermutation(seed);
  const out = new Float32Array(size * size);
  let min = Infinity, max = -Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let fx = x / size, fy = y / size;
      if (warp > 0) {
        const wx = gradNoise(fx * frequency * 0.5, fy * frequency * 0.5, frequency * 0.5 | 0 || 1, perm);
        const wy = gradNoise(fx * frequency * 0.5 + 5.2, fy * frequency * 0.5 + 1.3, frequency * 0.5 | 0 || 1, perm);
        fx += wx * warp; fy += wy * warp;
      }
      let amp = 1, freq = frequency, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        let n = gradNoise(fx * freq, fy * freq, Math.max(1, Math.round(freq)), perm);
        n = ridged ? 1 - Math.abs(n) : n * 0.5 + 0.5;
        sum += n * amp; norm += amp;
        amp *= gain; freq *= lacunarity;
      }
      const v = sum / norm;
      out[y * size + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
  return out;
}

/** Colourise a height field through a gradient of [stop, [r,g,b]] pairs. */
export function fieldToTexture(field, size, gradient, { contrast = 1, repeat = 1, srgb = true } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const stops = gradient.slice().sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < field.length; i++) {
    let v = (field[i] - 0.5) * contrast + 0.5;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (v >= stops[s][0] && v <= stops[s + 1][0]) { lo = stops[s]; hi = stops[s + 1]; break; }
    }
    const t = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
    img.data[i * 4 + 0] = lo[1][0] + (hi[1][0] - lo[1][0]) * t;
    img.data[i * 4 + 1] = lo[1][1] + (hi[1][1] - lo[1][1]) * t;
    img.data[i * 4 + 2] = lo[1][2] + (hi[1][2] - lo[1][2]) * t;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Central-difference a height field into a tangent-space normal map.
 * `strength` is the slope multiplier; the Z component stays at 1 so a strength
 * of 0 yields a flat surface and small values stay gentle.
 */
export function fieldToNormalTexture(field, size, strength = 2.0, repeat = 1) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => field[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

/** Single-channel field as a linear texture, for roughness/AO maps. */
export function fieldToGrayTexture(field, size, { lo = 0, hi = 1, repeat = 1 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const v = (lo + (hi - lo) * field[i]) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

// --- named surface sets ---------------------------------------------------

/** A material-ready trio: {map, normalMap, roughnessMap}. Cached by name. */
export function surface(name) {
  if (cache.has(name)) return cache.get(name);
  const S = 256;
  let result;

  switch (name) {
    case 'dirt': {
      const f = fbmField(S, { octaves: 6, frequency: 6, seed: 11, warp: 0.06 });
      const detail = fbmField(S, { octaves: 4, frequency: 22, seed: 12 });
      const mixed = new Float32Array(S * S);
      for (let i = 0; i < mixed.length; i++) mixed[i] = f[i] * 0.72 + detail[i] * 0.28;
      result = {
        map: fieldToTexture(mixed, S, [
          [0.0, [64, 52, 40]], [0.4, [88, 72, 55]], [0.7, [110, 92, 69]], [1.0, [136, 116, 88]],
        ], { contrast: 0.82, repeat: 18 }),
        normalMap: fieldToNormalTexture(mixed, S, 3.0, 18),
        roughnessMap: fieldToGrayTexture(mixed, S, { lo: 0.78, hi: 1.0, repeat: 18 }),
      };
      break;
    }
    case 'rock': {
      const f = fbmField(S, { octaves: 6, frequency: 5, seed: 27, ridged: true, warp: 0.1 });
      result = {
        map: fieldToTexture(f, S, [
          [0.0, [54, 53, 58]], [0.45, [80, 79, 86]], [0.8, [108, 106, 110]], [1.0, [140, 138, 140]],
        ], { contrast: 1.05, repeat: 8 }),
        normalMap: fieldToNormalTexture(f, S, 5.0, 8),
        roughnessMap: fieldToGrayTexture(f, S, { lo: 0.6, hi: 0.95, repeat: 8 }),
      };
      break;
    }
    case 'stone': {   // dressed masonry for ruins
      const f = fbmField(S, { octaves: 5, frequency: 9, seed: 53 });
      result = {
        map: fieldToTexture(f, S, [
          [0.0, [74, 71, 65]], [0.5, [104, 99, 90]], [1.0, [142, 136, 124]],
        ], { contrast: 0.92, repeat: 4 }),
        normalMap: fieldToNormalTexture(f, S, 4.0, 4),
        roughnessMap: fieldToGrayTexture(f, S, { lo: 0.65, hi: 0.92, repeat: 4 }),
      };
      break;
    }
    case 'ash': {
      const f = fbmField(S, { octaves: 5, frequency: 10, seed: 91, warp: 0.12 });
      result = {
        map: fieldToTexture(f, S, [
          [0.0, [30, 27, 28]], [0.5, [62, 56, 55]], [1.0, [104, 96, 92]],
        ], { contrast: 1.0, repeat: 20 }),
        normalMap: fieldToNormalTexture(f, S, 2.5, 20),
        roughnessMap: fieldToGrayTexture(f, S, { lo: 0.88, hi: 1.0, repeat: 20 }),
      };
      break;
    }
    case 'moss': {
      const f = fbmField(S, { octaves: 6, frequency: 14, seed: 71 });
      result = {
        map: fieldToTexture(f, S, [
          [0.0, [28, 40, 26]], [0.5, [48, 68, 38]], [1.0, [78, 100, 52]],
        ], { contrast: 1.2, repeat: 18 }),
        normalMap: fieldToNormalTexture(f, S, 4.0, 18),
        roughnessMap: fieldToGrayTexture(f, S, { lo: 0.8, hi: 1.0, repeat: 18 }),
      };
      break;
    }
    case 'metal': {
      const f = fbmField(S, { octaves: 5, frequency: 16, seed: 33 });
      result = {
        map: fieldToTexture(f, S, [
          [0.0, [44, 42, 46]], [0.55, [86, 84, 90]], [1.0, [140, 138, 142]],
        ], { contrast: 1.0, repeat: 3 }),
        normalMap: fieldToNormalTexture(f, S, 3.0, 3),
        roughnessMap: fieldToGrayTexture(f, S, { lo: 0.25, hi: 0.6, repeat: 3 }),
      };
      break;
    }
    case 'cloth': {
      const f = fbmField(S, { octaves: 4, frequency: 30, seed: 17 });
      result = {
        map: null,
        normalMap: fieldToNormalTexture(f, S, 2.0, 4),
        roughnessMap: fieldToGrayTexture(f, S, { lo: 0.8, hi: 1.0, repeat: 4 }),
      };
      break;
    }
    default:
      throw new Error(`unknown surface "${name}"`);
  }

  cache.set(name, result);
  return result;
}

/** Soft radial sprite used for embers, dust, glows and shadow blobs. */
export function radialSprite(inner = '#ffffff', outer = 'rgba(255,255,255,0)', size = 128, power = 1) {
  const key = `radial:${inner}:${outer}:${size}:${power}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, i === 0 ? inner : i === 8 ? outer : mixCss(inner, outer, Math.pow(t, power)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

function parseCss(str) {
  if (str.startsWith('#')) {
    const h = str.slice(1);
    const n = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    return n;
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return [255, 255, 255, 1];
  const p = m[1].split(',').map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

function mixCss(a, b, t) {
  const A = parseCss(a), B = parseCss(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  const al = A[3] + (B[3] - A[3]) * t;
  return `rgba(${r},${g},${bl},${al})`;
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v?.isTexture) v.dispose();
    else if (v) for (const t of Object.values(v)) t?.dispose?.();
  }
  cache.clear();
}
