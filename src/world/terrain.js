// Heightfield terrain.
//
// The shape is not pure noise. A zone declares a base noise profile plus a list
// of "shapers" — plateaus, ridges, basins and paths — that are applied in
// order. That way a level designer (me, in a data file) gets an arena that is
// actually flat, a ravine that is actually a ravine, and a path you can walk
// without the noise deciding otherwise.

import * as THREE from 'three';
import { fbmField } from '../render/textures.js';
import { clamp01, smoothstep, lerp } from '../core/math.js';
import { surface } from '../render/textures.js';
import { makeMaterial } from '../render/materials.js';

// --- shapers ---------------------------------------------------------------
// Each returns { apply(x, z, h, blend) -> h } and may write into `blend`,
// a {rock, moss, path} accumulator used for texture blending.

/** Flatten a disc to `height`, easing out over `falloff` metres. */
export function plateau(cx, cz, radius, height, falloff = 8) {
  return (x, z, h, blend) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d > radius + falloff) return h;
    const t = 1 - smoothstep(clamp01((d - radius) / falloff));
    blend.path = Math.max(blend.path, t * 0.7);
    return lerp(h, height, t);
  };
}

/** Raise a ridge along a polyline. */
export function ridge(points, width, height, sharpness = 1.6) {
  return (x, z, h, blend) => {
    const d = distanceToPolyline(x, z, points);
    if (d > width) return h;
    const t = Math.pow(1 - d / width, sharpness);
    blend.rock = Math.max(blend.rock, t);
    return h + height * t;
  };
}

/** Carve a bowl. Negative height relative to the surrounding land. */
export function basin(cx, cz, radius, depth, falloff = 10) {
  return (x, z, h, blend) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d > radius + falloff) return h;
    const t = 1 - smoothstep(clamp01((d - radius) / falloff));
    blend.moss = Math.max(blend.moss, t * 0.6);
    return h - depth * t;
  };
}

/**
 * A contained pool: a dish flattened to `floor` at the centre, rising to a lip
 * at the shore, with the surrounding land pulled up to meet it.
 *
 * A plain basin over noisy ground does not give you a pond — the noise breaches
 * the rim somewhere and the water runs out of the level. This guarantees a
 * shore all the way round while still letting enough noise through that the bed
 * has hummocks in it.
 */
export function pool(cx, cz, radius, floor, rise = 1.6, falloff = 10) {
  const lip = floor + rise;
  return (x, z, h, blend) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d > radius + falloff) return h;
    const inner = clamp01(d / radius);
    if (d <= radius) {
      // A flat bed that turns up sharply near the shore. A smoothstep dish is
      // already half way up its own bank at the middle, which gives a puddle
      // with no depth anywhere rather than a pond.
      const dish = floor + (lip - floor) * inner * inner * inner;
      blend.moss = Math.max(blend.moss, (1 - inner) * 0.8);
      // Keep a little noise for hummocks, but never enough to breach the lip or
      // to punch through the floor: the deepest the water gets is authored.
      const v = lerp(h, dish, 0.94);
      return v < floor ? floor : v > lip - 0.05 ? lip - 0.05 : v;
    }
    const t = 1 - smoothstep(clamp01((d - radius) / falloff));
    blend.moss = Math.max(blend.moss, t * 0.3);
    return lerp(h, lip, t);
  };
}

/** Flatten a corridor along a polyline, so a route is always walkable. */
export function path(points, width, { smooth = 6, drop = 0.0 } = {}) {
  // Precompute the height along the path from its own control points, which
  // carry an explicit y.
  return (x, z, h, blend) => {
    const near = nearestOnPolyline(x, z, points);
    if (near.dist > width + smooth) return h;
    const t = 1 - smoothstep(clamp01((near.dist - width) / smooth));
    blend.path = Math.max(blend.path, t);
    const target = near.y - drop;
    return lerp(h, target, t * 0.94);
  };
}

