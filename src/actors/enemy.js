// Enemies.
//
// One state machine, driven by an archetype's data. The design rule throughout:
// every attack has a wind-up long enough to read, and the enemy commits to it.
// An enemy that can cancel its swing is an enemy you cannot learn.

import * as THREE from 'three';
import { Actor } from './actor.js';
import { equipWeapon } from './weapons.js';
import { MeleeHitbox } from '../combat/hitbox.js';
import { bus } from '../core/events.js';
import { clamp, damp, randRange, shortestAngle } from '../core/math.js';
import { makeRng } from '../core/rng.js';

export const ES = {
  IDLE: 'idle', PATROL: 'patrol', ALERT: 'alert', APPROACH: 'approach',
  STRAFE: 'strafe', RETREAT: 'retreat', WINDUP: 'windup', ATTACK: 'attack',
  RECOVER: 'recover', GUARD: 'guard', HIT: 'hit', STAGGER: 'stagger',
  DEAD: 'dead', RETURN: 'return', TAUNT: 'taunt',
};

export class Enemy extends Actor {
  /**
   * @param {object} opts
   * @param {object} opts.archetype  a definition from data/enemies.js
   */
  constructor({ archetype, world, tier = 1, elite = false, rngSeed = 1, ...rest }) {
    const A = archetype;
    super({
      world,
      look: A.look,
      scale: A.scale ?? 1,
      stats: scaleStats(A.stats, tier, elite),
      affinity: A.affinity ?? 'none',
      faction: 'hostile',
      radius: A.radius ?? 0.34,
      height: A.height ?? 1.78,
      name: elite ? (A.eliteName ?? A.name) : A.name,
      ...rest,
    });

    this.archetype = A;
    this.tier = tier;
    this.elite = elite;
    this.rng = makeRng(rngSeed * 2654435761 + 91);

    this.state = ES.IDLE;
    this.stateTime = 0;
    this.target = null;
    this.aggro = false;
    this.homePosition = new THREE.Vector3();
    this.homeYaw = 0;

    this.sightRange = A.sightRange ?? 18;
    this.sightAngle = A.sightAngle ?? 1.25;
    this.hearingRange = A.hearingRange ?? 9;
    this.leashRange = A.leashRange ?? 34;
    // A thing that lives in the water will follow you to the shore and no
    // further, which is what makes the dry aisles worth fighting for.
    this.aquatic = !!A.aquatic;
    this.preferredRange = A.preferredRange ?? 1.9;
    this.strafeBias = this.rng() < 0.5 ? -1 : 1;

    this.walkSpeed = A.walkSpeed ?? 1.2;
    this.runSpeed = A.runSpeed ?? 3.2;
    this.turnRate = A.turnRate ?? 5.0;

    this.attacks = A.attacks ?? [];
    this.currentAttack = null;
    this.attackCooldown = randRange(this.rng, 0.4, 1.4);
    this.aggression = A.aggression ?? 0.6;

    this.defenceFlat = A.defenceFlat ?? 0;
    this.defencePercent = A.defencePercent ?? 0;
    this.guardAbsorption = A.guardAbsorption ?? 0;
    this.guardStability = A.guardStability ?? 0.4;
    this.canGuard = !!A.canGuard;
    this.parryable = A.parryable !== false;
    this.backstabImmune = !!A.backstabImmune;
    this.armourPoise = A.poise ?? 0;
    this.refreshDerived({ keepRatios: false });
    // Bosses and elites get a flat health multiplier on top of their stat
    // block, because scaling Vigour high enough to matter would distort every
    // other number derived from it.
    if (A.healthScale) {
      this.maxHealth = Math.round(this.maxHealth * A.healthScale);
      this.health = this.maxHealth;
    }

    this.cinderValue = Math.round((A.cinders ?? 40) * (1 + (tier - 1) * 0.7) * (elite ? 3.2 : 1));
    this.bindable = !!A.bindable;
    this.bindThreshold = A.bindThreshold ?? 0.3;
    this.wispId = A.wispId ?? null;

    this.hitbox = new MeleeHitbox(this);
    this.staggered = false;
    this.corpseTimer = 0;

    if (A.weapon) this.weaponObject = equipWeapon(this.character, A.weapon, A.weaponVisual ?? {});
    if (A.offhand) equipWeapon(this.character, A.offhand, A.offhandVisual ?? {});

    this._toTarget = new THREE.Vector3();
    this._strafeDir = new THREE.Vector3();
    this._lastKnown = new THREE.Vector3();
    this.eyeHeight = (A.height ?? 1.78) * 0.86 * this.scale;
    this.lockOnHeight = (A.height ?? 1.78) * 0.62 * this.scale;
  }

