// The sea: a translucent shell sitting exactly at sea level.
//
// Because the planet's seabed is displaced downward and the shell is faceted
// and flat-shaded, the water reads as having depth and catching the light,
// without any per-frame vertex work.

import * as THREE from 'three';

export function createOcean({ radius, seaLevel = 0 }) {
  // Coarser than the land on purpose: large facets catch the light in broad
  // planes, which is what makes it read as water rather than glass.
  const geometry = new THREE.IcosahedronGeometry(radius + seaLevel, 16);

  const material = new THREE.MeshLambertMaterial({
    color: 0x2f7fb5,
    transparent: true,
    opacity: 0.82,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ocean';
  mesh.renderOrder = 1;

  // A very slow drift of the facets so the highlights on the water move.
  const axis = new THREE.Vector3(0.2, 1, 0.15).normalize();

  return {
    mesh,
    update(dt) {
      mesh.rotateOnAxis(axis, dt * 0.012);
    },
  };
}
