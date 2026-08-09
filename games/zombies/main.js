// Nightshift — a six-level first-person zombie survival campaign.
//
// Simulation runs on a fixed 60 Hz step with an accumulator; rendering
// interpolates between the last two steps. That split is why the game stays
// smooth on a 144 Hz monitor and honest on a 30 fps laptop: physics never
// changes behaviour because the frame rate did.

import * as THREE from 'three';
import { Input } from './src/input.js';
import { buildWorld } from './src/world.js';
import { LEVELS } from './src/levels.js';
import { Player } from './src/player.js';
import { Weapon } from './src/weapon.js';
import { Horde } from './src/zombies.js';
import { Campaign } from './src/campaign.js';
import { DIFFICULTIES, UPGRADES, draft } from './src/upgrades.js';
import { Hud } from './src/hud.js';
import { Sfx } from './src/audio.js';
import { Fx } from './src/fx.js';
import * as progress from './src/progress.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.getElementById('view');
const overlay = document.getElementById('overlay');
const panels = {
  start: document.getElementById('panel-start'),
  brief: document.getElementById('panel-brief'),
  draft: document.getElementById('panel-draft'),
  pause: document.getElementById('panel-pause'),
  dead: document.getElementById('panel-dead'),
  won: document.getElementById('panel-won'),
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
renderer.autoClear = false;   // draw the world, clear depth, then the gun
renderer.setClearColor(0x0a0c10, 1);

const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 220);

const hud = new Hud();
const sfx = new Sfx();
const input = new Input(canvas);
const fx = new Fx();

const campaign = new Campaign({
  onWaveStart: (n, total, wave) => {
    hud.setWave(n, total);
    hud.say(`wave ${n} of ${total}`, 1.8);
    weapon.grantWaveAmmo(wave.n, campaign.difficulty.ammo);
    sfx.roundStart();
  },
  onWaveCleared: () => {},
  onLevelCleared: () => openDraft(),
  onCampaignWon: () => win(),
});

const player = new Player(camera, campaign.stats);

const horde = new Horde({
  onPlayerHit: (dmg) => {
    if (player.dead) return;
    const died = player.damage(dmg);
    hud.hurt();
    sfx.hurt();
    if (died) die();
  },
  onKill: (z, headshot) => {
    campaign.kills++;
    campaign.levelKills++;
    sfx.kill();
    if (headshot) hud.say('headshot', 0.9);
  },
});

const weapon = new Weapon({
  onShot: () => { campaign.shotsFired++; sfx.shot(); },
  onDryFire: () => sfx.dryFire(),
  onReload: () => sfx.reload(),
  onHit: (headshot, point, dir) => {
    campaign.shotsHit++;
    hud.hitMark();
    fx.burst(point, dir, 'blood');
    headshot ? sfx.headshot() : sfx.hit();
  },
  onImpact: (point, dir) => fx.burst(point, dir, 'spark'),
}, campaign.stats);

// --- state -----------------------------------------------------------------

let world = null;
let state = 'menu';          // menu | brief | playing | paused | dead | draft | won
let chosenDifficulty = 'standard';
let deathTimer = 0;
let alpha = 0;
const shootTargets = [];

function setPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  overlay.hidden = name === null;
}

/** Tear down the previous arena and build the next one. */
function loadLevel(index) {
  if (world) world.dispose();
  const level = LEVELS[index];
  world = buildWorld(level);

  // three re-parents on add, so these follow the player between levels.
  horde.attachTo(world.scene);
  weapon.attachTo(world.scene);
  fx.attachTo(world.scene);

  player.setSpawn(level.spawn[0], level.spawn[1]);
  resetLevelState();
}

function resetLevelState() {
  horde.clear();
  fx.clear();
  player.reset();
  weapon.reset();
  weapon.loadForLevel(campaign.difficulty.ammo);
  hud.reset();
  hud.setLevel(campaign.level.name, campaign.levelIndex, LEVELS.length);
  hud.setPerks(campaign.taken.map((id) => UPGRADES.find((u) => u.id === id)).filter(Boolean));
  hud.setWave(0, campaign.waveCount);
  deathTimer = 0;
}

// --- flow ------------------------------------------------------------------

function showBrief() {
  state = 'brief';
  const l = campaign.level;
  document.getElementById('brief-index').textContent =
    `Level ${campaign.levelIndex + 1} of ${LEVELS.length}`;
  document.getElementById('brief-name').textContent = l.name;
  document.getElementById('brief-blurb').textContent = l.blurb;
  const total = l.waves.reduce((s, w) => s + w.n, 0);
  document.getElementById('brief-detail').textContent =
    `${l.waves.length} waves · ${total} of them · ${campaign.difficulty.name}`;
  hud.show(false);
  setPanel('brief');
}

function startLevel() {
  sfx.start();
  campaign.startLevel();
  progress.save(campaign);
  state = 'playing';
  setPanel(null);
  hud.show(true);
  input.lock();
}

function restartLevel() {
  resetLevelState();
  startLevel();
}

function newRun(difficultyId) {
  sfx.start();
  campaign.begin(difficultyId);
  player.useStats(campaign.stats);
  weapon.useStats(campaign.stats);
  loadLevel(0);
  showBrief();
}