  setHome(x, y, z, yaw = 0) {
    this.homePosition.set(x, y, z);
    this.homeYaw = yaw;
    this.setPosition(x, y, z);
    this.yaw = this.targetYaw = yaw;
    return this;
  }

  // --- perception -----------------------------------------------------------

  canSee(target) {
    this._toTarget.subVectors(target.position, this.position);
    const dist = this._toTarget.length();
    if (dist > this.sightRange) return false;
    if (dist < 2.2) return true;                 // touching distance: always
    this._toTarget.divideScalar(dist);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dot = this._toTarget.x * fx + this._toTarget.z * fz;
    if (Math.acos(clamp(dot, -1, 1)) > this.sightAngle) return false;
    // Line of sight against the world, from eye height to eye height.
    const col = this.world?.collision;
    if (col) {
      _eye.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
      _dir.set(target.position.x, target.position.y + target.eyeHeight, target.position.z).sub(_eye);
      const d = _dir.length();
      _dir.divideScalar(d);
      if (col.raycast(_eye, _dir, d - 0.2) < d - 0.3) return false;
    }
    return true;
  }

  provoke(target) {
    if (this.aggro || !this.alive) return;
    this.target = target;
    this.aggro = true;
    this._lastKnown.copy(target.position);
    this.setState(ES.ALERT);
    bus.emit('enemy:aggro', { enemy: this, target });
  }

  // --- state ----------------------------------------------------------------

  setState(next, opts = {}) {
    if (this.state === next && !opts.force) return;
    this.state = next;
    this.stateTime = 0;
    const c = this.character;
    switch (next) {
      case ES.IDLE:
      case ES.PATROL:
      case ES.APPROACH:
      case ES.RETREAT:
      case ES.RETURN:
        c.useLocomotion(false);
        break;
      case ES.STRAFE:
        c.useLocomotion(true);
        break;
      case ES.ALERT:
        c.playFull(this.archetype.alertClip ?? 'idleGuard', { fade: 0.2, loop: true });
        bus.emit('enemy:alerted', { enemy: this });
        break;
      case ES.WINDUP:
      case ES.ATTACK:
        c.playFull(opts.clip, { fade: 0.08, speed: opts.speed ?? 1 });
        break;
      case ES.GUARD:
        this.isGuarding = true;
        c.playFull('guard', { fade: 0.15 });
        break;
      case ES.HIT:
        c.playFull(opts.heavy ? 'hitHeavy' : 'hitLight');
        break;
      case ES.STAGGER:
        this.staggered = true;
        c.playFull('stagger');
        break;
      case ES.DEAD:
        c.playFull('death');
        break;
      default: break;
    }
    if (next !== ES.GUARD) this.isGuarding = false;
  }

  /**
   * Move the AI's state without touching the animation.
   *
   * Animation events must never go through setState: entering a state replays
   * its clip, and replaying the clip that just fired the event restarts it, so
   * the attack loops forever — re-firing hitStart, opening a fresh hitbox and
   * clearing its already-hit set every cycle. One husk could empty a full
   * health bar in nine seconds that way.
   */
  _advanceState(next) {
    this.state = next;
    this.stateTime = 0;
    if (next !== ES.GUARD) this.isGuarding = false;
  }

  get committed() {
    return this.state === ES.WINDUP || this.state === ES.ATTACK || this.state === ES.RECOVER
      || this.state === ES.HIT || this.state === ES.STAGGER || this.state === ES.DEAD;
  }

  // --- brain ----------------------------------------------------------------

