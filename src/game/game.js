// The game shell: owns the zone, the actors, the camera and the flow between
// playing, paused, resting and dead.

import * as THREE from 'three';
import { Zone } from '../world/zone.js';
import { ZONES, DEFAULT_ZONE } from '../data/zones.js';
import { Player, PS, DEFAULT_WEAPON } from '../actors/player.js';
import { ThirdPersonCamera } from './camera.js';
import { LockOn } from './lockon.js';
import { Enemy } from '../actors/enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { FX } from '../render/fx.js';
import { resolveHit } from '../combat/damage.js';
import { makeRng } from '../core/rng.js';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { clamp } from '../core/math.js';

const _up = new THREE.Vector3(0, 1, 0);

export const MODE = {
  LOADING: 'loading', TITLE: 'title', PLAYING: 'playing',
  PAUSED: 'paused', RESTING: 'resting', DEAD: 'dead', DIALOGUE: 'dialogue',
};

export class Game {
  static async create(engine) {
    const g = new Game(engine);
    await g.init();
    return g;
  }

  constructor(engine) {
    this.engine = engine;
    this.scene = engine.renderer.scene;
    this.renderer = engine.renderer;
    this.input = engine.input;
    this.params = new URLSearchParams(location.search);

    this.mode = MODE.LOADING;
    this.actors = [];
    this.enemies = [];
    this.time = 0;
    this._interactCandidates = [];
    this._tmp = new THREE.Vector3();
    this._sideCache = null;
  }

  async init() {
    const zoneId = this.params.get('zone') ?? DEFAULT_ZONE;
    const def = ZONES[zoneId] ?? ZONES[DEFAULT_ZONE];

    this.zone = new Zone(def, this.scene);
    this.world = { terrain: this.zone.terrain, collision: this.zone.collision, zone: this.zone };
    this.renderer.setMood(def.mood, 1);

    this.camera = new ThirdPersonCamera(this.renderer.camera, this.zone.collision);
    this.camera.setBaseFov(settings.get('fov'));

    this.player = new Player({
      world: this.world,
      scale: 1,
      stats: { level: 1, vigour: 12, endurance: 12, strength: 12, finesse: 11, resolve: 10, attunement: 9 },
      look: {
        helm: 'greathelm', pauldrons: 'plate', cape: true,
        palette: {
          cloth: 0x2f2b33, cloth2: 0x6d2b26, leather: 0x40332a,
          metal: 0x77787f, metalDark: 0x3c3d45, accent: 0xffa04c, eye: 0xffb45c,
        },
      },
    });
    this.player.refreshDerived({ keepRatios: false });
    this.player.equip('longsword', DEFAULT_WEAPON);
    this.player.equipOffhand('shield', { weight: 5, stability: 0.62 });
    this.player.addTo(this.scene);
    this.scene.add(this.player.trail.mesh);
    this.addActor(this.player);

    const start = this.zone.startPoint;
    this.player.setPosition(start.x, start.y, start.z);
    this.player.yaw = this.player.targetYaw = Math.PI;
    this.camera.yaw = Math.PI;
    this.camera.snapTo(this.player);

    this.lockOn = new LockOn(this.player, this.camera);
    this.fx = new FX(this.scene, this.renderer.camera);
    this.world.game = this;
    this.zone.game = this;

    this.spawnRng = makeRng((def.seed ?? 1) * 7919);
    this.spawnEnemies();

    this._wireEvents();
    this.mode = MODE.TITLE;
  }

  /** True when the smoke test or a debug link asked to skip the title card. */
  get wantsAutostart() { return this.params.has('autostart'); }

  /** Populate the zone from its spawn table. Called again on every rest. */
  spawnEnemies() {
    for (const e of [...this.enemies]) this.removeActor(e);
    this.enemies.length = 0;

    for (const spawn of this.zone.spawns) {
      const archetype = ENEMIES[spawn.kind];
      if (!archetype) { console.warn(`[game] unknown enemy "${spawn.kind}"`); continue; }
      const count = spawn.count ?? 1;
      for (let i = 0; i < count; i++) {
        // Spread a group around its spawn point rather than stacking it.
        const a = (i / count) * Math.PI * 2 + this.spawnRng() * 1.4;
        const r = count > 1 ? 1.2 + this.spawnRng() * 2.0 : 0;
        const x = spawn.position.x + Math.cos(a) * r;
        const z = spawn.position.z + Math.sin(a) * r;
        const y = this.zone.terrain.heightAt(x, z);
        const enemy = new Enemy({
          archetype, world: this.world,
          tier: spawn.tier ?? 1, elite: !!spawn.elite,
          rngSeed: (this.spawnRng() * 1e9) | 0,
        });
        enemy.setHome(x, y, z, this.spawnRng() * Math.PI * 2);
        enemy.addTo(this.scene);
        this.addActor(enemy);
      }
    }
    bus.emit('game:enemiesSpawned', { count: this.enemies.length });
  }

