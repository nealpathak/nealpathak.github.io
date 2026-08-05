// The planet itself: a subdivided icosahedron pushed around by the terrain
// function, coloured by elevation and climate, and shaded flat.

import * as THREE from 'three';
import { mixHex, smoothstep } from '../core/climate.js';

const SEABED_DEEP = 0x1a3a52;
const SEABED_SHALLOW = 0x2b5a72;
const SEABED_COLD = 0x30536b;

const BEACH = 0xd9c290;
const BEACH_COLD = 0xb0b6b4; // grey shingle rather than warm sand

const GRASS_TROPICAL = 0x4f9c3a;
const GRASS_TEMPERATE = 0x5f9e56;
const TUNDRA = 0x8d9179;
const ROCK = 0x74786a;
const SNOW = 0xe1e8ee;

// How wide the thaw is. A narrow band gives a hard painted-on cap; this much
// lets tundra and rock show through along the edge of the ice.
const THAW = 0.11;

/**
 * Colour for a patch of ground.
 *
 * Written as a stack of blends rather than a table of bands: vegetation first,
 * then bare rock on the high ground, then snow over the top of whatever is
 * underneath. Layering it this way means a change to the snow line can't
 * accidentally punch a hole in the grass.
 */
function landColor(e, coldness, frozen) {
  // Below the waterline the ocean shell hides most of this, but the depth
  // shading still reads through it.
  if (e < 0.0) {
    const depth = smoothstep(-0.05, -0.42, e);
    const base = mixHex(SEABED_SHALLOW, SEABED_DEEP, depth);
    return mixHex(base, SEABED_COLD, smoothstep(0.55, 0.95, coldness));
  }

  // Shoreline.
  if (e < 0.05) {
    const shore = mixHex(BEACH, BEACH_COLD, smoothstep(0.42, 0.72, coldness));
    return mixHex(shore, SNOW, smoothstep(frozen - THAW, frozen + THAW, coldness));
  }

  // Vegetation, cooling with distance from the equator.
  let color = mixHex(GRASS_TROPICAL, GRASS_TEMPERATE, smoothstep(0.04, 0.34, coldness));
  color = mixHex(color, TUNDRA, smoothstep(0.40, 0.66, coldness));

  // Bare rock where the ground gets high.
  color = mixHex(color, ROCK, smoothstep(0.88, 1.16, e));

  // Ice over everything, once it's cold enough.
  return mixHex(color, SNOW, smoothstep(frozen - THAW, frozen + THAW, coldness));
}

export function createPlanet({ radius, subdivisions, terrain, climate }) {
  // PolyhedronGeometry produces non-indexed geometry: every triangle owns its
  // three vertices. That is exactly what flat shading and per-face colouring
  // want, and it means displacement can never crack a seam.
  //
  // Note that `detail` here divides each icosahedron edge into detail+1
  // segments, so the face count is 20*(detail+1)^2 — linear-ish, not the
  // 4^detail you might expect. 40 gives ~34k faces, which is enough for
  // coastlines to read as curves rather than steps.
  const geometry = new THREE.IcosahedronGeometry(radius, subdivisions);

  const position = geometry.attributes.position;
  const count = position.count;
  const colors = new Float32Array(count * 3);

  const dir = new THREE.Vector3();
  const faceColor = new THREE.Color();
  const elevations = new Float32Array(count);
  const coldness = new Float32Array(count);

  // Pass 1: displace every vertex along its own direction from the centre.
  for (let i = 0; i < count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const e = terrain.heightAt(dir);
    elevations[i] = e;
    coldness[i] = climate.coldnessAt(dir, e);

    const r = radius + e;
    position.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
  }
  position.needsUpdate = true;

  // Pass 2: colour per triangle, using the average of its corners.
  for (let i = 0; i < count; i += 3) {
    const e = (elevations[i] + elevations[i + 1] + elevations[i + 2]) / 3;
    const c = (coldness[i] + coldness[i + 1] + coldness[i + 2]) / 3;
    faceColor.setHex(landColor(e, c, climate.FROZEN), THREE.SRGBColorSpace);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3 + 0] = faceColor.r;
      colors[(i + k) * 3 + 1] = faceColor.g;
      colors[(i + k) * 3 + 2] = faceColor.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'planet';

  return mesh;
}
