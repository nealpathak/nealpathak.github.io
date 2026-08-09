// Procedural surface textures, drawn to canvases at load time.
//
// Flat-coloured boxes are what make a blockout look like a blockout. A little
// grain and a bump map costs nothing to download and does most of the work of
// making concrete read as concrete.

import * as THREE from 'three';

const cache = new Map();

/** Value noise, smoothed by drawing at low res and scaling up. */
function noiseCanvas(size, cells, seed) {
  const small = document.createElement('canvas');
  small.width = small.height = cells;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(cells, cells);
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < cells * cells; i++) {
    const v = (rnd() * 255) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, size, size);
  return c;
}

function finish(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Speckled, faintly streaked surface. `hex` is the base colour; everything
 * else is grain on top of it.
 */
export function grungeMap(hex, { size = 256, cells = 32, speck = 0.10, seed = 7,
                                 streaks = 0, repeat = 1 } = {}) {
  const key = `g${hex}${size}${cells}${speck}${seed}${streaks}${repeat}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hex);
  ctx.fillStyle = `rgb(${(col.r*255)|0},${(col.g*255)|0},${(col.b*255)|0})`;
  ctx.fillRect(0, 0, size, size);

  // Broad blotches.
  ctx.globalAlpha = 0.16;
  ctx.drawImage(noiseCanvas(size, cells, seed), 0, 0);
  ctx.globalAlpha = 0.09;
  ctx.drawImage(noiseCanvas(size, cells * 4, seed + 91), 0, 0);

  // Per-pixel speckle, the thing that kills the plastic look.
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, size, size);
  let s = seed * 2654435761 >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (rnd() - 0.5) * 255 * speck;
    img.data[i]     = Math.max(0, Math.min(255, img.data[i] + d));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + d));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + d));
  }
  ctx.putImageData(img, 0, 0);

  // Vertical streaking, for metal and rust.
  if (streaks) {
    ctx.globalAlpha = streaks;
    for (let i = 0; i < size / 3; i++) {
      const x = rnd() * size;
      const w = 1 + rnd() * 3;
      ctx.fillStyle = rnd() > 0.5 ? '#000' : '#fff';
      ctx.globalAlpha = streaks * (0.3 + rnd() * 0.7);
      ctx.fillRect(x, 0, w, size);
    }
    ctx.globalAlpha = 1;
  }

  const tex = finish(c, repeat);
  cache.set(key, tex);
  return tex;
}

/** Greyscale height for bumpMap. Cheap relief without a normal map. */
export function bumpFor(seed = 7, size = 256, cells = 48, repeat = 1) {
  const key = `b${seed}${size}${cells}${repeat}`;
  if (cache.has(key)) return cache.get(key);
  const c = noiseCanvas(size, cells, seed);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  cache.set(key, tex);
  return tex;
}

/** Corrugated panel lines, for shipping containers. */
export function ribbedMap(hex, { size = 256, pitch = 16, repeat = 1, seed = 3 } = {}) {
  const key = `r${hex}${pitch}${repeat}${seed}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hex);
  ctx.fillStyle = `rgb(${(col.r*255)|0},${(col.g*255)|0},${(col.b*255)|0})`;
  ctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += pitch) {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x, 0, 2, size);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 2, 0, 2, size);
  }
  ctx.globalAlpha = 0.14;
  ctx.drawImage(noiseCanvas(size, 40, seed), 0, 0);
  ctx.globalAlpha = 0.10;
  ctx.drawImage(noiseCanvas(size, 128, seed + 17), 0, 0);

  const tex = finish(c, repeat);
  cache.set(key, tex);
  return tex;
}

/** A vertical gradient used as an equirectangular sky. */
export function skyTexture(top, horizon) {
  const key = `s${top}${horizon}`;
  if (cache.has(key)) return cache.get(key);

  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  const t = new THREE.Color(top), h = new THREE.Color(horizon);
  g.addColorStop(0, `#${t.getHexString()}`);
  g.addColorStop(0.62, `#${h.getHexString()}`);
  g.addColorStop(1, `#${t.clone().multiplyScalar(0.5).getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