  addActor(a) {
    this.actors.push(a);
    if (a.faction === 'hostile') this.enemies.push(a);
    return a;
  }

  removeActor(a) {
    let i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
    i = this.enemies.indexOf(a);
    if (i >= 0) this.enemies.splice(i, 1);
    a.removeFrom(this.scene);
  }

  _wireEvents() {
    bus.on('settings:changed', ({ key }) => {
      if (key === 'fov' || key === '*') this.camera.setBaseFov(settings.get('fov'));
    });
    bus.on('player:damaged', ({ report }) => {
      this.engine.post.damageFlash(clamp(report.damage / Math.max(1, this.player.maxHealth) * 2.6, 0.15, 0.9));
      this.camera.addShake(clamp(report.damage / Math.max(1, this.player.maxHealth) * 2.2, 0.12, 0.7));
      this.engine.loop.hitStop(0.05, 0.1);
    });
    bus.on('combat:hit', ({ attacker, report }) => {
      if (attacker !== this.player) return;
      // Hit-stop scaled by how big the blow was — the whole reason the loop
      // exposes it. Blocked hits get a shorter, sharper stop.
      const heavy = report.damage > this.player.attackRating * 0.9;
      this.engine.loop.hitStop(report.blocked ? 0.045 : heavy ? 0.10 : 0.07, 0.06);
      this.camera.addShake(report.blocked ? 0.14 : heavy ? 0.36 : 0.2);
    });
    bus.on('player:landed', ({ hard, impactSpeed }) => {
      this.camera.addShake(clamp(impactSpeed / 40, 0.05, 0.5) * (hard ? 1.6 : 1));
      this.fx.dustPuff(this.player.position, { count: hard ? 16 : 8, power: hard ? 1.6 : 1 });
    });
    bus.on('sfx:footstep', ({ actor, speed }) => {
      if (speed > 2.4) this.fx.dustPuff(actor.position, { count: 3, power: 0.6 });
    });
    bus.on('combat:hit', ({ defender, report }) => {
      const point = report.point ?? defender.position;
      const dir = report.direction ?? _up;
      if (report.blocked) this.fx.blockSpark(point, dir);
      else {
        const colour = report.relation === 'advantage' || report.relation === 'mutual'
          ? 0xffd06a : report.relation === 'disadvantage' ? 0x9aa3b0 : 0xffb27a;
        this.fx.hitSpark(point, dir, {
          colour, count: report.attack?.critical ? 34 : 16,
          power: report.attack?.critical ? 1.8 : 1,
        });
      }
    });
    bus.on('enemy:died', ({ enemy, cinders }) => {
      this.fx.deathBurst(
        new THREE.Vector3(enemy.position.x, enemy.position.y + enemy.height * 0.5, enemy.position.z),
        enemy.archetype.look?.palette?.accent ?? 0xffa04c,
      );
      this.player.cinders += cinders;
      bus.emit('ui:toast', { text: `+${cinders} cinders`, kind: 'gold', duration: 2 });
    });
    bus.on('enemy:windup', ({ enemy, attack }) => {
      if (attack.projectile) this._queueProjectile(enemy, attack);
    });
  }

  _queueProjectile(enemy, attack) {
    enemy._pendingProjectile = attack;
  }

  // --- flow -----------------------------------------------------------------

  start() {
    if (this.mode === MODE.PLAYING) return;
    this.mode = MODE.PLAYING;
    this.input.enabled = true;
    this.input.requestPointerLock(this.engine.canvas);
    document.body.classList.add('playing');
    bus.emit('game:started');
  }

  pause() {
    if (this.mode !== MODE.PLAYING) return;
    this.mode = MODE.PAUSED;
    this.engine.loop.paused = true;
    this.input.exitPointerLock();
    document.body.classList.remove('playing');
    bus.emit('game:paused');
  }

  resume() {
    if (this.mode !== MODE.PAUSED) return;
    this.mode = MODE.PLAYING;
    this.engine.loop.paused = false;
    this.input.clearAllBuffers();
    this.input.requestPointerLock(this.engine.canvas);
    document.body.classList.add('playing');
    bus.emit('game:resumed');
  }

  // --- ticks ----------------------------------------------------------------

