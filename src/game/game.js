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
import { Boss } from '../actors/boss.js';
import { FX } from '../render/fx.js';
import { resolveHit } from '../combat/damage.js';
import { makeRng } from '../core/rng.js';
import { Progression } from './progression.js';
import { Inventory } from './inventory.js';
import { Covenant, TACTICS as TACTICS_TABLE } from './covenant.js';
import { STARTING_KIT } from '../data/items.js';
import { hasSave } from '../core/save.js';
import { summonWisp, makeCompanion } from '../actors/ally.js';
import { COMPANIONS } from '../data/companions.js';
import { Audio } from '../audio/audio.js';
import { Skills } from './skills.js';
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

    this.world = {};
    this._buildZone(def);

    this.camera = new ThirdPersonCamera(this.renderer.camera, this.zone.collision);
    this.camera.water = this.zone.water ?? null;
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
    this.player.game = this;
    this.player.refreshDerived({ keepRatios: false });
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
    this.bossesFelled = new Set();
    this.spawnEnemies();

    this.inventory = new Inventory(this.player);
    this.covenant = new Covenant(this);
    this.progression = new Progression(this);
    this.skills = new Skills(this);

    // Starting kit, then a saved game on top of it if there is one.
    for (const [id, n] of STARTING_KIT.items) this.inventory.add(id, n);
    this.inventory.equip('weapon', STARTING_KIT.weapon);
    this.inventory.equip('offhand', STARTING_KIT.offhand);
    this.inventory.equip('armour', STARTING_KIT.armour);
    this.hasSave = hasSave();
    this.allies = [];
    this.audio = new Audio(this);

    this._wireEvents();
    this.mode = MODE.TITLE;
  }

  /**
   * Stand up a zone and point everything that reads the world at it. Called
   * once at boot and again on every crossing, which is why the world object is
   * mutated in place rather than replaced: actors hold a reference to it.
   */
  _buildZone(def) {
    this.zone = new Zone(def, this.scene);
    this.world.terrain = this.zone.terrain;
    this.world.collision = this.zone.collision;
    this.world.zone = this.zone;
    this.zone.game = this;
    if (this.camera) {
      this.camera.collision = this.zone.collision;
      this.camera.water = this.zone.water ?? null;
    }
    this.renderer.setMood(def.mood, 1);
  }

  /**
   * Cross to another zone.
   *
   * There is no streaming here and no second zone held in memory: the old one
   * is torn down and the new one built in its place, which takes long enough to
   * be worth a fade but is over inside a second. What survives the crossing is
   * everything that belongs to the player rather than to the ground they were
   * standing on — stats, inventory, covenant, cinders and the party.
   *
   * @param {string} zoneId
   * @param {object} [opts]
   * @param {string} [opts.arrive]  id of the waygate to step out of
   */
  travelTo(zoneId, { arrive = null, announce = true, save = true } = {}) {
    const def = ZONES[zoneId];
    if (!def || zoneId === this.zone.id) return false;

    // A bloodstain belongs to the ground it was dropped on. Crossing forfeits
    // it, exactly as a second death does, and the player is told so.
    if (this.progression?.bloodstain) {
      bus.emit('ui:toast', { text: 'What you dropped stays behind.', kind: 'bad', duration: 4 });
      this.progression._clearBloodstain();
    }

    for (const e of [...this.enemies]) this.removeActor(e);
    this.enemies.length = 0;
    this.boss = null;
    for (const a of this.allies) a.removeFrom(this.scene);

    this.zone.dispose();
    this._buildZone(def);

    // Where you step out. A named gate on the far side if there is one, so a
    // round trip puts you back at the door you came in by, not at the start.
    const gate = arrive ? this.zone.gates.find((g) => g.id === arrive || g.spec.id === arrive) : null;
    let spot = this.zone.startPoint;
    let yaw = Math.PI;
    if (gate) {
      // Step out of the arch facing the way the gate faces, and two paces on
      // that side of it — not behind it, looking at the back of the stone.
      yaw = gate.rotY;
      spot = new THREE.Vector3(
        gate.position.x + Math.sin(yaw) * 2.6, 0, gate.position.z + Math.cos(yaw) * 2.6,
      );
      spot.y = this.zone.terrain.heightAt(spot.x, spot.z);
    }
    this.player.respawn(spot, yaw);
    this.player.yaw = this.player.targetYaw = yaw;

    this.spawnRng = makeRng((def.seed ?? 1) * 7919);
    this.spawnEnemies();

    // Shrines this player has already kindled stay kindled, in every zone.
    this.progression?.applyLitShrines();

    for (const a of this.allies) {
      this._placeBeside(a);
      a.world = this.world;
      a.addTo(this.scene);
    }

    this.camera.yaw = yaw + Math.PI;
    this.camera.snapTo(this.player);
    this.lockOn.clear?.();
    // Restoring a save is already the saved state; writing it back mid-restore
    // would persist a half-applied one.
    if (save) this.progression?.save();

    if (announce) bus.emit('ui:announce', { text: def.name, kind: 'area', duration: 3.6 });
    bus.emit('game:zoneChanged', { zone: this.zone });
    return true;
  }

  /** True when the smoke test or a debug link asked to skip the title card. */
  get wantsAutostart() { return this.params.has('autostart'); }

  /**
   * Place an ad-hoc group of enemies at a point. Used by the balance harness
   * to stage one encounter at a time, and by scripted ambushes.
   *
   * @param {Array<[string, number, number]>} spec  [archetype, count, tier]
   */
  spawnEncounter(spec, x, z, { elite = false } = {}) {
    const made = [];
    for (const [kind, count, tier] of spec) {
      const archetype = ENEMIES[kind];
      if (!archetype) { console.warn(`[game] unknown enemy "${kind}"`); continue; }
      for (let i = 0; i < count; i++) {
        const a = (i / Math.max(1, count)) * Math.PI * 2 + this.spawnRng() * 1.2;
        const r = count > 1 ? 1.4 + this.spawnRng() * 1.8 : 0;
        const ex = x + Math.cos(a) * r;
        const ez = z + Math.sin(a) * r;
        const enemy = new Enemy({
          archetype, world: this.world, tier: tier ?? 1, elite,
          rngSeed: (this.spawnRng() * 1e9) | 0,
        });
        enemy.setHome(ex, this.zone.terrain.heightAt(ex, ez), ez, this.spawnRng() * Math.PI * 2);
        enemy.addTo(this.scene);
        this.addActor(enemy);
        made.push(enemy);
      }
    }
    this._sideCache = null;
    return made;
  }

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
    this._spawnBoss();
    bus.emit('game:enemiesSpawned', { count: this.enemies.length });
  }

  _spawnBoss() {
    const def = this.zone.def.boss;
    if (!def) return;
    const archetype = ENEMIES[def.kind];
    if (!archetype) return;
    if (this.bossesFelled?.has(this.zone.id)) return;   // a felled boss stays felled

    const [x, z] = def.at;
    const y = this.zone.terrain.heightAt(x, z);
    const boss = new Boss({ archetype, world: this.world, tier: 1, rngSeed: 0xb055 });
    boss.setHome(x, y, z, Math.PI);
    const a = def.arena ?? { at: def.at, radius: 16 };
    boss.setArena(
      new THREE.Vector3(a.at[0], this.zone.terrain.heightAt(a.at[0], a.at[1]), a.at[1]),
      a.radius,
    );
    boss.addTo(this.scene);
    this.addActor(boss);
    this.boss = boss;
  }

  addActor(a) {
    this.actors.push(a);
    if (a.faction === 'hostile') this.enemies.push(a);
    return a;
  }

  /** Put a companion in the field beside the player. */
  recruit(id) {
    const def = COMPANIONS[id];
    if (!def || this.covenant.companions.some((c) => c.companionId === id)) return null;
    const ally = makeCompanion(this, def);
    this._placeBeside(ally);
    ally.addTo(this.scene);
    this.actors.push(ally);
    this.allies.push(ally);
    this.covenant.companions.push(ally);
    ally.setTactics(TACTICS_TABLE[this.covenant.tactics]);
    bus.emit('ui:toast', { text: `${def.short ?? def.name} joins you.`, kind: 'good', duration: 4 });
    if (def.lines?.greet) bus.emit('ui:speech', { who: def.short ?? def.name, text: def.lines.greet });
    return ally;
  }

  /** Summon (or re-summon) the active Wisp. */
  summonActiveWisp() {
    const bound = this.covenant.active;
    if (this._summoned) {
      this._removeAlly(this._summoned);
      this._summoned = null;
    }
    if (!bound) return null;
    const ally = summonWisp(this, bound);
    this._placeBeside(ally);
    ally.addTo(this.scene);
    this.actors.push(ally);
    this.allies.push(ally);
    ally.setTactics(TACTICS_TABLE[this.covenant.tactics]);
    this._summoned = ally;
    bus.emit('covenant:summoned', { ally, wisp: bound });
    return ally;
  }

  _placeBeside(ally) {
    const p = this.player;
    const side = this.allies.length % 2 === 0 ? 1 : -1;
    const x = p.position.x + Math.cos(p.yaw) * 1.6 * side;
    const z = p.position.z - Math.sin(p.yaw) * 1.6 * side;
    ally.setPosition(x, this.zone.terrain.heightAt(x, z), z);
    ally.yaw = ally.targetYaw = p.yaw;
  }

  _removeAlly(ally) {
    let i = this.actors.indexOf(ally); if (i >= 0) this.actors.splice(i, 1);
    i = this.allies.indexOf(ally); if (i >= 0) this.allies.splice(i, 1);
    i = this.covenant.companions.indexOf(ally); if (i >= 0) this.covenant.companions.splice(i, 1);
    ally.removeFrom(this.scene);
    if (ally.wisp) ally.wisp.actor = null;
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
      if (this.player.submersion > 0.06) this.fx.splash(this.player.position, { power: hard ? 2.0 : 1.2 });
      else this.fx.dustPuff(this.player.position, { count: hard ? 16 : 8, power: hard ? 1.6 : 1 });
    });
    bus.on('sfx:footstep', ({ actor, speed }) => {
      // In water a footfall throws spray instead of dust, and does it at any
      // speed — you cannot creep through a flooded nave.
      if (actor.submersion > 0.06) {
        this.fx.splash(actor.position, { power: 0.35 + Math.min(speed, 5) * 0.14 });
      } else if (speed > 2.4) {
        this.fx.dustPuff(actor.position, { count: 3, power: 0.6 });
      }
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
    bus.on('covenant:active', () => { if (this.mode !== MODE.LOADING) this.summonActiveWisp(); });

    // A Paired Strike rides on the player's own blow: the partners' damage is
    // folded into the hit rather than arriving as a separate one, so it reads
    // as a single, much heavier attack.
    bus.on('combat:hit', ({ defender, attacker, report }) => {
      if (attacker !== this.player || !this._pairedPending) return;
      const bonus = this._pairedPending;
      this._pairedPending = null;
      if (!defender.alive) return;
      resolveHit(defender, {
        source: this.player,
        damage: bonus.damage,
        poiseDamage: bonus.damage * 0.9,
        affinity: bonus.partners[0]?.affinity ?? 'none',
        point: report.point ?? defender.position.clone(),
        direction: report.direction,
      });
      this.engine.loop.hitStop(0.16, 0.02);
      this.camera.addShake(0.7);
      this.fx.deathBurst(
        new THREE.Vector3(defender.position.x, defender.position.y + defender.height * 0.5, defender.position.z),
        0xffd08a,
      );
    });
    bus.on('covenant:bound', () => { this._sideCache = null; });
    bus.on('boss:ended', () => {
      // A boss you have beaten does not come back when you rest. The cinders
      // are paid by the ordinary enemy:died handler; paying again here would
      // double them.
      this.bossesFelled.add(this.zone.id);
      this.progression?.save();
    });
    bus.on('boss:phase', () => this.camera.addShake(0.8));
    bus.on('progression:rested', () => {
      for (const a of this.allies) a.speak?.('rest');
    });

    // A parry has to pay out or it is just a worse dodge: the attacker is
    // opened, and the player gets a window to press E for the riposte.
    bus.on('combat:parried', ({ defender, attacker }) => {
      if (defender !== this.player || !attacker?.alive) return;
      this.engine.loop.hitStop(0.13, 0.03);
      this.camera.addShake(0.3);
      attacker.beCriticallyHit?.(this.player);
      attacker.poiseRecoveryDelay = 2.2;
      this.player.onParrySuccess();
      this._riposteWindow = { target: attacker, time: 2.4 };
      bus.emit('ui:toast', { text: 'Riposte — press E', kind: 'good', duration: 2 });
    });
  }

  _queueProjectile(enemy, attack) {
    enemy._pendingProjectile = attack;
  }

  // --- flow -----------------------------------------------------------------

  /** Begin a run: fresh, or continuing from the save on disk. */
  start({ loadSave = false } = {}) {
    if (loadSave) {
      this.progression.restore();
      const shrine = this.progression.lastShrine;
      if (shrine) {
        const spot = new THREE.Vector3(
          shrine.position.x - Math.sin(shrine.rotY + Math.PI) * 1.6, 0,
          shrine.position.z - Math.cos(shrine.rotY + Math.PI) * 1.6,
        );
        spot.y = this.zone.terrain.heightAt(spot.x, spot.z);
        this.player.respawn(spot, shrine.rotY + Math.PI);
      }
      this.spawnEnemies();
      this.camera.snapTo(this.player);
    }
    this._enterPlay();
  }

  _enterPlay() {
    if (this.mode === MODE.PLAYING) return;
    this.mode = MODE.PLAYING;
    // Browsers only allow an AudioContext to start from a user gesture, and
    // pressing Begin is one.
    this.audio.init();
    this.input.enabled = true;
    this.input.requestPointerLock(this.engine.canvas);
    document.body.classList.add('playing');
    bus.emit('game:started');

    // Mote follows you out of the fen from the first step; Seryn is met later.
    if (!this._recruited) {
      this._recruited = true;
      this.recruit('mote');
      if (this.covenant.active) this.summonActiveWisp();
    }
  }

  /** The full death sequence: fade, hold, then respawn at the last shrine. */
  beginDeathSequence() {
    if (this.mode === MODE.DEAD) return;
    this.mode = MODE.DEAD;
    this.input.releaseAll();
    this.lockOn.clear();
    this._deathFade = 0;
    this._deathTimer = 0;
  }

  _updateDeath(dt) {
    this._deathTimer += dt;
    // Fade in over the first two seconds, hold, then bring the world back.
    if (this._deathTimer < 3.4) {
      this._deathFade = Math.min(1, this._deathTimer / 2.0);
    } else if (this._deathTimer < 3.6) {
      if (!this._respawned) {
        this._respawned = true;
        this.progression.respawn();
      }
    } else {
      this._deathFade = Math.max(0, 1 - (this._deathTimer - 3.6) / 1.2);
      if (this._deathFade <= 0) {
        this._respawned = false;
        this.mode = MODE.PLAYING;
        this.input.clearAllBuffers();
      }
    }
    this.engine.post.setDeathFade(this._deathFade);
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
    this.progression?.update(dt);
    this.covenant?.update(dt);
    this.skills?.update(dt);

    if (this.mode === MODE.DEAD) {
      this._updateDeath(dt);
      for (const a of this.actors) a.fixedUpdate(dt);
      return;
    }
    if (this.mode !== MODE.PLAYING) return;

    this.lockOn.update(dt, this.enemies);

    // Criticals: a riposte on something you just parried, or a backstab on
    // something that has not noticed you. Both go on the interact button,
    // which is free whenever there is nothing else in reach.
    if (this._riposteWindow) {
      this._riposteWindow.time -= dt;
      if (this._riposteWindow.time <= 0 || !this._riposteWindow.target.alive) this._riposteWindow = null;
    }
    // A generous buffer here: the riposte prompt appears mid-animation, and
    // players press the button the moment they see it.
    if (!this.player.interactTarget && this.input.buffered('interact', 0.5)) {
      const candidates = this._riposteWindow ? [this._riposteWindow.target] : this.enemies;
      if (this.player.tryCritical(candidates)) {
        this.input.clearBuffer('interact');
        this._riposteWindow = null;
      }
    }

    if (this.input.consume('lockOn', 0.2)) this.lockOn.toggle(this.enemies);
    if (this.input.consume('swapTarget', 0.2)) this.lockOn.cycle(this.enemies, 1);
    if (this.input.consume('cycleItemL', 0.2)) this.skills.cycle(-1);
    if (this.input.consume('cycleItemR', 0.2)) this.skills.cycle(1);
    if (this.input.consume('command', 0.2)) this._callPairedOrCycle();
    this.player.handleInput(this.input, this.camera, dt);
    this._updateInteractables();

    for (const a of this.actors) {
      if (a === this.player) { a.fixedUpdate(dt); continue; }
      a.think?.(dt, this.player);
      a.fixedUpdate(dt);
    }

    // Enemies should notice an ally standing in front of them, not walk past
    // it to reach the player.
    this._retargetEnemies();

    for (const e of this.enemies) {
      // Released on the clip's own castRelease event, so retiming the cast is
      // an animation change rather than a hunt for the right progress value.
      if (e._pendingProjectile && e._castReleased) {
        this._fireProjectile(e, e._pendingProjectile);
        e._pendingProjectile = null;
        e._castReleased = false;
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

  /** Everyone an enemy attack is allowed to hit. Rebuilt when the party changes. */
  _playerSide() {
    if (!this._sideCache || this._sideCacheSize !== this.allies.length) {
      this._sideCache = [this.player, ...this.allies];
      this._sideCacheSize = this.allies.length;
    }
    return this._sideCache;
  }

  _resolveHits() {
    if (this.mode !== MODE.PLAYING) return;
    const results = this.player.hitbox.test(this.enemies);
    if (results) for (const { target } of results) this.lockOn.notifyHit(target);
    for (const e of this.enemies) {
      if (e.hitbox.active) e.hitbox.test(this._playerSide());
    }
    for (const a of this.allies) {
      if (a.hitbox.active) a.hitbox.test(this.enemies);
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

  /**
   * `C` calls a Paired Strike when one is available, and otherwise steps
   * through standing orders. One button, and the more valuable action wins.
   */
  _callPairedOrCycle() {
    const target = this.lockOn.target ?? null;
    if (target && this.covenant.pairedReady) {
      const called = this.covenant.callPairedStrike(target);
      if (called) {
        this._pairedPending = called;
        bus.emit('ui:toast', { text: 'Strike now — your next blow carries theirs.', kind: 'gold', duration: 3 });
        return;
      }
    }
    this._cycleTactics();
  }

  _cycleTactics() {
    const ids = Object.keys(TACTICS_TABLE);
    const next = ids[(ids.indexOf(this.covenant.tactics) + 1) % ids.length];
    this.covenant.setTactics(next);
    bus.emit('ui:toast', {
      text: `Party: ${TACTICS_TABLE[next].label} — ${TACTICS_TABLE[next].blurb}`,
      kind: 'info', duration: 3,
    });
  }

  _retargetEnemies() {
    for (const e of this.enemies) {
      if (!e.alive || !e.aggro) continue;
      if (e.target?.alive && e.target !== this.player) continue;
      let best = e.target, bestD = best?.alive ? best.position.distanceTo(e.position) : Infinity;
      for (const a of this.allies) {
        if (!a.alive) continue;
        const d = a.position.distanceTo(e.position);
        // Only switch for something meaningfully closer, or the party would
        // pull aggro back and forth every frame.
        if (d < bestD * 0.65) { bestD = d; best = a; }
      }
      if (best) e.target = best;
    }
  }

  _updateInteractables() {
    let best = null, bestD = 3.2;
    for (const shrine of this.zone.shrines) {
      const d = shrine.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = { type: 'shrine', shrine, position: shrine.position }; }
    }
    for (const gate of this.zone.gates) {
      const d = gate.position.distanceTo(this.player.position);
      if (d < bestD) {
        bestD = d;
        best = { type: 'gate', gate, position: gate.position, label: `Cross to ${gate.name}` };
      }
    }
    const stain = this.progression?.bloodstain;
    if (stain) {
      const d = stain.position.distanceTo(this.player.position);
      if (d < bestD) {
        bestD = d;
        best = { type: 'bloodstain', position: stain.position, label: `Recover ${stain.cinders} cinders` };
      }
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
    this.audio.update(realDt, this.player.position);

    // Hit testing runs here, not in fixedUpdate, because the poses hitboxes are
    // read from only change at render rate. Testing more often than the blade
    // moves finds nothing; testing less often misses.
    this._resolveHits();

    this.fx.update(realDt);
    this.zone.water?.update(realDt);
    this.camera.update(realDt, this.player);

    this._tmp.set(-Math.sin(this.camera.yaw), 0, -Math.cos(this.camera.yaw));
    this.renderer.updateShadows(this.player.position, this._tmp);

    // The waygate veil breathes, slowly. It is the one light in a zone that is
    // not fire, and it should not flicker like one.
    for (const g of this.zone.gates) {
      const veil = g.built.veil;
      if (!veil) continue;
      const t = this.time * 1.3 + g.position.z;
      veil.material.opacity = 0.11 + Math.sin(t) * 0.03 + Math.sin(t * 2.3) * 0.015;
      g.built.light.intensity = 5.5 + Math.sin(t * 0.8) * 1.2;
    }

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
      cinders: this.player.cinders,
      level: this.player.stats.level,
      wisps: this.covenant?.wisps.length ?? 0,
      allies: this.allies?.filter((a) => a.alive).length ?? 0,
      bloodstain: !!this.progression?.bloodstain,
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
