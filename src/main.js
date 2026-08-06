// Bootstrap: load the saved world, build it, and run the loop.
//
// Adding a new system should mean adding a file and two lines here — one to
// create it, one to update it. If that ever stops being true, something has
// gone wrong with the layout.

import * as THREE from 'three';

import { loadWorld } from './core/state.js';
import { makeClock } from './core/clock.js';
import { makeTerrain } from './core/noise.js';
import { makeClimate } from './core/climate.js';

import { createPlanet } from './world/planet.js';
import { createOcean } from './world/ocean.js';
import { createSky } from './world/sky.js';
import { createClouds } from './world/clouds.js';
import { createFlora } from './world/flora.js';

import { createWanderers } from './life/wanderers.js';

import { createCameraRig } from './ui/camera.js';
import { createHud } from './ui/hud.js';
import { createChronicle } from './ui/chronicle.js';

function fail(message) {
  const el = document.querySelector('[data-boot="message"]');
  if (el) el.textContent = message;
  document.body.classList.add('is-failed');
}

async function start() {
  const canvas = document.querySelector('#world');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    fail('This world needs WebGL, which this browser does not seem to support.');
    return;
  }

  const { state, chronicle } = await loadWorld();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  renderer.setClearColor(0x05070f, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 800);

  const { radius, subdivisions } = state.planet;
  const terrain = makeTerrain({ seed: state.seed, ...state.planet });
  const climate = makeClimate(state.climate);

  const planet = createPlanet({ radius, subdivisions, terrain, climate });
  const ocean = createOcean({ radius, seaLevel: 0 });
  const sky = createSky({ seed: state.seed, radius, scene });
  const clouds = createClouds({
    seed: state.seed,
    radius,
    terrain,
    count: state.weather.clouds,
  });
  const flora = createFlora({
    seed: state.seed,
    radius,
    terrain,
    climate,
    count: state.life.flora,
  });
  const wanderers = createWanderers({
    seed: state.seed,
    radius,
    terrain,
    count: state.life.wanderers,
  });

  scene.add(planet, ocean.mesh, flora.group, wanderers.group, clouds.group);

  const clock = makeClock(state.cycle);
  const rig = createCameraRig({ camera, domElement: canvas, radius, reducedMotion });

  const hud = createHud({
    state,
    counts: { wanderers: wanderers.count, flora: flora.count },
  });
  createChronicle(chronicle);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    // A page that hasn't been laid out yet reports zero. Sizing the drawing
    // buffer to 0x0 here would leave the world rendering into nothing, with
    // only a later resize event to rescue it — which may never come.
    if (w === 0 || h === 0) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    rig.setViewport(camera.aspect, camera.fov);
  }

  // Watching the canvas rather than the window catches the case where layout
  // arrives after load — a background tab, or an embed that starts collapsed.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(canvas);
  }
  window.addEventListener('resize', resize);
  resize();

  let elapsed = 0;

  /** One tick of the whole world. */
  function step(dt) {
    elapsed += dt;
    clock.advance(dt);
    sky.update(dt, clock);
    ocean.update(dt);
    // After sky.update, so the shadows use this frame's sun direction.
    clouds.update(dt, elapsed, sky.sunDirection);
    flora.update(dt, elapsed);
    wanderers.update(dt, elapsed, sky.sunDirection);
    rig.update(dt);
    hud.update(sky.sunDirection, rig.viewDirection);
  }

  // Put every system into a valid state before the first frame is drawn —
  // otherwise the sun has no direction yet and the world renders unlit.
  step(0);

  // A read-only handle on the world, for poking at from the browser console.
  // Kept deliberately rather than stripped: each daily update is verified by
  // inspecting the live world, and it makes the thing explorable for anyone
  // curious enough to open dev tools.
  window.world = {
    THREE,
    state,
    scene,
    camera,
    renderer,
    terrain,
    clock,
    sky,
    counts: { wanderers: wanderers.count, flora: flora.count },
    step,
    render: () => renderer.render(scene, camera),
  };

  document.body.classList.add('is-ready');

  let last = performance.now();
  let frame = 0;

  function tick(now) {
    frame = requestAnimationFrame(tick);

    // Clamp dt so returning to a backgrounded tab doesn't teleport everything.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    step(dt);
    renderer.render(scene, camera);
  }

  // Don't burn a phone battery rendering a tab nobody is looking at.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  });

  frame = requestAnimationFrame(tick);
}

start().catch((err) => {
  console.error(err);
  fail('Something went wrong while the world was forming.');
});
