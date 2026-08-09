// Builds one level's arena from its definition in levels.js.
//
// Each call owns everything it creates and hands back a dispose() for it, so
// stepping through six levels in a run doesn't leak GPU memory. Textures are
// the exception: they're cached and shared across levels, so they're never
// disposed here.

import * as THREE from 'three';
import { grungeMap, ribbedMap, bumpFor, skyTexture } from './textures.js';

export function buildWorld(level) {
  const scene = new THREE.Scene();
  scene.background = skyTexture(level.sky[0], level.sky[1]);
  scene.fog = new THREE.FogExp2(level.fog, level.fogDensity);

  const HALF = level.half;
  const WALL_H = 5;

  /** @type {{min:{x,y,z},max:{x,y,z}}[]} */
  const colliders = [];
  /** @type {THREE.Mesh[]} */
  const solids = [];
  const owned = { geometries: [], materials: [] };

  const unit = new THREE.BoxGeometry(1, 1, 1);
  owned.geometries.push(unit);

  const track = (m) => { owned.materials.push(m); return m; };

  const mats = {
    concrete: track(new THREE.MeshStandardMaterial({
      map: grungeMap(0x3d4046, { seed: 11, speck: 0.13, repeat: 8 }),
      bumpMap: bumpFor(11, 256, 64, 8), bumpScale: 0.4, roughness: 0.96,
    })),
    wall: track(new THREE.MeshStandardMaterial({
      map: grungeMap(0x2e3138, { seed: 23, speck: 0.10, repeat: 3 }),
      bumpMap: bumpFor(23, 256, 48, 3), bumpScale: 0.3, roughness: 0.92,
    })),
    crate: track(new THREE.MeshStandardMaterial({
      map: grungeMap(0x5d4c33, { seed: 5, speck: 0.16, streaks: 0.10, repeat: 1 }),
      bumpMap: bumpFor(5, 256, 32, 1), bumpScale: 0.5, roughness: 0.88,
    })),
    container: track(new THREE.MeshStandardMaterial({
      map: ribbedMap(0x7d3d2f, { pitch: 14, repeat: 2, seed: 31 }),
      roughness: 0.72, metalness: 0.28,
    })),
    steel: track(new THREE.MeshStandardMaterial({
      map: grungeMap(0x4c5058, { seed: 41, speck: 0.09, streaks: 0.14, repeat: 2 }),
      bumpMap: bumpFor(41, 256, 40, 2), bumpScale: 0.25,
      roughness: 0.58, metalness: 0.52,
    })),
  };

  /** x/z are the centre, y is the bottom. Draws it and registers collision. */
  function solid(x, z, w, d, h, mat, y = 0) {
    const m = new THREE.Mesh(unit, mat);
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

  // --- ground --------------------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  owned.geometries.push(floorGeo);
  const floor = new THREE.Mesh(floorGeo, mats.concrete);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  solids.push(floor);

  // Painted bay lines give movement something to read against.
  const lineGeo = new THREE.PlaneGeometry(0.18, HALF * 1.5);
  owned.geometries.push(lineGeo);
  const paint = track(new THREE.MeshBasicMaterial({
    color: 0xb9a06a, transparent: true, opacity: 0.13,
  }));
  const lanes = Math.floor(HALF / 5);
  for (let i = -lanes; i <= lanes; i++) {
    const line = new THREE.Mesh(lineGeo, paint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * 5, 0.012, 0);
    scene.add(line);
  }

  // --- perimeter -----------------------------------------------------------
  const T = 1;
  solid(0, -HALF, HALF * 2 + T, T, WALL_H, mats.wall);
  solid(0, HALF, HALF * 2 + T, T, WALL_H, mats.wall);
  solid(-HALF, 0, T, HALF * 2 + T, WALL_H, mats.wall);
  solid(HALF, 0, T, HALF * 2 + T, WALL_H, mats.wall);

  // --- the level's own geometry --------------------------------------------
  level.build(solid, mats);

  // --- light ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x33405a, 0x0d1014, 0.85));
  const moon = new THREE.DirectionalLight(0x8ea6c8, 0.5);
  moon.position.set(-18, 30, -12);
  scene.add(moon);

  const bulbGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const haloGeo = new THREE.ConeGeometry(2.4, 4.2, 12, 1, true);
  owned.geometries.push(bulbGeo, haloGeo);
  const bulbMat = track(new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
  const haloMat = track(new THREE.MeshBasicMaterial({
    color: level.lampColor, transparent: true, opacity: 0.055,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));

  const lamps = level.lamps.map(([x, y, z, flicker]) => {
    const light = new THREE.PointLight(level.lampColor, flicker ? 52 : 44, 34, 2);
    light.position.set(x, y, z);
    scene.add(light);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.copy(light.position);
    scene.add(bulb);

    // Cheap volumetric: an additive cone of haze hanging under the lamp.
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(x, y - 2.1, z);
    scene.add(halo);

    return { light, halo, base: light.intensity, flicker: !!flicker };
  });

  // --- spawns --------------------------------------------------------------
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
      // Two detuned sines, gated hard — deterministic stutter, no RNG per frame.
      const n = Math.sin(t * 37.3) * Math.sin(t * 11.7);
      const on = n <= 0.55;
      l.light.intensity = on ? l.base : l.base * 0.16;
      l.halo.visible = on;
    }
  }

  function dispose() {
    for (const g of owned.geometries) g.dispose();
    for (const m of owned.materials) m.dispose();   // shared textures survive
    scene.clear();
  }

  // The level never moves, so resolve its matrices once. Bullets can then be
  // traced against it before the first frame is ever drawn.
  scene.updateMatrixWorld(true);

  return { scene, colliders, solids, spawnPoints, update, dispose, half: HALF };
}
