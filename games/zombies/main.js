// Nightshift — round-based first-person zombie survival.
//
// Simulation runs on a fixed 60 Hz step with an accumulator; rendering
// interpolates between the last two steps. That split is why the game stays
// smooth on a 144 Hz monitor and honest on a 30 fps laptop: physics never
// changes behaviour because the frame rate did.

import * as THREE from 'three';
import { Input } from './src/input.js';
import { buildWorld } from './src/world.js';
import { Player } from './src/player.js';
import { Weapon } from './src/weapon.js';
import { Horde } from './src/zombies.js';
import { Rounds } from './src/rounds.js';
import { Hud } from './src/hud.js';
import { Sfx } from './src/audio.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.getElementById('view');
const overlay = document.getElementById('overlay');
const panels = {
  start: document.getElementById('panel-start'),
  pause: document.getElementById('panel-pause'),
  dead:  document.getElementById('panel-dead'),
  touch: document.getElementById('panel-touch'),
};

// --- no mouse, no game -----------------------------------------------------
if (!matchMedia('(pointer: fine)').matches) {
  panels.start.hidden = true;
  panels.touch.hidden = false;
} else {
  boot();
}

function boot() {

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;   // we draw the world, clear depth, then the gun
renderer.setClearColor(0x0a0c10, 1);

const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 220);

const world = buildWorld();
const hud = new Hud();
const sfx = new Sfx();
const input = new Input(canvas);
const player = new Player(camera);

const horde = new Horde(world.scene, {
  onPlayerHit: (dmg) => {
    if (player.dead) return;
    const died = player.damage(dmg);
    hud.hurt();
    sfx.hurt();
    if (died) die();
  },
  onKill: (_z, headshot) => {
    rounds.kills++;
    sfx.kill();
    if (headshot) hud.say('headshot', 0.9);
  },
});

const weapon = new Weapon({
  onShot: () => sfx.shot(),
  onDryFire: () => sfx.dryFire(),
  onReload: () => sfx.reload(),
  onHit: (headshot) => { hud.hitMark(); headshot ? sfx.headshot() : sfx.hit(); },
});
weapon.attachTo(world.scene);

const rounds = new Rounds(horde, world, {
  onRoundStart: (n) => {
    hud.setRound(n);
    hud.say(`round ${n}`);
    weapon.onRoundStart();
    sfx.roundStart();
  },
  onRoundEnd: (n) => { if (n > 0) hud.say(`round ${n} cleared`, 2.6); },
});

// --- state -----------------------------------------------------------------

let state = 'menu';          // menu | playing | paused | dead
let deathTimer = 0;
let alpha = 0;

// Reused so the shot path doesn't allocate.
const shootTargets = [];

function setPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  overlay.hidden = name === null;
}

function play() {
  sfx.start();
  if (state === 'dead' || state === 'menu') newGame();
  state = 'playing';
  setPanel(null);
  hud.show(true);
  input.lock();
}

function newGame() {
  player.reset();
  weapon.reset();
  horde.clear();
  rounds.reset();
  hud.reset();
  hud.setRound(0);
  deathTimer = 0;
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.unlock();
  setPanel('pause');
}

function die() {
  if (state === 'dead') return;
  state = 'dead';
  deathTimer = 1.7;
  sfx.death();
  input.unlock();
  hud.say('');
}

input.onLockChange = (locked) => {
  if (!locked && state === 'playing') pause();
};

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

document.getElementById('btn-start').addEventListener('click', play);
document.getElementById('btn-resume').addEventListener('click', play);
document.getElementById('btn-again').addEventListener('click', play);

// --- simulation ------------------------------------------------------------

function simulate(dt, wantFire) {
  world.update(dt);

  player.step(dt, input, world.colliders);

  // The horde keeps moving through the death cam — freezing it mid-stride
  // reads as a crash. Only the round (and the damage) stops.
  horde.step(dt, player.pos, world.colliders);
  if (!player.dead) rounds.step(dt, player.pos, world.colliders);

  // Only on the step where a shot actually goes out: bring the camera and the
  // horde's world matrices up to date, then rebuild the raycast set. Without
  // the sync we'd be shooting at last frame's positions.
  if (wantFire && !player.dead) {
    player.render(1);
    camera.updateMatrixWorld();
    horde.syncForRaycast();

    shootTargets.length = 0;
    const parts = horde.targets();
    for (let i = 0; i < parts.length; i++) shootTargets.push(parts[i]);
    for (let i = 0; i < world.solids.length; i++) shootTargets.push(world.solids[i]);
  }

  weapon.step(dt, {
    wantFire: wantFire && !player.dead,
    camera,
    targets: shootTargets,
    horde,
    speed: Math.hypot(player.vel.x, player.vel.z),
  });
}

// --- frame -----------------------------------------------------------------

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);

  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;   // don't fast-forward after a tab switch
  if (dt < 0) dt = 0;

  if (state === 'playing' || state === 'dead') {
    if (state === 'playing') {
      const look = input.takeLook();
      player.look(look.yaw, look.pitch);
      if (input.down('KeyR')) weapon.startReload();
    }

    const wantFire = state === 'playing' && (input.takeFire() || input.fireHeld);

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      simulate(STEP, wantFire && steps === 0);
      acc -= STEP;
      steps++;
    }
    if (acc >= STEP) acc = 0;   // we fell too far behind; drop the debt
    alpha = acc / STEP;

    hud.setHealth(player.health, player.maxHealth);
    hud.setAmmo(weapon.mag, weapon.reserve, weapon.reloading > 0);
    hud.tick(dt);

    if (state === 'dead') {
      deathTimer -= dt;
      if (deathTimer <= 0 && overlay.hidden) {
        document.getElementById('dead-stats').textContent =
          `You reached round ${rounds.number} and put down ${rounds.kills} of them.`;
        hud.show(false);
        setPanel('dead');
      }
    }
  }

  render();
}

function render() {
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  player.extraPitch = weapon.viewPunch;
  player.render(alpha);
  horde.render(alpha);
  weapon.render(alpha, player, camera.aspect);

  renderer.clear();
  renderer.render(world.scene, camera);
  renderer.clearDepth();
  renderer.render(weapon.scene, weapon.camera);
}

hud.show(false);
setPanel('start');
requestAnimationFrame(frame);

}
