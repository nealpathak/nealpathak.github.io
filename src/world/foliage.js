// Instanced ground cover.
//
// Grass, ferns and scattered debris are the difference between "a heightfield"
// and "a place". They are drawn as one InstancedMesh per kind, scattered on a
// blue-noise-ish grid, culled to a radius around the camera, and swayed by the
// shared wind uniforms so the whole world moves together.

import * as THREE from 'three';
import { makeMaterial } from '../render/materials.js';
import { makeRng, hash2 } from '../core/rng.js';
import { clamp01 } from '../core/math.js';

/**
 * A clump of blades: several tapered, bent quads arranged around a small
 * circle. One instance is a whole tuft rather than a single blade, so the
 * ground reads as covered without needing five times the instance count.
 */
function clumpGeometry({
  blades = 5, height = 0.34, width = 0.055, spread = 0.11,
  curve = 0.45, heightVariance = 0.45, seed = 1,
} = {}) {
  const rng = makeRng(seed * 2654435761 + 13);
  const geos = [];
  let tallest = height;
  for (let b = 0; b < blades; b++) {
    const h = height * (1 - heightVariance * 0.5 + rng() * heightVariance);
    tallest = Math.max(tallest, h);
    const g = new THREE.PlaneGeometry(width, h, 1, 3);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    const bend = curve * (0.5 + rng()) * (rng() < 0.5 ? -1 : 1);
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / h;
      // Taper to a point, and arc over: a straight rectangle never reads as
      // a blade of grass no matter what you texture it with.
      pos.setX(i, pos.getX(i) * (1 - t * t * 0.92));
      pos.setZ(i, pos.getZ(i) + t * t * bend * h);
      pos.setY(i, pos.getY(i) - t * t * Math.abs(bend) * h * 0.22);
    }
    const a = (b / blades) * Math.PI * 2 + rng() * 0.8;
    const r = Math.sqrt(rng()) * spread;
    g.rotateY(a + rng() * 1.2);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeSimple(geos, tallest);
}

/**
 * Merge, writing a root-to-tip gradient into vertex colour. This is baked
 * ambient occlusion, not data: tufts are darker where they meet the ground,
 * which is most of what stops instanced grass looking like flat stickers.
 */
