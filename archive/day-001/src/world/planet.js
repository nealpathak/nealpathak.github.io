// The planet itself: a subdivided icosahedron pushed around by the terrain
// function, coloured by elevation, and shaded flat.

import * as THREE from 'three';

// Elevation bands, in world units relative to sea level. Each face takes the
// colour of the first band whose ceiling it falls under, so the palette reads
// as distinct terrain types rather than a smooth gradient.
// Thresholds are tuned against the actual elevation distribution this terrain
// produces (median land ~0.19, p90 ~0.60, peaks ~1.40). Re-check them if
// landHeight in state.json ever changes, or the palette will collapse into one
// or two colours.
const BANDS = [
  { until: -0.34, color: 0x1a3a52 }, // deep seabed
  { until: -0.07, color: 0x2b5a72 }, // shallow seabed
  { until: 0.05, color: 0xd9c290 }, // beach
  { until: 0.42, color: 0x5f9e56 }, // grassland
  { until: 0.80, color: 0x487d45 }, // forest floor
  { until: 1.15, color: 0x74786a }, // highland rock
  { until: Infinity, color: 0xe9edf1 }, // snow
];

function colorForElevation(e) {
  for (const band of BANDS) {
    if (e < band.until) return band.color;
  }
  return BANDS[BANDS.length - 1].color;
}

export function createPlanet({ radius, subdivisions, terrain }) {
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

  // Pass 1: displace every vertex along its own direction from the centre.
  for (let i = 0; i < count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const e = terrain.heightAt(dir);
    elevations[i] = e;

    // Seabed is pulled down but kept shallow enough that the ocean shell
    // always covers it.
    const r = radius + e;
    position.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
  }
  position.needsUpdate = true;

  // Pass 2: colour per triangle, using the average elevation of its corners.
  for (let i = 0; i < count; i += 3) {
    const avg = (elevations[i] + elevations[i + 1] + elevations[i + 2]) / 3;
    faceColor.setHex(colorForElevation(avg), THREE.SRGBColorSpace);
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
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return mesh;
}