/** A cliff wall: everything on one side of a line is pushed up hard. */
export function escarpment(ax, az, bx, bz, height, thickness = 6) {
  return (x, z, h, blend) => {
    // Signed distance to the line, positive on the left of a->b.
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const s = ((x - ax) * dz - (z - az) * dx) / len;
    const t = smoothstep(clamp01((s + thickness) / (thickness * 2)));
    blend.rock = Math.max(blend.rock, 1 - Math.abs(s) / (thickness * 2));
    return h + height * t;
  };
}

function distanceToPolyline(x, z, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, distanceToSegment(x, z, points[i], points[i + 1]));
  }
  return best;
}

function distanceToSegment(px, pz, a, b) {
  const ax = a[0], az = a[2] ?? a[1], bx = b[0], bz = b[2] ?? b[1];
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function nearestOnPolyline(x, z, points) {
  let best = { dist: Infinity, y: 0, t: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best.dist) best = { dist: d, y: ay + (by - ay) * t, t };
  }
  return best;
}

// --- terrain ---------------------------------------------------------------

export class Terrain {
  /**
   * @param {object} opts
   * @param {number} opts.size        world size in metres (square, centred on origin)
   * @param {number} opts.resolution  vertices per side; 257 gives ~0.8m at 200m
   * @param {number} opts.seed
   * @param {number} opts.amplitude   base noise height in metres
   * @param {number} opts.frequency
   * @param {Array}  opts.shapers
   * @param {[number,number]} [opts.origin] world XZ of the terrain centre
   */
  constructor({
    size = 220, resolution = 257, seed = 7, amplitude = 9, frequency = 3.0,
    shapers = [], origin = [0, 0], detail = 0.55, ridged = false,
  } = {}) {
    this.size = size;
    this.res = resolution;
    this.origin = origin;
    this.cell = size / (resolution - 1);
    this.heights = new Float32Array(resolution * resolution);
    this.blend = new Float32Array(resolution * resolution * 3);   // rock, moss, path

    const base = fbmField(resolution, { octaves: 6, frequency, seed, warp: 0.05, ridged });
    const fine = fbmField(resolution, { octaves: 4, frequency: frequency * 5.5, seed: seed + 91 });
    // A ridged layer on top of the smooth one. Without it, hillsides are
    // featureless ramps no matter how good the texturing is.
    const relief = fbmField(resolution, { octaves: 5, frequency: frequency * 2.6, seed: seed + 313, ridged: true });

    const half = size / 2;
    const b = { rock: 0, moss: 0, path: 0 };
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const idx = j * resolution + i;
        const x = origin[0] - half + i * this.cell;
        const z = origin[1] - half + j * this.cell;
        let h = (base[idx] - 0.5) * 2 * amplitude
          + (relief[idx] - 0.5) * 2 * amplitude * detail * 0.42
          + (fine[idx] - 0.5) * 2 * amplitude * detail * 0.16;
        b.rock = 0; b.moss = 0; b.path = 0;
        for (const shape of shapers) h = shape(x, z, h, b);
        this.heights[idx] = h;
        this.blend[idx * 3] = b.rock;
        this.blend[idx * 3 + 1] = b.moss;
        this.blend[idx * 3 + 2] = b.path;
      }
    }

    this.mesh = null;
  }

  _clampIdx(i) { return i < 0 ? 0 : i >= this.res ? this.res - 1 : i; }

  /** Bilinear height lookup in world space. */
  heightAt(x, z) {
    const half = this.size / 2;
    const fx = (x - this.origin[0] + half) / this.cell;
    const fz = (z - this.origin[1] + half) / this.cell;
    const i0 = this._clampIdx(Math.floor(fx)), j0 = this._clampIdx(Math.floor(fz));
    const i1 = this._clampIdx(i0 + 1), j1 = this._clampIdx(j0 + 1);
    const tx = clamp01(fx - Math.floor(fx)), tz = clamp01(fz - Math.floor(fz));
    const h = this.heights;
    const r = this.res;
    const h00 = h[j0 * r + i0], h10 = h[j0 * r + i1];
    const h01 = h[j1 * r + i0], h11 = h[j1 * r + i1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /** Surface normal from finite differences. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const d = this.cell;
    const hl = this.heightAt(x - d, z), hr = this.heightAt(x + d, z);
    const hd = this.heightAt(x, z - d), hu = this.heightAt(x, z + d);
    return out.set(hl - hr, 2 * d, hd - hu).normalize();
  }

  /** Slope in radians at a point, 0 = flat. */
  slopeAt(x, z) {
    const n = this.normalAt(x, z, _tmpN);
    return Math.acos(clamp01(n.y));
  }

  /** Blend weights (rock, moss, path) at a world point. */
  blendAt(x, z, out = { rock: 0, moss: 0, path: 0 }) {
    const half = this.size / 2;
    const i = this._clampIdx(Math.round((x - this.origin[0] + half) / this.cell));
    const j = this._clampIdx(Math.round((z - this.origin[1] + half) / this.cell));
    const k = (j * this.res + i) * 3;
    out.rock = this.blend[k]; out.moss = this.blend[k + 1]; out.path = this.blend[k + 2];
    return out;
  }

  /** Is this point walkable — not too steep, not underwater? */
  isWalkable(x, z, maxSlope = 0.72) {
    return this.slopeAt(x, z) < maxSlope;
  }

  /**
   * Build the render mesh. `lodStep` of 1 is full resolution; 2 halves it, which
   * is how the low quality preset trades detail for triangles.
   */
  build({ lodStep = 1, material = null } = {}) {
    const r = this.res;
    const step = Math.max(1, lodStep);
    const n = Math.floor((r - 1) / step) + 1;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * n * 3);
    const nrm = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const col = new Float32Array(n * n * 3);
    const half = this.size / 2;

    const normal = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const si = Math.min(r - 1, i * step), sj = Math.min(r - 1, j * step);
        const k = j * n + i;
        const x = this.origin[0] - half + si * this.cell;
        const z = this.origin[1] - half + sj * this.cell;
        const y = this.heights[sj * r + si];
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        this.normalAt(x, z, normal);
        nrm[k * 3] = normal.x; nrm[k * 3 + 1] = normal.y; nrm[k * 3 + 2] = normal.z;
        uv[k * 2] = si / (r - 1); uv[k * 2 + 1] = sj / (r - 1);
        const b = (sj * r + si) * 3;
        col[k * 3] = this.blend[b];
        col[k * 3 + 1] = this.blend[b + 1];
        col[k * 3 + 2] = this.blend[b + 2];
      }
    }

    const idx = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();

    this.mesh = new THREE.Mesh(geo, material ?? makeTerrainMaterial());
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'terrain';
    this.mesh.userData.terrain = this;
    return this.mesh;
  }

  dispose() {
    this.mesh?.geometry.dispose();
  }
}