function mergeSimple(geos, height) {
  let vertCount = 0, idxCount = 0;
  for (const g of geos) { vertCount += g.attributes.position.count; idxCount += g.index.count; }
  const pos = new Float32Array(vertCount * 3);
  const nrm = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const col = new Float32Array(vertCount * 3);
  const idx = new Uint16Array(idxCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < c; i++) {
      const t = clamp01(g.attributes.position.getY(i) / height);
      const shade = 0.42 + t * 0.58;
      col[(vo + i) * 3] = shade;
      col[(vo + i) * 3 + 1] = shade;
      col[(vo + i) * 3 + 2] = shade * (0.94 + t * 0.06);
    }
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += c; io += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export const FOLIAGE_KINDS = {
  grass: {
    geometry: () => clumpGeometry({ blades: 5, height: 0.32, width: 0.05, spread: 0.11, curve: 0.5, seed: 3 }),
    material: () => makeMaterial({
      color: 0x66684c, roughness: 0.97, side: THREE.DoubleSide, vertexColors: true,
      wind: 0.16, windMask: 'uv', rimColor: 0xc4c894, rimStrength: 0.16, rimPower: 3.0,
    }),
    scale: [0.75, 1.4], slopeMax: 0.42, density: 1.0, radiusScale: 0.46, wet: 0.0,
  },
  scrub: {
    geometry: () => clumpGeometry({ blades: 7, height: 0.52, width: 0.085, spread: 0.16, curve: 0.62, seed: 11 }),
    material: () => makeMaterial({
      color: 0x50543c, roughness: 0.97, side: THREE.DoubleSide, vertexColors: true,
      wind: 0.13, windMask: 'uv', rimColor: 0xb8c088, rimStrength: 0.15,
    }),
    scale: [0.8, 1.5], slopeMax: 0.38, density: 0.16, radiusScale: 0.8, wet: 0.0,
  },
  ash: {
    geometry: () => clumpGeometry({ blades: 4, height: 0.16, width: 0.05, spread: 0.10, curve: 0.34, seed: 23 }),
    material: () => makeMaterial({
      color: 0x4e483f, roughness: 1.0, side: THREE.DoubleSide, vertexColors: true,
      wind: 0.20, windMask: 'uv', rimColor: 0xd8b088, rimStrength: 0.24,
    }),
    scale: [0.7, 1.3], slopeMax: 0.72, density: 0.4, radiusScale: 0.5, wet: 0.0,
  },
  reed: {
    geometry: () => clumpGeometry({ blades: 6, height: 1.05, width: 0.035, spread: 0.09, curve: 0.28, heightVariance: 0.6, seed: 41 }),
    material: () => makeMaterial({
      color: 0x6c6440, roughness: 0.97, side: THREE.DoubleSide, vertexColors: true,
      wind: 0.26, windMask: 'uv', rimColor: 0xcfc79a, rimStrength: 0.20,
    }),
    // Reeds are the one thing here that wants its feet wet, and the only
    // thing that should be standing in the fen at all.
    scale: [0.8, 1.35], slopeMax: 0.3, density: 0.4, radiusScale: 0.6, wet: 0.55,
  },
  kelp: {
    geometry: () => clumpGeometry({ blades: 5, height: 1.5, width: 0.09, spread: 0.14, curve: 0.9, heightVariance: 0.7, seed: 77 }),
    material: () => makeMaterial({
      color: 0x28453e, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true,
      wind: 0.34, windMask: 'uv', rimColor: 0x9fe0d0, rimStrength: 0.26,
    }),
    // Drowned weed: it only grows where the water is over your knees, and it
    // is the tell that tells you so before you step in.
    scale: [0.7, 1.6], slopeMax: 0.5, density: 0.5, radiusScale: 0.7,
    wet: 6.0, wetMin: 0.35,
  },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();

export class FoliageField {
  /**
   * @param {Terrain} terrain
   * @param {object} opts
   * @param {string[]} opts.kinds
   * @param {number} opts.radius     scatter radius around `centre`
   * @param {number} opts.spacing    metres between candidate positions
   * @param {number} opts.quality    global density multiplier from settings
   * @param {(x:number,z:number)=>number} [opts.mask] 0..1 extra density control
   */
  constructor(terrain, {
    kinds = ['grass'], radius = 90, spacing = 1.1, centre = [0, 0],
    quality = 1, seed = 4242, mask = null, maxPerKind = 42000, water = null,
  } = {}) {
    this.terrain = terrain;
    this.meshes = [];
    this.group = new THREE.Group();
    this.group.name = 'foliage';

    const rng = makeRng(seed);
    for (const kindName of kinds) {
      const kind = FOLIAGE_KINDS[kindName];
      if (!kind) continue;

      // Collect placements first so the instance count is exact. Each kind gets
      // its own radius: short cover is invisible past the fog, so scattering it
      // out to the zone edge buys nothing but instances.
      const placements = [];
      const kindRadius = radius * (kind.radiusScale ?? 1);
      const step = spacing / Math.max(0.15, Math.sqrt(kind.density * quality));
      for (let z = -kindRadius; z <= kindRadius; z += step) {
        for (let x = -kindRadius; x <= kindRadius; x += step) {
          if (x * x + z * z > kindRadius * kindRadius) continue;
          // Jitter off the lattice, deterministically.
          const jx = (hash2(x * 97 | 0, z * 89 | 0, seed) - 0.5) * step * 1.5;
          const jz = (hash2(z * 71 | 0, x * 61 | 0, seed + 1) - 0.5) * step * 1.5;
          const wx = centre[0] + x + jx, wz = centre[1] + z + jz;

          const slope = terrain.slopeAt(wx, wz);
          if (slope > kind.slopeMax) continue;
          let d = 1 - slope / kind.slopeMax;
          if (mask) d *= mask(wx, wz);
          const blend = terrain.blendAt(wx, wz, _blend);
          d *= (1 - blend.rock * 0.9) * (1 - blend.path * 0.75);
          if (kindName === 'reed') d *= blend.moss;
          if (hash2(wx * 13 | 0, wz * 17 | 0, seed + 7) > d) continue;

          const wy = terrain.heightAt(wx, wz);
          if (water) {
            // Nothing grows out of open water except what is meant to. Without
            // this the fen sprouts a lawn in the middle of the pond.
            const depth = water.depthAt(wx, wz);
            if (depth > (kind.wet ?? 0)) continue;
            if (kind.wetMin !== undefined && depth < kind.wetMin) continue;
          } else if (kind.wetMin !== undefined) {
            continue;
          }

          placements.push([wx, wy, wz]);
          if (placements.length >= maxPerKind) break;
        }
        if (placements.length >= maxPerKind) break;
      }
      if (!placements.length) continue;

      const geo = kind.geometry();
      const mat = kind.material();
      const inst = new THREE.InstancedMesh(geo, mat, placements.length);
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.name = `foliage:${kindName}`;
      inst.frustumCulled = true;

      for (let i = 0; i < placements.length; i++) {
        const [x, y, z] = placements[i];
        _p.set(x, y - 0.04, z);
        // Tilt slightly with the ground so tufts do not stand proud of a slope.
        terrain.normalAt(x, z, _n);
        _q.setFromUnitVectors(_up, _n.lerp(_up, 0.55).normalize());
        _q.multiply(_yaw.setFromAxisAngle(_up, rng() * Math.PI * 2));
        const sc = kind.scale[0] + rng() * (kind.scale[1] - kind.scale[0]);
        _s.set(sc, sc * (0.85 + rng() * 0.4), sc);
        _m.compose(_p, _q, _s);
        inst.setMatrixAt(i, _m);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.meshes.push(inst);
      this.group.add(inst);
    }
  }

  get instanceCount() {
    return this.meshes.reduce((n, m) => n + m.count, 0);
  }

  dispose() {
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    this.meshes.length = 0;
  }
}

const _blend = { rock: 0, moss: 0, path: 0 };
const _yaw = new THREE.Quaternion();
