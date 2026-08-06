// What grows and lies between the trees.
//
// Three kinds of thing — grass, low shrubs, and loose rock — placed in a single
// pass. Which one lands at a given spot isn't random: it's decided by the same
// climate and terrain the forests and the ice already read from, so the ground
// tells you where you are. Grass in the warm lowlands, scrub as it cools, bare
// scree above the tree line and anywhere too steep to hold soil.
//
// All of it is placed once and never touched again, so it costs two things:
// three draw calls, and nothing per frame.

import * as THREE from 'three';
import { streamFor, pointOnSphere, range } from '../core/rng.js';
import { mixHex, smoothstep } from '../core/climate.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

const GRASS_WARM = 0x6fae4a;
const GRASS_COOL = 0x7c9a55;
const SHRUB_TEMPERATE = 0x4a6b38;
const SHRUB_TUNDRA = 0x6b6f4a;
const ROCK_LOW = 0x7d7f76;
const ROCK_HIGH = 0x9aa0a2;

function tangentBasis(p, outU, outV) {
  const ref = Math.abs(p.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  outU.crossVectors(p, ref).normalize();
  outV.crossVectors(p, outU).normalize();
}

export function createGroundcover({ seed, radius, terrain, climate, counts }) {
  const rng = streamFor(seed, 'groundcover');

  // A tuft, a bush and a stone. All tiny, all flat-shaded, all sitting on the
  // origin so the transform below is just "stand this on the ground".
  const grassGeo = new THREE.ConeGeometry(0.07, 0.23, 4);
  grassGeo.translate(0, 0.115, 0);
  const shrubGeo = new THREE.IcosahedronGeometry(0.1, 0);
  shrubGeo.scale(1.25, 0.8, 1.25);
  shrubGeo.translate(0, 0.07, 0);
  const rockGeo = new THREE.IcosahedronGeometry(0.11, 0);
  rockGeo.scale(1.3, 0.7, 1.1);
  rockGeo.translate(0, 0.04, 0);

  const mat = () => new THREE.MeshLambertMaterial({ flatShading: true });
  const grass = new THREE.InstancedMesh(grassGeo, mat(), counts.grass);
  const shrubs = new THREE.InstancedMesh(shrubGeo, mat(), counts.shrubs);
  const rocks = new THREE.InstancedMesh(rockGeo, mat(), counts.rocks);
  grass.name = 'grass';
  shrubs.name = 'shrubs';
  rocks.name = 'rocks';

  const dir = new THREE.Vector3();
  const tanU = new THREE.Vector3();
  const tanV = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  let nGrass = 0;
  let nShrub = 0;
  let nRock = 0;

  const total = counts.grass + counts.shrubs + counts.rocks;
  const maxAttempts = total * 12;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (nGrass >= counts.grass && nShrub >= counts.shrubs && nRock >= counts.rocks) break;

    pointOnSphere(rng, dir);
    const e = terrain.heightAt(dir);
    if (e < 0.03) continue; // in the sea, or on wet sand

    const cold = climate.coldnessAt(dir, e);
    if (cold > climate.FROZEN) continue; // under permanent ice; nothing shows

    tangentBasis(dir, tanU, tanV);
    const slope = terrain.slopeAt(dir, tanU, tanV);

    // Steep ground sheds soil, and nothing takes root past the tree line.
    // The slope threshold sits well above the one the trees use: land that is
    // merely awkward for a tree is still perfectly good grass, and a lower bar
    // here turns every gentle hillside into a boulder field.
    const aboveTreeLine = cold > climate.TREE_LINE;
    const bare = slope > 3.6 || aboveTreeLine;

    let mesh;
    let index;
    let hex;
    let s;

    if (bare) {
      if (nRock >= counts.rocks) continue;
      mesh = rocks;
      index = nRock++;
      hex = mixHex(ROCK_LOW, ROCK_HIGH, smoothstep(0.5, 0.78, cold));
      // Proper scree up in the cold; loose stones lower down.
      s = aboveTreeLine ? range(rng, 0.6, 1.5) : range(rng, 0.35, 0.85);
    } else if (cold > 0.36 ? rng() < 0.55 : rng() < 0.12) {
      // Scrub takes over from grass as it gets colder.
      if (nShrub >= counts.shrubs) continue;
      mesh = shrubs;
      index = nShrub++;
      hex = mixHex(SHRUB_TEMPERATE, SHRUB_TUNDRA, smoothstep(0.3, 0.6, cold));
      s = range(rng, 0.7, 1.45);
    } else {
      if (nGrass >= counts.grass) continue;
      mesh = grass;
      index = nGrass++;
      hex = mixHex(GRASS_WARM, GRASS_COOL, smoothstep(0.05, 0.45, cold));
      s = range(rng, 0.7, 1.5);
    }

    pos.copy(dir).multiplyScalar(radius + e);
    spin.setFromAxisAngle(UP, rng() * TAU);
    quat.setFromUnitVectors(UP, dir).multiply(spin);
    scale.set(s, s * range(rng, 0.8, 1.35), s);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(index, matrix);

    color.setHex(hex, THREE.SRGBColorSpace);
    color.offsetHSL(range(rng, -0.02, 0.02), range(rng, -0.05, 0.05), range(rng, -0.07, 0.07));
    mesh.setColorAt(index, color);
  }

  for (const [mesh, n] of [[grass, nGrass], [shrubs, nShrub], [rocks, nRock]]) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const group = new THREE.Group();
  group.name = 'groundcover';
  group.add(grass, shrubs, rocks);

  return { group, counts: { grass: nGrass, shrubs: nShrub, rocks: nRock } };
}