  think(dt, player) {
    if (!this.alive) return;
    this.stateTime += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    if (!this.aggro) {
      if (this.canSee(player)) this.provoke(player);
      else { this._idleBehaviour(dt); return; }
    }

    const target = this.target ?? player;
    this.target = target;

    if (!target.alive) { this._disengage(); return; }

    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    // Leash: go home if dragged too far from where we started.
    if (this.homePosition.distanceTo(this.position) > this.leashRange) {
      this._disengage();
      return;
    }

    if (this.canSee(target)) this._lastKnown.copy(target.position);

    switch (this.state) {
      case ES.ALERT:
        this.faceTowards(target.position.x, target.position.z);
        this.requestMove(0, 0, 0);
        if (this.stateTime > (this.archetype.alertTime ?? 0.55)) this.setState(ES.APPROACH);
        break;

      case ES.APPROACH:
        this._approach(dt, target, dist, dx, dz);
        break;

      case ES.STRAFE:
        this._strafe(dt, target, dist, dx, dz);
        break;

      case ES.RETREAT: {
        this.faceTowards(target.position.x, target.position.z);
        this.requestMove(-dx, -dz, this.walkSpeed * 1.2);
        if (this.stateTime > 0.9 || dist > this.preferredRange * 2.4) this.setState(ES.APPROACH);
        break;
      }

      case ES.WINDUP:
        // Tracking during the wind-up, then nothing: this is the window the
        // player rolls in. Elites track a little longer.
        this.requestMove(0, 0, 0);
        if (this.stateTime < (this.currentAttack?.trackTime ?? 0.18)) {
          this.faceTowards(target.position.x, target.position.z);
        }
        // Safety net: not every attack clip carries hitStart/hitEnd. A cast
        // fires castRelease instead, and without this a caster would finish
        // its animation and stand in wind-up forever, having attacked exactly
        // once. Never let leaving a state depend solely on an animation event.
        if (this.character.base.finished) {
          this.hitbox.close();
          this._advanceState(ES.RECOVER);
        }
        break;

      case ES.ATTACK:
        this.requestMove(0, 0, 0);
        if (this.currentAttack?.advance) {
          const p = this.character.base.progress;
          const w = this.currentAttack.advanceWindow ?? [0.25, 0.5];
          if (p >= w[0] && p <= w[1]) {
            this.requestMove(Math.sin(this.yaw), Math.cos(this.yaw), this.currentAttack.advance);
          }
        }
        if (this.character.base.finished) {
          this.hitbox.close();
          this._advanceState(ES.RECOVER);
        }
        break;

      case ES.RECOVER:
        this.requestMove(0, 0, 0);
        if (this.character.base.finished) this._chooseCombatState(dist);
        break;

      case ES.GUARD:
        this.faceTowards(target.position.x, target.position.z);
        this.requestMove(0, 0, 0);
        if (this.stateTime > randRange(this.rng, 0.5, 1.3)) this._chooseCombatState(dist);
        break;

      case ES.HIT:
      case ES.STAGGER:
        this.requestMove(0, 0, 0);
        if (this.character.base.finished) {
          this.staggered = false;
          this._chooseCombatState(dist);
        }
        break;

      case ES.RETURN: {
        const hd = this.homePosition.distanceTo(this.position);
        if (hd < 1.0) {
          this.aggro = false;
          this.target = null;
          this.targetYaw = this.homeYaw;
          this.setState(ES.IDLE);
          // Enemies that lose you recover, which is what makes retreating a
          // real option rather than a way to whittle them down for free.
          this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.5);
        } else {
          this.faceTowards(this.homePosition.x, this.homePosition.z);
          this.requestMove(this.homePosition.x - this.position.x, this.homePosition.z - this.position.z, this.runSpeed * 0.8);
        }
        break;
      }

      default:
        this.setState(ES.APPROACH);
        break;
    }
  }

  _idleBehaviour(dt) {
    this.requestMove(0, 0, 0);
    if (this.state !== ES.IDLE) this.setState(ES.IDLE);
    // A slow idle scan, so a patrolling husk is not a statue.
    const sway = Math.sin(this.stateTime * 0.35 + this.id) * (this.archetype.idleScan ?? 0.5);
    this.targetYaw = this.homeYaw + sway;
    void dt;
  }

  _disengage() {
    this.aggro = false;
    this.setState(ES.RETURN);
  }

  _approach(dt, target, dist, dx, dz) {
    this.faceTowards(target.position.x, target.position.z);

    if (dist <= this.preferredRange && this.attackCooldown <= 0) {
      if (this._tryAttack(dist)) return;
    }
    if (dist <= this.preferredRange * 0.92) {
      this._chooseCombatState(dist);
      return;
    }
    const speed = dist > this.preferredRange * 3 ? this.runSpeed : this.runSpeed * 0.8;
    if (this.aquatic && !this._waterAhead(dx, dz)) {
      // Held at the waterline: still facing you, still ready, but not coming.
      this.requestMove(0, 0, 0);
      this._separate();
      return;
    }
    this.requestMove(dx, dz, speed);

    // Separation: enemies that stack on one tile are unfightable. Push apart
    // from anything else hostile standing too close.
    this._separate();
    void dt;
  }

  /** Would a step in this direction still leave it in water? */
  _waterAhead(dx, dz) {
    const water = this.world?.zone?.water;
    if (!water) return true;
    const len = Math.hypot(dx, dz) || 1;
    const probe = 0.9;
    const x = this.position.x + (dx / len) * probe;
    const z = this.position.z + (dz / len) * probe;
    return water.depthAt(x, z) > 0.12;
  }

  _strafe(dt, target, dist, dx, dz) {
    this.faceTowards(target.position.x, target.position.z);
    this._strafeDir.set(-dz, 0, dx).normalize().multiplyScalar(this.strafeBias);
    // Hold the preferred range while circling.
    const closing = (dist - this.preferredRange) * 0.6;
    this._strafeDir.x += (dx / (dist || 1)) * closing;
    this._strafeDir.z += (dz / (dist || 1)) * closing;
    this.requestMove(this._strafeDir.x, this._strafeDir.z, this.walkSpeed * 1.15);
    this._separate();

    if (this.attackCooldown <= 0 && dist <= this.preferredRange * 1.15) {
      if (this._tryAttack(dist)) return;
    }
    if (this.stateTime > randRange(this.rng, 0.7, 1.8)) {
      this.strafeBias *= this.rng() < 0.35 ? -1 : 1;
      this._chooseCombatState(dist);
    }
    void dt;
  }

  _separate() {
    const others = this.world?.zone?.game?.enemies;
    if (!others) return;
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = (this.radius + o.radius) * 2.1;
      if (d2 > minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      this._desiredMove.x += (dx / d) * 1.6;
      this._desiredMove.z += (dz / d) * 1.6;
    }
  }

  _chooseCombatState(dist) {
    const r = this.rng();
    if (dist > this.preferredRange * 1.6) { this.setState(ES.APPROACH, { force: true }); return; }
    if (this.canGuard && r < 0.16 && this.attackCooldown > 0.3) { this.setState(ES.GUARD, { force: true }); return; }
    if (r < 0.14 + (1 - this.aggression) * 0.3) { this.setState(ES.RETREAT, { force: true }); return; }
    if (r < 0.62) { this.setState(ES.STRAFE, { force: true }); return; }
    this.setState(ES.APPROACH, { force: true });
  }

  _tryAttack(dist) {
    // Pick from the attacks whose range covers the target, weighted.
    const usable = this.attacks.filter((a) => dist >= (a.minRange ?? 0) && dist <= a.range);
    if (!usable.length) return false;
    if (this.rng() > this.aggression) { this.attackCooldown = randRange(this.rng, 0.25, 0.7); return false; }

    let total = 0;
    for (const a of usable) total += a.weight ?? 1;
    let r = this.rng() * total;
    let chosen = usable[0];
    for (const a of usable) { r -= a.weight ?? 1; if (r <= 0) { chosen = a; break; } }

    this.currentAttack = chosen;
    this.setState(ES.WINDUP, { force: true, clip: chosen.clip, speed: chosen.speed ?? 1 });
    bus.emit('enemy:windup', { enemy: this, attack: chosen });
    return true;
  }

  // --- animation events -----------------------------------------------------

  onAnimEvent(e) {
    switch (e.name) {
      case 'hitStart': {
        const a = this.currentAttack;
        if (!a) break;
        const src = this.weaponObject ?? this.character.skeleton.get(a.bone ?? 'handR');
        const ud = this.weaponObject?.userData;
        this.hitbox.open(
          src,
          a.hitFrom ?? ud?.hitFrom ?? [0, 0, 0],
          a.hitTo ?? ud?.hitTo ?? [0, -0.3, 0],
          (a.radius ?? ud?.radius ?? 0.24) * this.scale,
          {
            damage: a.damage ?? 30,
            poiseDamage: a.poiseDamage ?? (a.damage ?? 30) * 0.4,
            staminaDamage: a.staminaDamage ?? (a.damage ?? 30) * 0.8,
            affinity: a.affinity ?? this.affinity,
            status: a.status ?? null,
            statusAmount: a.statusAmount ?? 0,
            unblockable: !!a.unblockable,
          },
        );
        this._advanceState(ES.ATTACK);
        bus.emit('sfx:swoosh', { actor: this, pitch: a.pitch ?? 0.9, big: !!a.heavy });
        break;
      }
      case 'hitEnd':
        this.hitbox.close();
        this._advanceState(ES.RECOVER);
        this.attackCooldown = randRange(this.rng, this.currentAttack?.cooldown ?? 0.5, (this.currentAttack?.cooldown ?? 0.5) + 0.9);
        break;
      case 'castRelease':
        // The moment a spell leaves the hand. The game shell watches for this
        // to spawn the projectile.
        this._castReleased = true;
        break;
      case 'recovered':
        if (this.state === ES.WINDUP || this.state === ES.ATTACK) {
          this.hitbox.close();
          this._advanceState(ES.RECOVER);
        }
        break;
      case 'footstep':
        bus.emit('sfx:footstep', { actor: this, ...e.data, speed: this._speed });
        break;
      default: break;
    }
  }

  // --- reactions ------------------------------------------------------------

  onFlinch(report) {
    if (!this.aggro && report.attack?.source) this.provoke(report.attack.source);
    this.character.flash(0xffffff, 0.07);
    // Hyper armour: some attacks cannot be interrupted, which is how a boss
    // stops being stun-locked.
    if (this.state === ES.ATTACK && this.currentAttack?.hyperArmour) return;
    if (this.state === ES.WINDUP && this.currentAttack?.hyperArmour) return;
    if (report.damage > this.maxHealth * 0.06 || this.rng() < 0.4) {
      this.hitbox.close();
      this.setState(ES.HIT, { force: true, heavy: report.damage > this.maxHealth * 0.16 });
    }
  }

  onBlock() {
    this.character.playUpper('guardImpact', { fade: 0.03 });
    this.character.releaseUpper(0.26);
  }

  onStagger(report) {
    if (!this.aggro && report?.attack?.source) this.provoke(report.attack.source);
    this.hitbox.close();
    this.setState(ES.STAGGER, { force: true });
    this.character.flash(0xffd08a, 0.16);
    bus.emit('enemy:staggered', { enemy: this });
  }

  /** Called when the player starts a riposte or backstab on this enemy. */
  beCriticallyHit() {
    this.hitbox.close();
    this.setState(ES.STAGGER, { force: true });
    this.invulnerable = 0;
  }

  onDeath(report) {
    if (!this.alive) return;
    this.alive = false;
    this.hitbox.close();
    this.setState(ES.DEAD, { force: true });
    this.corpseTimer = 0;
    bus.emit('enemy:died', { enemy: this, report, cinders: this.cinderValue });
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (!this.alive) {
      this.corpseTimer += dt;
      this.requestMove(0, 0, 0);
    }
    this.integrate(dt, { acceleration: 18, deceleration: 16 });
    const turnMult = this.state === ES.WINDUP ? 0.5
      : this.state === ES.ATTACK ? 0.1
        : this.committed ? 0.2 : 1;
    this.turn(dt, turnMult);
  }

  update(dt) {
    super.update(dt);
    this.hitbox.sample();
    if (this.aggro && this.target?.alive) {
      this.character.setLookAt(
        _look.set(this.target.position.x, this.target.position.y + this.target.eyeHeight, this.target.position.z),
        0.5,
      );
    } else {
      this.character.setLookAt(null);
    }
    // Fade out and sink a corpse rather than leaving it standing forever.
    if (!this.alive && this.corpseTimer > 6) {
      const t = clamp((this.corpseTimer - 6) / 3, 0, 1);
      this.object.position.y = this.position.y - t * 1.6;
      if (this.character.blob) this.character.blob.material.opacity = (1 - t) * 0.5;
      if (this.character.capeMesh) this.character.capeMesh.visible = t < 0.9;
    }
  }
}

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();

/** Scale an archetype's base stats by encounter tier and elite status. */
function scaleStats(base, tier, elite) {
  const k = 1 + (tier - 1) * 0.45;
  const e = elite ? 1.6 : 1;
  const out = { level: Math.round((base.level ?? 1) * k) };
  for (const key of ['vigour', 'endurance', 'strength', 'finesse', 'resolve', 'attunement']) {
    out[key] = Math.round((base[key] ?? 8) * k * (elite ? 1.25 : 1));
  }
  out._eliteScale = e;
  return out;
}