const _tmpN = new THREE.Vector3();

/**
 * Terrain material: three surfaces blended by slope and by the vertex colour
 * the shapers wrote. Extending MeshStandardMaterial rather than writing a
 * standalone shader keeps shadows, fog and the rim term working.
 */
export function makeTerrainMaterial({
  dirt = 'dirt', rock = 'rock', moss = 'ash', scale = 0.09, rockScale = 0.075,
} = {}) {
  const A = surface(dirt), B = surface(rock), C = surface(moss);

  // The dirt surface is attached only so three defines USE_MAP,
  // USE_NORMALMAP_TANGENTSPACE and USE_ROUGHNESSMAP for us; the injected
  // chunks below replace every one of those samples with the blend.
  const mat = makeMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true,
    surface: dirt, normalScale: 0.85,
    rimColor: 0xffb375, rimStrength: 0.05, rimPower: 4.0,
  });

  mat.onBeforeCompile = ((base) => (shader) => {
    base?.(shader);
    shader.uniforms.tDirt = { value: A.map };
    shader.uniforms.tDirtN = { value: A.normalMap };
    shader.uniforms.tRock = { value: B.map };
    shader.uniforms.tRockN = { value: B.normalMap };
    shader.uniforms.tMoss = { value: C.map };
    shader.uniforms.tMossN = { value: C.normalMap };
    shader.uniforms.uScale = { value: scale };
    shader.uniforms.uRockScale = { value: rockScale };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTerrainWorld;
        varying vec3 vTerrainNormal;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vTerrainWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vTerrainNormal = normalize( mat3( modelMatrix ) * objectNormal );`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDirt; uniform sampler2D tDirtN;
        uniform sampler2D tRock; uniform sampler2D tRockN;
        uniform sampler2D tMoss; uniform sampler2D tMossN;
        uniform float uScale; uniform float uRockScale;
        varying vec3 vTerrainWorld;
        varying vec3 vTerrainNormal;`)
      .replace('#include <map_fragment>', /* glsl */`
        // Flat world-space UVs for anything lying on the ground: terrain never
        // stretches and tiling stays consistent however the mesh was cut.
        vec2 uvFlat = vTerrainWorld.xz * uScale;

        // Rock is triplanar. Projecting it onto a plane derived from the
        // surface normal — which rotates continuously across a hillside —
        // twists the UVs into huge concentric swirls. Blending three
        // axis-aligned projections by the normal costs two extra samples and
        // is correct on every face, including vertical ones.
        vec3 blendW = abs( vTerrainNormal );
        blendW = pow( blendW, vec3( 4.0 ) );
        blendW /= max( blendW.x + blendW.y + blendW.z, 1e-4 );
        vec2 uvX = vTerrainWorld.zy * uRockScale;
        vec2 uvY = vTerrainWorld.xz * uRockScale;
        vec2 uvZ = vTerrainWorld.xy * uRockScale;

        float slope = 1.0 - clamp( vTerrainNormal.y, 0.0, 1.0 );
        float rockW = smoothstep( 0.24, 0.58, slope );
        rockW = max( rockW, vColor.r );
        float mossW = vColor.g * 0.8 * ( 1.0 - rockW );
        float pathW = vColor.b * ( 1.0 - rockW );

        vec4 cDirt = texture2D( tDirt, uvFlat );
        vec4 cRock = texture2D( tRock, uvX ) * blendW.x
                   + texture2D( tRock, uvY ) * blendW.y
                   + texture2D( tRock, uvZ ) * blendW.z;
        vec4 cMoss = texture2D( tMoss, uvFlat * 1.7 );

        vec4 blended = cDirt;
        blended = mix( blended, cMoss, mossW );
        blended = mix( blended, cRock, rockW );
        // The trodden path reads as compacted, slightly paler earth.
        blended.rgb = mix( blended.rgb, blended.rgb * vec3( 1.16, 1.10, 1.02 ), pathW );

        diffuseColor *= blended;
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 nDirt = texture2D( tDirtN, uvFlat ).xyz * 2.0 - 1.0;
          // Blending tangent-space normals across the three projections is an
          // approximation, but at this scale it is indistinguishable from the
          // correct whiteout blend and costs a lot less.
          vec3 nRock = ( texture2D( tRockN, uvX ).xyz * blendW.x
                       + texture2D( tRockN, uvY ).xyz * blendW.y
                       + texture2D( tRockN, uvZ ).xyz * blendW.z ) * 2.0 - 1.0;
          vec3 nMoss = texture2D( tMossN, uvFlat * 1.7 ).xyz * 2.0 - 1.0;
          vec3 mapN = mix( mix( nDirt, nMoss, mossW ), nRock, rockW );
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        #endif
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        float roughnessFactor = roughness * mix( 0.98, 0.78, rockW );
      `);
  })(mat.onBeforeCompile);

  const key = `terrain:${scale}:${rockScale}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}
