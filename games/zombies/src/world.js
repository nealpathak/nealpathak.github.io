// The arena: a fenced loading dock at night.
//
// Everything is built from one unit BoxGeometry that gets scaled, so the whole
// level costs a handful of materials and no asset downloads. Each solid
// registers an AABB for collision and a mesh for bullets to stop against.

import * as THREE from 'three';

export const HALF = 20;          // arena runs -HALF..HALF on X and Z
const WALL_H = 5;
const UNIT = new THREE.BoxGeometry(1, 1, 1);

export function buildWorld() {
  const scene = new THREE.Scene();
  const night = new THREE.Color(0x0a0c10);
  scene.background = night;
  scene.fog = new THREE.FogExp2(0x0a0c10, 0.028);

  /** @type {{min:{x,y,z},max:{x,y,z}}[]} */
  const colliders = [];
  /** @type {THREE.Mesh[]} */
  const solids = [];

  const mats = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 }),
    wall:     new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.9 }),
    crate:    new THREE.MeshStandardMaterial({ color: 0x5a4a33, roughness: 0.85 }),
    container:new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.7, metalness: 0.25 }),
    steel:    new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.55, metalness: 0.5 }),
  };

  // solid(): x/z are the centre, y is the *bottom*. Registers collision.
  function solid(x, z, w, d, h, mat, y = 0) {
    const m = new THREE.Mesh(UNIT, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    scene.add(m);
    solids.push(m);
    colliders.push({
      min: { x: x - w / 2, y, z: z - d / 2 },
      max: { x: x + w / 2, y: y + h, z: z + d / 2 },
    });
    return m;
  }

  // --- ground ------------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    mats.concrete
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  solids.push(floor);

  // Painted bay lines, so movement has something to read against.
  const paint = new THREE.MeshBasicMaterial({ color: 0xb9a06a, transparent: true, opacity: 0.16 });
  for (let i = -3; i <= 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, HALF * 1.5), paint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * 5, 0.012, 0);
    scene.add(line);
  }

  // --- perimeter ---------------------------------------------------------
  const T = 1; // wall thickness
  solid(0, -HALF, HALF * 2 + T, T, WALL_H, mats.wall);
  solid(0,  HALF, HALF * 2 + T, T, WALL_H, mats.wall);
  solid(-HALF, 0, T, HALF * 2 + T, WALL_H, mats.wall);
  solid( HALF, 0, T, HALF * 2 + T, WALL_H, mats.wall);

  // --- cover -------------------------------------------------------------
  // Placed to break sightlines without creating a corner you can hide in
  // forever — every pocket has at least two ways in.
  solid(-11,  -8, 6.1, 2.5, 2.6, mats.container);
  solid( 12,  -6, 2.5, 6.1, 2.6, mats.container);
  solid( -7,  11, 6.1, 2.5, 2.6, mats.container);
  solid( 13,  12, 6.1, 2.5, 2.6, mats.container);

  solid(  0,   0, 3.0, 3.0, 3.2, mats.steel);       // centre block
  solid(-16,  16, 2.2, 2.2, 2.4, mats.crate);
  solid( 16, -16, 2.2, 2.2, 2.4, mats.crate);
  solid( -3, -14, 1.6, 1.6, 1.8, mats.crate);
  solid(  6,   8, 1.6, 1.6, 1.8, mats.crate);

  for (const x of [-HALF + 6, HALF - 6]) {
    for (const z of [-HALF + 6, HALF - 6]) {
      solid(x, z, 0.7, 0.7, WALL_H, mats.steel);    // corner posts
    }
  }

  // --- light -------------------------------------------------------------
  // Dark enough to be night, bright enough that a zombie at 20m is a shape you
  // can read rather than a rumour.
  scene.add(new THREE.HemisphereLight(0x33405a, 0x0d1014, 0.95));

  const moon = new THREE.DirectionalLight(0x8ea6c8, 0.55);
  moon.position.set(-18, 30, -12);
  scene.add(moon);

  // Sodium lamps. One of them is on its way out.
  const lampPositions = [
    [-12, 4.4, -12], [12, 4.4, 12], [-12, 4.4, 12], [12, 4.4, -12],
  ];
  const lamps = lampPositions.map(([x, y, z], i) => {
    const light = new THREE.PointLight(0xffb457, i === 1 ? 52 : 42, 34, 2);
    light.position.set(x, y, z);
    scene.add(light);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
    );
    bulb.position.copy(light.position);
    scene.add(bulb);

    return { light, bulb, base: light.intensity, flicker: i === 1 };
  });

  // --- spawns ------------------------------------------------------------
  // Ring of points just inside the fence. Zombies walk in from the dark.
  const spawnPoints = [];
  const r = HALF - 2.5;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    spawnPoints.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  let t = 0;
  function update(dt) {
    t += dt;
    for (const l of lamps) {
      if (!l.flicker) continue;
      // Cheap deterministic stutter: two detuned sines gated hard.
      const n = Math.sin(t * 37.3) * Math.sin(t * 11.7);
      l.light.intensity = n > 0.55 ? l.base * 0.18 : l.base;
    }
  }

  // The level never moves, so resolve its matrices once, here. Bullets can
  // then be traced against it before the first frame is ever drawn.
  scene.updateMatrixWorld(true);

  return { scene, colliders, solids, spawnPoints, update };
}
