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

export function createClouds({ seed, radius, terrain, count }) {
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

  const pos = new THREE.Vector3();
  const right = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  function update(dt, elapsed) {
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
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { group, count: placed, puffs: puffCount, update };
}
