// The base every living thing extends: a capsule that walks on the world, a
// character to render it, a stat block, and the fields resolveHit() expects.

import * as THREE from 'three';
import { Character } from './character.js';
import { StatBlock } from '../combat/stats.js';
import { StatusTracker } from '../combat/status.js';
import { clamp, damp, dampAngle, moveTowardsAngle, shortestAngle } from '../core/math.js';
import { bus } from '../core/events.js';

let nextActorId = 1;

/**
 * The rig's height at scale 1, in metres. Every character is built from the
 * same skeleton, so a body's visible height is always this times its scale.
 * Collision height is derived from it rather than passed in separately —
 * passing both let them drift apart, and a houndling ended up with a 0.7m
 * capsule under a 1.09m model, so swings sailed over its head.
 */
export const RIG_HEIGHT = 1.76;

export class Actor {
  /**
   * @param {object} opts
   * @param {World} opts.world      provides collision and terrain
   * @param {object} opts.look      body appearance
   * @param {number} opts.scale
   * @param {StatBlock|object} opts.stats
   * @param {string} opts.affinity
   */
  constructor({
    world, look = {}, scale = 1, stats = {}, affinity = 'none',
    faction = 'hostile', radius = 0.34, height = null, name = 'Actor',
    blobShadow = true,
  } = {}) {
    this.id = nextActorId++;
    this.name = name;
    this.world = world;
    this.faction = faction;
    this.affinity = affinity;
    this.scale = scale;

    this.stats = stats instanceof StatBlock ? stats : new StatBlock(stats);
    this.status = new StatusTracker(this);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.turnRate = 9.5;             // radians/sec at full speed
    this.radius = radius * scale;
    // `height` is the unscaled body height; omit it and the rig's own is used.
    const bodyHeight = height ?? RIG_HEIGHT;
    this.height = bodyHeight * scale;
    this.eyeHeight = bodyHeight * 0.86 * scale;

    this.grounded = true;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.gravity = -22;
    this.coyote = 0;
    this.fallTime = 0;

    this.maxHealth = this.stats.maxHp;
    this.health = this.maxHealth;
    this.maxStamina = this.stats.maxStamina;
    this.stamina = this.maxStamina;
    this.maxFocus = this.stats.maxFocus;
    this.focus = this.maxFocus;
    this.maxPoise = this.stats.basePoise;
    this.poise = this.maxPoise;
    this.poiseRecoveryDelay = 0;

    this.alive = true;
    this.invulnerable = 0;
    this.parryWindow = 0;
    this.isGuarding = false;
    this.guardBroken = false;
    this.guardAbsorption = 0.0;
    this.guardStability = 0.4;
    this.defenceFlat = 0;
    this.defencePercent = 0;
    this.backstabImmune = false;
    this.parryable = true;

    this.staminaRegen = this.stats.staminaRegen;
    this.staminaRegenMultiplier = 1;
    this.staminaRegenDelay = 0;
    this.moveSpeedMultiplier = 1;

    this.walkSpeed = 1.42;
    this.runSpeed = 3.9;
    this.sprintSpeed = 5.6;

    this.character = new Character({ look, scale, blobShadow });
    this.character.onAnimEvent = (e, layer) => this.onAnimEvent(e, layer);
    this.object = this.character.root;
    this.object.userData.actor = this;

    this.lockOnHeight = height * 0.62 * scale;
    this.lockDistanceBonus = (scale - 1) * 3;

    this._desiredMove = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._lastPosition = new THREE.Vector3();
    this._speed = 0;
    this._leanState = { pitch: 0, roll: 0 };
  }

