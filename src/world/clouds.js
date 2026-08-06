// Weather, such as it is: a drifting deck of low-poly cloud.
//
// Two things make this read as an atmosphere rather than a ring of floating
// rocks. First, clouds are placed only over ground low enough to sit under
// them, so the tallest peaks rise through gaps in the deck instead of stabbing
// through a puff. Second, the deck rotates faster at the equator than near the
// poles, so over a minute or two it visibly shears — a rigid shell turning as
// one lump looks like a lid, not weather.

import * as THREE from 'three';
import { streamFor, pointOnSphere, range } from '../core/rng.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Soft-edged blot, drawn once and reused for every cloud shadow. */
function shadowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.82)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Clouds sit in this band above sea level. The floor has to clear the biggest
// puff radius so nothing dips into a hillside.
const DECK_LOW = 0.55;
const DECK_HIGH = 0.72;

// Don't put a cloud over ground higher than this.
const MAX_GROUND = 0.35;

// The ratio that matters: puffs must be large relative to how far they're
// scattered, or a cloud comes out as a handful of separate pebbles instead of
// one lumpy mass. Spread is an offset on the unit sphere, so it gets
// multiplied by the planet radius — small numbers here go a long way.
const SPREAD_MIN = 0.035;
const SPREAD_MAX = 0.095;
const BULK_MIN = 0.34;
const BULK_MAX = 0.5;