function resumeRun(saved) {
  sfx.start();
  campaign.begin(saved.difficulty, saved.levelIndex, saved.taken);
  campaign.kills = saved.kills || 0;
  campaign.elapsed = saved.elapsed || 0;
  player.useStats(campaign.stats);
  weapon.useStats(campaign.stats);
  loadLevel(campaign.levelIndex);
  showBrief();
}

function openDraft() {
  state = 'draft';
  input.unlock();
  hud.show(false);

  const cards = document.getElementById('draft-cards');
  cards.textContent = '';
  for (const u of draft(campaign.taken, 3)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    const stacked = campaign.taken.includes(u.id);
    b.innerHTML = `<em>${stacked ? 'stacks' : 'upgrade'}</em><b></b><span></span>`;
    b.querySelector('b').textContent = u.name;
    b.querySelector('span').textContent = u.desc;
    b.addEventListener('click', () => takeUpgrade(u.id));
    cards.appendChild(b);
  }
  setPanel('draft');
  cards.querySelector('button')?.focus();
}

function takeUpgrade(id) {
  campaign.takeUpgrade(id);
  player.useStats(campaign.stats);
  weapon.useStats(campaign.stats);
  campaign.advance();
  loadLevel(campaign.levelIndex);
  progress.save(campaign);
  showBrief();
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

function win() {
  state = 'won';
  input.unlock();
  hud.show(false);
  const mins = Math.floor(campaign.elapsed / 60);
  const secs = Math.round(campaign.elapsed % 60);
  document.getElementById('won-stats').textContent =
    `${campaign.difficulty.name} · ${mins}m ${secs}s · ${campaign.kills} killed · `
    + `${Math.round(campaign.accuracy * 100)}% accuracy`;

  const best = progress.recordWin(
    campaign.difficulty.id, campaign.elapsed, campaign.kills, campaign.accuracy);
  document.getElementById('won-best').textContent = best ? 'new best time' : '';
  progress.clear();
  setPanel('won');
}

// --- menu wiring -----------------------------------------------------------

const diffBox = document.getElementById('difficulty-options');
for (const d of DIFFICULTIES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'diff';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(d.id === chosenDifficulty));
  b.innerHTML = '<b></b><span></span>';
  b.querySelector('b').textContent = d.name;
  b.querySelector('span').textContent = d.blurb;
  b.addEventListener('click', () => {
    chosenDifficulty = d.id;
    for (const el of diffBox.children) {
      el.setAttribute('aria-checked', String(el === b));
    }
  });
  diffBox.appendChild(b);
}

const saved = progress.load();
if (saved && saved.levelIndex > 0) {
  const l = LEVELS[saved.levelIndex];
  if (l) {
    document.getElementById('resume-row').hidden = false;
    document.getElementById('resume-note').textContent =
      `level ${saved.levelIndex + 1} — ${l.name} · ${saved.taken.length} upgrades`;
    document.getElementById('btn-resume-run')
      .addEventListener('click', () => resumeRun(saved));
  }
}

document.getElementById('btn-start').addEventListener('click', () => newRun(chosenDifficulty));
document.getElementById('btn-brief').addEventListener('click', startLevel);
document.getElementById('btn-resume').addEventListener('click', () => {
  state = 'playing'; setPanel(null); hud.show(true); input.lock();
});
document.getElementById('btn-again').addEventListener('click', restartLevel);
document.getElementById('btn-newrun').addEventListener('click', () => {
  progress.clear();
  location.reload();
});

input.onLockChange = (locked) => { if (!locked && state === 'playing') pause(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// --- simulation ------------------------------------------------------------

function simulate(dt, wantFire) {
  world.update(dt);
  player.step(dt, input, world.colliders);

  // The horde keeps moving through the death cam — freezing it mid-stride
  // reads as a crash. Only the campaign (and the damage) stops.
  horde.step(dt, player.pos, world.colliders);
  if (!player.dead) {
    campaign.step(dt, horde, world, player.pos, world.colliders);
  }
  fx.step(dt);

  // Only on the step where a shot goes out: bring the camera and the horde's
  // world matrices up to date, then rebuild the raycast set. Without the sync
  // we'd be shooting at last frame's positions.
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

  if (world && (state === 'playing' || state === 'dead')) {
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
    if (acc >= STEP) acc = 0;   // fell too far behind; drop the debt
    alpha = acc / STEP;

    hud.setHealth(player.health, player.maxHealth);
    hud.setAmmo(weapon.mag, weapon.reserve, weapon.reloading > 0);
    hud.setRemaining(campaign.toSpawn + horde.aliveCount);
    hud.tick(dt);

    if (state === 'dead') {
      deathTimer -= dt;
      if (deathTimer <= 0 && overlay.hidden) {
        document.getElementById('dead-stats').textContent =
          `${campaign.level.name}, wave ${campaign.waveIndex + 1} of ${campaign.waveCount}.`
          + ` ${campaign.levelKills} down on this level.`;
        hud.show(false);
        setPanel('dead');
      }
    }
  }

  if (world) render();
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