  addTo(scene) { this.character.addTo(scene); return this; }
  removeFrom(scene) { this.character.removeFrom(scene); }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
    this.object.position.copy(this.position);
    this._lastPosition.copy(this.position);
    this.character.body.cape?._seed?.();
    return this;
  }

  get healthFraction() { return this.maxHealth > 0 ? this.health / this.maxHealth : 0; }
  get staminaFraction() { return this.maxStamina > 0 ? this.stamina / this.maxStamina : 0; }
  get focusFraction() { return this.maxFocus > 0 ? this.focus / this.maxFocus : 0; }
  get speed() { return this._speed; }

  /** Recompute derived values after a level-up or equipment change. */
  refreshDerived({ keepRatios = true } = {}) {
    const hpRatio = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
    const stRatio = this.maxStamina > 0 ? this.stamina / this.maxStamina : 1;
    const fcRatio = this.maxFocus > 0 ? this.focus / this.maxFocus : 1;
    this.maxHealth = this.stats.maxHp;
    this.maxStamina = this.stats.maxStamina;
    this.maxFocus = this.stats.maxFocus;
    this.maxPoise = this.stats.basePoise + (this.armourPoise ?? 0);
    this.staminaRegen = this.stats.staminaRegen;
    if (keepRatios) {
      this.health = Math.round(this.maxHealth * hpRatio);
      this.stamina = this.maxStamina * stRatio;
      this.focus = this.maxFocus * fcRatio;
    } else {
      this.health = this.maxHealth;
      this.stamina = this.maxStamina;
      this.focus = this.maxFocus;
    }
    this.poise = Math.min(this.poise, this.maxPoise);
  }

  /** Does this actor's facing cover the incoming attack? */
  facingAttack(attack) {
    if (!attack.source) return true;
    const dx = attack.source.position.x - this.position.x;
    const dz = attack.source.position.z - this.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const dot = (dx / d) * Math.sin(this.yaw) + (dz / d) * Math.cos(this.yaw);
    return dot > 0.28;   // a ~145 degree frontal arc
  }

  spendStamina(amount) {
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaRegenDelay = Math.max(this.staminaRegenDelay, 0.42);
  }

  canSpend(amount) { return this.stamina >= Math.min(amount, 1); }

  applyStatusBuildup(id, amount) { this.status.add(id, amount); }
  addTimedEffect(name, duration, handlers) { return this.status.addTimed(name, duration, handlers); }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    bus.emit('actor:healed', { actor: this, amount });
  }

  /** Face a world point over time. Set `snap` to turn instantly. */
  faceTowards(x, z, snap = false) {
    this.targetYaw = Math.atan2(x - this.position.x, z - this.position.z);
    if (snap) this.yaw = this.targetYaw;
  }

  // --- movement -------------------------------------------------------------

  /**
   * Ask for horizontal movement this tick. `dir` is a world-space direction and
   * `speed` is metres per second. Subclasses call this from their state machine.
   */
  requestMove(dirX, dirZ, speed) {
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-4 || speed <= 0) { this._desiredMove.set(0, 0, 0); return; }
    this._desiredMove.set((dirX / len) * speed, 0, (dirZ / len) * speed);
  }

  /** Integrate movement, gravity and collision. Called from fixedUpdate. */
  integrate(dt, { acceleration = 26, deceleration = 20, airControl = 0.32 } = {}) {
    const control = this.grounded ? 1 : airControl;
    const want = this._desiredMove;
    const accel = want.lengthSq() > 0 ? acceleration : deceleration;
    this.velocity.x = damp(this.velocity.x, want.x, accel * control * 0.35, dt);
    this.velocity.z = damp(this.velocity.z, want.z, accel * control * 0.35, dt);

    this.velocity.y += this.gravity * dt;
    if (this.velocity.y < -55) this.velocity.y = -55;

    this.position.addScaledVector(this.velocity, dt);

    const col = this.world?.collision;
    if (col) {
      col.resolveCapsule(this.position, this.radius, this.height);
      const ground = col.groundAt(this.position.x, this.position.z, this.position.y);
      const gap = this.position.y - ground.y;
      if (gap <= 0.02 || (this.grounded && gap <= col.stepHeight && this.velocity.y <= 0.1)) {
        this.position.y = ground.y;
        if (this.velocity.y < 0) {
          if (!this.grounded) this.onLand(this.fallTime, -this.velocity.y);
          this.velocity.y = 0;
        }
        this.grounded = true;
        this.groundNormal.copy(ground.normal);
        this.fallTime = 0;
        this.coyote = 0.12;
      } else {
        if (this.grounded) this.coyote = Math.max(0, this.coyote - dt);
        this.grounded = this.coyote > 0 && this.velocity.y <= 0;
        if (!this.grounded) this.fallTime += dt;
      }
    }

    // Sliding off slopes that are too steep to stand on.
    if (this.grounded && this.groundNormal.y < 0.62) {
      this._tmp.set(this.groundNormal.x, 0, this.groundNormal.z).normalize();
      this.velocity.addScaledVector(this._tmp, 14 * dt);
    }

    const dx = this.position.x - this._lastPosition.x;
    const dz = this.position.z - this._lastPosition.z;
    this._speed = Math.hypot(dx, dz) / Math.max(dt, 1e-5);
    this._lastPosition.copy(this.position);
  }

  /** Turn toward the requested facing. */
  turn(dt, rateMultiplier = 1) {
    const rate = this.turnRate * rateMultiplier;
    this.yaw = dampAngle(this.yaw, this.targetYaw, rate, dt);
  }

  // --- per-tick -------------------------------------------------------------

  fixedUpdate(dt) {
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.parryWindow > 0) this.parryWindow -= dt;
    if (this.staminaRegenDelay > 0) this.staminaRegenDelay -= dt;
    if (this.poiseRecoveryDelay > 0) this.poiseRecoveryDelay -= dt;
    else if (this.poise < this.maxPoise) this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.7 * dt);

    if (this.alive && this.staminaRegenDelay <= 0 && !this.isGuarding) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * this.staminaRegenMultiplier * dt);
    } else if (this.alive && this.isGuarding && this.staminaRegenDelay <= 0) {
      // Guarding slows regeneration to a trickle rather than stopping it dead,
      // which keeps turtling viable but never free.
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * 0.22 * dt);
    }

    this.status.update(dt);
  }

  /** Visual update at render rate. */
  update(dt) {
    this.object.position.copy(this.position);
    this.object.rotation.y = this.yaw;

    // Lean into acceleration and turns — small, but it reads as weight.
    const turnDelta = shortestAngle(this.yaw, this.targetYaw);
    const speedFrac = clamp(this._speed / this.sprintSpeed, 0, 1);
    this._leanState.roll = damp(this._leanState.roll, clamp(turnDelta, -0.5, 0.5) * speedFrac * 0.22, 8, dt);
    this._leanState.pitch = damp(this._leanState.pitch, -speedFrac * 0.06, 6, dt);
    this.character.setLean(this._leanState.pitch, this._leanState.roll);

    this.character.setSpeed(this._speed);
    this.character.update(dt);
    this._updateBlobShadow();
  }

  _updateBlobShadow() {
    const blob = this.character.blob;
    if (!blob) return;
    const terrain = this.world?.terrain;
    const groundY = terrain ? terrain.heightAt(this.position.x, this.position.z) : 0;
    const air = clamp((this.position.y - groundY) / 3.2, 0, 1);
    blob.position.y = groundY - this.position.y + 0.03;
    const s = (0.9 - air * 0.35) * this.radius * 2.8;
    blob.scale.set(s, s, s);
    blob.material.opacity = (1 - air * 0.7) * 0.5;
  }

  onAnimEvent() { /* subclasses */ }
  onLand() { /* subclasses */ }
  onFlinch() { /* subclasses */ }
  onStagger() { /* subclasses */ }
  onBlock() { /* subclasses */ }
  onDeath() { this.alive = false; }

  dispose() { this.character.dispose(); }
}