  fixedUpdate(dt) {
    this.time += dt;
    if (this.mode !== MODE.PLAYING) return;

    this.lockOn.update(dt, this.enemies);
    if (this.input.consume('lockOn', 0.2)) this.lockOn.toggle(this.enemies);
    if (this.input.consume('swapTarget', 0.2)) this.lockOn.cycle(this.enemies, 1);
    this.player.handleInput(this.input, this.camera, dt);
    this._updateInteractables();

    for (const a of this.actors) {
      if (a === this.player) { a.fixedUpdate(dt); continue; }
      a.think?.(dt, this.player);
      a.fixedUpdate(dt);
    }

    for (const e of this.enemies) {
      if (e._pendingProjectile && e.character.base.progress > 0.5) {
        this._fireProjectile(e, e._pendingProjectile);
        e._pendingProjectile = null;
      }
    }

    this.fx.updateProjectiles(dt, this.actors, this.zone.collision, (hitActor, p) => {
      if (!hitActor) return;
      resolveHit(hitActor, {
        ...p.spec, source: p.owner,
        point: p.mesh.position.clone(),
        direction: p.velocity.clone().setY(0).normalize(),
      });
    });

    // Ambient embers, thickest near the player so the budget goes where it shows.
    if (this.spawnRng() < 0.55) this.fx.ambientEmber(this.player.position, 26, 1);
  }

  _playerSide() {
    return this._sideCache ??= [this.player];
  }

  _resolveHits() {
    if (this.mode !== MODE.PLAYING) return;
    const results = this.player.hitbox.test(this.enemies);
    if (results) for (const { target } of results) this.lockOn.notifyHit(target);
    for (const e of this.enemies) {
      if (e.hitbox.active) e.hitbox.test(this._playerSide());
    }
  }

  _fireProjectile(enemy, attack) {
    const target = enemy.target ?? this.player;
    const hand = enemy.character.skeleton.get('handL');
    hand.updateWorldMatrix(true, false);
    const from = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const to = new THREE.Vector3(
      target.position.x, target.position.y + target.height * 0.55, target.position.z,
    );
    this.fx.spawnProjectile({
      from, to, owner: enemy,
      speed: attack.speed ?? 15,
      radius: attack.projectileRadius ?? 0.26,
      colour: attack.affinity === 'tide' ? 0x7fe0ff
        : attack.affinity === 'radiance' ? 0xffe58a : 0xffa04c,
      spec: {
        damage: attack.damage, poiseDamage: attack.poiseDamage,
        affinity: attack.affinity ?? enemy.affinity,
        status: attack.status, statusAmount: attack.statusAmount,
        unblockable: !!attack.unblockable,
      },
    });
  }

  _updateInteractables() {
    let best = null, bestD = 3.2;
    for (const shrine of this.zone.shrines) {
      const d = shrine.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = { type: 'shrine', shrine, position: shrine.position }; }
    }
    if (best !== this.player.interactTarget) {
      this.player.interactTarget = best;
      bus.emit('player:interactTarget', { target: best });
    }
  }

  update(realDt, alpha, dt) {
    if (this.mode === MODE.PLAYING) {
      this.camera.look(this.input.look.x, this.input.look.y);
      if (this.player.state === PS.SPRINT) this.camera.setFovBoost(7);
    }

    for (const a of this.actors) a.update(dt);

    // Hit testing runs here, not in fixedUpdate, because the poses hitboxes are
    // read from only change at render rate. Testing more often than the blade
    // moves finds nothing; testing less often misses.
    this._resolveHits();

    this.fx.update(realDt);
    this.camera.update(realDt, this.player);

    this._tmp.set(-Math.sin(this.camera.yaw), 0, -Math.cos(this.camera.yaw));
    this.renderer.updateShadows(this.player.position, this._tmp);

    // Shrine flames flicker at render rate so they read as fire, not a lamp.
    for (const s of this.zone.shrines) {
      const f = s.built.flame;
      if (!f?.visible) continue;
      const t = this.time * 9 + s.position.x;
      const k = 0.86 + Math.sin(t) * 0.08 + Math.sin(t * 2.7 + 1.3) * 0.06;
      f.scale.set(k, 0.9 + (k - 0.86) * 2.4, k);
      s.built.light.intensity = 8 + Math.sin(t * 1.7) * 1.6 + Math.sin(t * 4.3) * 0.9;
    }
  }

  debugStats() {
    return {
      mode: this.mode,
      zone: this.zone.id,
      actors: this.actors.length,
      enemies: this.enemies.filter((e) => e.alive).length,
      aggro: this.enemies.filter((e) => e.aggro && e.alive).length,
      props: this.zone.props.length,
      colliders: this.zone.collision.colliders.length,
      foliage: this.zone.foliage?.instanceCount ?? 0,
      player: {
        state: this.player.state,
        pos: this.player.position.toArray().map((v) => +v.toFixed(1)),
        hp: Math.round(this.player.health),
        stam: Math.round(this.player.stamina),
        grounded: this.player.grounded,
        lock: this.lockOn.target?.name ?? null,
      },
    };
  }
}
