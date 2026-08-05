// Trees.
//
// Placed by rejection sampling against the terrain function: pick a direction,
// reject it if it's underwater, above the snow line, or on too steep a face.
// Everything is drawn as two instanced meshes, so a thousand trees still cost
// two draw calls.

import * as THREE from 'three';
import { streamFor, pointOnSphere, range } from '../core/rng.js';

// Spread wider than feels necessary: seen from directly overhead a tree is
// just a disc, so it needs to differ from the grass underneath it in value,
// not only in hue.
const FOLIAGE_COLORS = [0x2f6b34, 0x3f7a38, 0x54974a, 0x6cb057, 0x275c33, 0x7cbd60];

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

export function createFlora({ seed, radius, terrain, count }) {
  const rng = streamFor(seed, 'flora');

  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.055, 0.32, 5);
  const leafGeo = new THREE.ConeGeometry(0.19, 0.5, 6);
  // Shift each part so its base sits at the origin; makes the transform below
  // a simple "stand this at ground level" rather than an offset puzzle.
  trunkGeo.translate(0, 0.16, 0);
  leafGeo.translate(0, 0.55, 0);

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a30, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: false });

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

  let planted = 0;
  const maxAttempts = count * 80;

  for (let attempt = 0; attempt < maxAttempts && planted < count; attempt++) {
    pointOnSphere(rng, dir);

    const e = terrain.heightAt(dir);
    if (e < 0.07) continue; // in the water or on bare beach
    if (e > 1.0) continue; // above the tree line

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

    color.setHex(FOLIAGE_COLORS[Math.floor(rng() * FOLIAGE_COLORS.length)], THREE.SRGBColorSpace);
    leaves.setColorAt(planted, color);

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

  return { group, count: planted };
}