export function createClouds({ seed, radius, terrain, count, shadows = true }) {
  const rng = streamFor(seed, 'clouds');

  // One chunky blob, reused. Detail 1 is round enough to read as cloud while
  // still showing its facets under flat shading.
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshLambertMaterial({
    color: 0xf2f6fa,
    flatShading: true,
  });

  // Each cloud is a handful of overlapping puffs, so allocate for the worst
  // case and trim once we know how many actually got placed.
  const MAX_PUFFS = 6;
  const mesh = new THREE.InstancedMesh(puffGeo, material, count * MAX_PUFFS);
  mesh.name = 'clouds';

  // Per-puff state. Kept as flat arrays because this is walked every frame.
  const baseDir = [];
  const altitude = [];
  const speed = [];
  const scale = [];

  const dir = new THREE.Vector3();
  const tanU = new THREE.Vector3();
  const tanV = new THREE.Vector3();
  const offset = new THREE.Vector3();

  let placed = 0;
  const maxAttempts = count * 40;

  for (let attempt = 0; attempt < maxAttempts && placed < count; attempt++) {
    pointOnSphere(rng, dir);
    if (terrain.heightAt(dir) > MAX_GROUND) continue;

    // Latitude sets how fast this cloud travels. Weather piles up around the
    // equator and crawls near the poles.
    const lat = Math.abs(dir.y);
    const cloudSpeed = (0.006 + 0.014 * (1 - lat * lat)) * range(rng, 0.85, 1.15);
    const deck = radius + range(rng, DECK_LOW, DECK_HIGH);

    // A local tangent frame so the puffs of one cloud spread sideways along
    // the deck rather than stacking up radially.
    const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
    tanU.crossVectors(dir, ref).normalize();
    tanV.crossVectors(dir, tanU).normalize();

    const puffs = Math.round(range(rng, 4, MAX_PUFFS));
    const spread = range(rng, SPREAD_MIN, SPREAD_MAX);
    const bulk = range(rng, BULK_MIN, BULK_MAX);

    for (let k = 0; k < puffs; k++) {
      offset
        .copy(dir)
        .addScaledVector(tanU, range(rng, -spread, spread))
        .addScaledVector(tanV, range(rng, -spread, spread))
        .normalize();

      baseDir.push(offset.clone());
      altitude.push(deck + range(rng, -0.04, 0.04));
      speed.push(cloudSpeed);
      // Flattened: clouds are wider than they are deep, which reads much
      // better than a cluster of spheres.
      scale.push(new THREE.Vector3(bulk * range(rng, 0.85, 1.45), bulk * 0.4, bulk * range(rng, 0.85, 1.45)));
    }

    placed++;
  }

  const puffCount = baseDir.length;
  mesh.count = puffCount;

  const group = new THREE.Group();
  group.name = 'weather';
  group.add(mesh);

  // --- Shadows -------------------------------------------------------------
  // Cast analytically rather than with a shadow map. One directional shadow map
  // stretched over a whole planet would be far too coarse to resolve a cloud,
  // and would cost far more than this: for each puff, walk from the cloud away
  // from the sun and find where that ray meets the ground.
  let shadowMesh = null;
  if (shadows) {
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    // Lay the plane flat: it is built standing in XY, and everything below
    // assumes +Y is the surface normal.
    shadowGeo.rotateX(-Math.PI / 2);

    shadowMesh = new THREE.InstancedMesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        color: 0x0d1f2b,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      }),
      puffCount
    );
    shadowMesh.name = 'cloud-shadows';
    // After the land and after the sea, both of which they fall on.
    shadowMesh.renderOrder = 2;
    group.add(shadowMesh);
  }

  const pos = new THREE.Vector3();
  const right = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const hit = new THREE.Vector3();
  const shadowUp = new THREE.Vector3();
  const shadowRight = new THREE.Vector3();

  /**
   * Where the shadow of a puff at `p` falls, given a unit vector toward the
   * sun. Writes the ground point into `out` and returns how square-on the sun
   * strikes there (0 at the terminator, 1 overhead), or -1 for no shadow.
   */
  function projectShadow(p, sunDir, out) {
    const b = -p.dot(sunDir); // p · ray direction, where the ray is -sunDir
    const pp = p.lengthSq();

    // Intersect against a sea-level sphere first, then re-intersect against a
    // sphere raised to whatever terrain height was found there, and repeat.
    //
    // Simply pushing the sea-level hit outward to ground height — the obvious
    // shortcut — slides the blot sideways off the sun ray, by as much as 25
    // degrees over tall country. Re-intersecting keeps it on the ray. Two
    // rounds is plenty; the third almost always breaks out immediately.
    let r = radius;
    let facing = -1;
    for (let iter = 0; iter < 3; iter++) {
      const disc = b * b - (pp - r * r);
      if (disc < 0) return -1; // grazes past the planet entirely

      const t = -b - Math.sqrt(disc);
      if (t < 0) return -1; // ground is behind the cloud, not below it

      out.copy(p).addScaledVector(sunDir, -t);
      facing = out.dot(sunDir) / r;
      if (facing <= 0) return -1; // landed on the night side

      const height = Math.max(0, terrain.heightAt(out.divideScalar(r)));
      const nextR = radius + height;
      if (Math.abs(nextR - r) < 0.01) {
        r = nextR;
        break;
      }
      r = nextR;
    }

    // `out` is left unit length by the divide above; lift it just clear of the
    // ground so the blot doesn't fight with the surface it lies on.
    out.multiplyScalar(r + 0.03);
    return facing;
  }

  function update(dt, elapsed, sunDir) {
    for (let i = 0; i < puffCount; i++) {
      const b = baseDir[i];
      const a = speed[i] * elapsed;
      const c = Math.cos(a);
      const s = Math.sin(a);

      // Spin the puff's home direction about the planet's axis.
      const x = b.x * c - b.z * s;
      const y = b.y;
      const z = b.x * s + b.z * c;

      pos.set(x, y, z).multiplyScalar(altitude[i]);

      // Lay the flattened blob flat against the deck: +Y points straight out
      // from the planet's centre. Building the basis directly is cheaper than
      // deriving a quaternion for every puff, every frame.
      fwd.set(x, y, z); // already unit length
      right.set(-z, 0, x);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      const bx = right.y * fwd.z - right.z * fwd.y;
      const by = right.z * fwd.x - right.x * fwd.z;
      const bz = right.x * fwd.y - right.y * fwd.x;

      const sc = scale[i];
      matrix.set(
        right.x * sc.x, fwd.x * sc.y, bx * sc.z, pos.x,
        right.y * sc.x, fwd.y * sc.y, by * sc.z, pos.y,
        right.z * sc.x, fwd.z * sc.y, bz * sc.z, pos.z,
        0, 0, 0, 1
      );
      mesh.setMatrixAt(i, matrix);

      if (!shadowMesh) continue;

      pos.set(x, y, z).multiplyScalar(altitude[i]);
      const facing = sunDir ? projectShadow(pos, sunDir, hit) : -1;

      if (facing <= 0) {
        // Nothing to draw. Instances can't be skipped individually, so collapse
        // it to nothing instead.
        matrix.makeScale(0, 0, 0);
      } else {
        shadowUp.copy(hit).normalize();
        shadowRight.set(-shadowUp.z, 0, shadowUp.x);
        if (shadowRight.lengthSq() < 1e-8) shadowRight.set(1, 0, 0);
        shadowRight.normalize();
        const fx = shadowRight.y * shadowUp.z - shadowRight.z * shadowUp.y;
        const fy = shadowRight.z * shadowUp.x - shadowRight.x * shadowUp.z;
        const fz = shadowRight.x * shadowUp.y - shadowRight.y * shadowUp.x;

        // Shrink toward the terminator. A real shadow lengthens as the sun
        // drops, but fading it out is the artefact-free version: it keeps the
        // blot from stretching into a smear and avoids a hard pop at the line
        // between day and night.
        const fade = Math.min(1, facing * 2.2);
        const w = sc.x * 3.6 * fade;
        const d = sc.z * 3.6 * fade;

        matrix.set(
          shadowRight.x * w, shadowUp.x, fx * d, hit.x,
          shadowRight.y * w, shadowUp.y, fy * d, hit.y,
          shadowRight.z * w, shadowUp.z, fz * d, hit.z,
          0, 0, 0, 1
        );
      }
      shadowMesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;
  }

  return { group, count: placed, puffs: puffCount, update };
}
