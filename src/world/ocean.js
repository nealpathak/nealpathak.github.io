// The sea: a translucent shell sitting exactly at sea level.
//
// Because the planet's seabed is displaced downward and the shell is faceted
// and flat-shaded, the water reads as having depth and catching the light,
// without any per-frame vertex work.

import * as THREE from 'three';
import { mixHex, smoothstep } from '../core/climate.js';

const OPEN_WATER = 0x2f7fb5;
const SEA_ICE = 0xc9dde6;

export function createOcean({ radius, seaLevel = 0 }) {
  // Coarser than the land on purpose: large facets catch the light in broad
  // planes, which is what makes it read as water rather than glass.
  const geometry = new THREE.IcosahedronGeometry(radius + seaLevel, 16);

  // Pale, crusted water toward the poles. Per-face like the land, so the sea
  // ice has the same faceted edge as everything else.
  const position = geometry.attributes.position;
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const faceColor = new THREE.Color();
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i += 3) {
    let lat = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(position, i + k).normalize();
      lat += Math.abs(v.y);
    }
    lat /= 3;

    faceColor.setHex(
      mixHex(OPEN_WATER, SEA_ICE, smoothstep(0.78, 0.95, lat)),
      THREE.SRGBColorSpace
    );
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3 + 0] = faceColor.r;
      colors[(i + k) * 3 + 1] = faceColor.g;
      colors[(i + k) * 3 + 2] = faceColor.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ocean';
  mesh.renderOrder = 1;

  // A very slow drift of the facets so the highlights on the water move.
  // Strictly about the planet's own axis — any other axis would carry the
  // sea ice away from the poles.
  const axis = new THREE.Vector3(0, 1, 0);

  return {
    mesh,
    update(dt) {
      mesh.rotateOnAxis(axis, dt * 0.012);
    },
  };
}
