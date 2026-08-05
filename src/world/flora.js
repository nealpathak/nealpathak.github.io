// Trees.
//
// Placed by rejection sampling against the terrain and the climate: pick a
// direction, reject it if it's underwater, past the tree line, or on too steep
// a face. Everything is drawn as two instanced meshes, so a thousand trees
// still cost two draw calls.

import * as THREE from 'three';
import { streamFor, pointOnSphere, range } from '../core/rng.js';
import { mixHex, smoothstep } from '../core/climate.js';

// Broadleaf green at the equator, darkening toward the conifers that hold on
// nearest the tree line.
const LEAF_TROPICAL = 0x58a83c;
const LEAF_TEMPERATE = 0x3f7a38;
const LEAF_CONIFER = 0x2a5734;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Two unit vectors perpendicular to `p` and to each other.
 * Used for slope sampling; the choice of reference axis just avoids the
 * degenerate case where `p` is parallel to it.
 */
function tangentBasis(p, outU, outV) {
  const ref = Math.abs(p.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  outU.crossVectors(p, ref).normalize();
  outV.crossVectors(p, outU).normalize();
}

export function createFlora({ seed, radius, terrain, climate, count }) {
  const rng = streamFor(seed, 'flora');

  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.055, 0.32, 5);
  const leafGeo = new THREE.ConeGeometry(0.19, 0.5, 6);
  // Shift each part so its base sits at the origin. That makes the transform
  // below a simple "stand this at ground level", and it means the sway below
  // pivots at the foot of the trunk rather than through the middle of it.
  trunkGeo.translate(0, 0.16, 0);
  leafGeo.translate(0, 0.55, 0);

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a30, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  trunks.name = 'tree-trunks';
  leaves.name = 'tree-leaves';

  const dir = new THREE.Vector3();
  const tanU = new THREE.Vector3();
  const tanV = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  // Per-tree state kept for the sway. Positions and base orientations never
  // change; only the tilt on top of them does.
  const basePos = [];
  const baseQuat = [];
  const baseScale = [];
  const swayPhase = new Float32Array(count);
  const swayRate = new Float32Array(count);
  const swayAmount = new Float32Array(count);

  let planted = 0;
  const maxAttempts = count * 80;

  for (let attempt = 0; attempt < maxAttempts && planted < count; attempt++) {
    pointOnSphere(rng, dir);

    const e = terrain.heightAt(dir);
    if (e < 0.07) continue; // in the water or on bare beach

    // The tree line is climate, not altitude: it comes down to meet the sea
    // as you go north, and rides high over the equator.
    const cold = climate.coldnessAt(dir, e);
    if (cold > climate.TREE_LINE) continue;

    tangentBasis(dir, tanU, tanV);
    if (terrain.slopeAt(dir, tanU, tanV) > 2.2) continue; // cliff face

    // Stand the tree on the ground, pointing straight out from the centre.
    pos.copy(dir).multiplyScalar(radius + e);
    quat.setFromUnitVectors(UP, dir);
    const s = range(rng, 0.75, 1.35);
    scale.set(s, range(rng, 0.85, 1.3) * s, s);
    matrix.compose(pos, quat, scale);

    trunks.setMatrixAt(planted, matrix);
    leaves.setMatrixAt(planted, matrix);

    basePos.push(pos.clone());
    baseQuat.push(quat.clone());
    baseScale.push(scale.clone());

    // Trees near the tree line are the dark, narrow sort; the tropics get
    // brighter broadleaf greens. A little jitter on top so a forest doesn't
    // read as one flat colour.
    const t = cold / climate.TREE_LINE;
    let leafHex = mixHex(LEAF_TROPICAL, LEAF_TEMPERATE, smoothstep(0.05, 0.55, t));
    leafHex = mixHex(leafHex, LEAF_CONIFER, smoothstep(0.5, 1.0, t));
    color.setHex(leafHex, THREE.SRGBColorSpace);
    color.offsetHSL(range(rng, -0.02, 0.02), range(rng, -0.05, 0.05), range(rng, -0.06, 0.06));
    leaves.setColorAt(planted, color);

    // Exposed trees on high or cold ground move more than sheltered ones.
    swayPhase[planted] = rng() * Math.PI * 2;
    swayRate[planted] = range(rng, 0.6, 1.15);
    swayAmount[planted] = range(rng, 0.05, 0.1) * (1 + e * 0.4);

    planted++;
  }

  // If the terrain came out unusually watery we may plant fewer than asked;
  // hiding the unused instances is cheaper than rebuilding the mesh.
  trunks.count = planted;
  leaves.count = planted;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'flora';
  group.add(trunks, leaves);

  // Tilt in the tree's own local X. Because the base orientation already
  // stands the tree up, a local tilt is automatically a tilt along the
  // ground — no need to store a separate axis per tree.
  const tilt = new THREE.Quaternion();
  const swung = new THREE.Quaternion();

  function update(dt, elapsed) {
    for (let i = 0; i < planted; i++) {
      const angle = Math.sin(elapsed * swayRate[i] + swayPhase[i]) * swayAmount[i];
      const half = angle * 0.5;
      tilt.set(Math.sin(half), 0, 0, Math.cos(half));
      swung.copy(baseQuat[i]).multiply(tilt);

      matrix.compose(basePos[i], swung, baseScale[i]);
      trunks.setMatrixAt(i, matrix);
      leaves.setMatrixAt(i, matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
  }

  return { group, count: planted, update };
}
