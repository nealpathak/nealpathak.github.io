// The player: movement, collision, camera, health.
//
// Movement is acceleration-and-friction rather than "set velocity to input",
// which is the difference between a character that feels like it has weight and
// one that feels like a spreadsheet cursor.

import * as THREE from 'three';
import { resolve } from './collide.js';

const EYE = 1.68;
const RADIUS = 0.36;
const HEIGHT = 1.8;

const WALK = 5.4;
const SPRINT = 8.2;

// Friction pulls back proportionally to speed while acceleration is a flat cap,
// so the real ceiling is GROUND_ACCEL / FRICTION. Keep that comfortably above
// SPRINT or the sprint key does nothing.
const GROUND_ACCEL = 90;
const AIR_ACCEL = 9;
const FRICTION = 8;
const GRAVITY = 23;
const JUMP = 7.0;

const PITCH_LIMIT = Math.PI / 2 - 0.02;

const _wish = new THREE.Vector3();
const _flat = new THREE.Vector3();

export class Player {
  constructor(camera, stats) {
    this.camera = camera;
    this.stats = stats;
    this.pos = new THREE.Vector3(0, 0, 14);
    this.prev = this.pos.clone();
    this.spawn = new THREE.Vector2(0, 14);
    this.vel = new THREE.Vector3();
    this.yaw = 0;            // camera looks down -Z, i.e. into the arena
    this.pitch = 0;
    this.onGround = true;

    this.health = stats.maxHealth;
    this.sinceDamage = 99;
    this.dead = false;

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.sprinting = false;
    this.extraPitch = 0;     // recoil, written by the weapon each frame
    this.shake = 0;          // decaying impulse, set when hit
  }

  useStats(stats) {
    const gained = stats.maxHealth - this.stats.maxHealth;
    this.stats = stats;
    if (gained > 0) this.health += gained;    // a bigger tank arrives full
    this.health = Math.min(this.health, stats.maxHealth);
  }

  setSpawn(x, z) { this.spawn.set(x, z); }

  reset() {
    this.pos.set(this.spawn.x, 0, this.spawn.y);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.stats.maxHealth;
    this.sinceDamage = 99;
    this.dead = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.shake = 0;
  }

  /** Mouse look runs every rendered frame, not on the fixed step — it must
   *  never feel quantised. */
  look(dYaw, dPitch) {
    if (this.dead) return;
    this.yaw += dYaw;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + dPitch));
  }

  step(dt, input, colliders) {
    this.prev.copy(this.pos);
    this.sinceDamage += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3.2);

    if (this.dead) {
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; }
      return;
    }

    const max = this.stats.maxHealth;
    if (this.health < max && this.sinceDamage > this.stats.regenDelay) {
      this.health = Math.min(max, this.health + this.stats.regenRate * dt);
    }

    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);

    _wish.set(0, 0, 0);
    if (f || s) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      _wish.x = -sin * f + cos * s;      // forward is -Z in three's convention
      _wish.z = -cos * f - sin * s;
      _wish.normalize();
    }

    this.sprinting = input.down('ShiftLeft') || input.down('ShiftRight');
    // Sprinting only pays off going forwards; backpedalling stays slow.
    const top = ((this.sprinting && f > 0) ? SPRINT : WALK) * this.stats.moveScale;

    _flat.set(this.vel.x, 0, this.vel.z);
    const speed = _flat.length();
    if (this.onGround && speed > 0) {
      const drop = Math.max(speed, 2) * FRICTION * dt;
      const scale = Math.max(0, speed - drop) / speed;
      this.vel.x *= scale;
      this.vel.z *= scale;
    }

    if (_wish.lengthSq() > 0) {
      const accel = (this.onGround ? GROUND_ACCEL : AIR_ACCEL) * this.stats.moveScale;
      const current = this.vel.x * _wish.x + this.vel.z * _wish.z;
      const add = Math.min(top - current, accel * dt);
      if (add > 0) {
        this.vel.x += _wish.x * add;
        this.vel.z += _wish.z * add;
      }
    }

    if (input.down('Space') && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
    }

    this.vel.y -= GRAVITY * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }

    const beforeX = this.pos.x, beforeZ = this.pos.z;
    resolve(this.pos, RADIUS, HEIGHT, colliders);
    // Kill the velocity component we were just pushed back along, or we grind
    // into the wall and re-resolve every step.
    const pushX = this.pos.x - beforeX;
    const pushZ = this.pos.z - beforeZ;
    if (pushX || pushZ) {
      const len = Math.hypot(pushX, pushZ);
      const nx = pushX / len, nz = pushZ / len;
      const into = this.vel.x * nx + this.vel.z * nz;
      if (into < 0) { this.vel.x -= nx * into; this.vel.z -= nz * into; }
    }

    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const target = this.onGround ? Math.min(hspeed / SPRINT, 1) : 0;
    this.bobAmount += (target - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += hspeed * dt * 1.7;
  }

  damage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    this.sinceDamage = 0;
    this.shake = Math.min(1, this.shake + 0.5);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;      // died on this hit
    }
    return false;
  }

  /** Place the camera. `alpha` interpolates between the last two fixed steps. */
  render(alpha) {
    const x = this.prev.x + (this.pos.x - this.prev.x) * alpha;
    const y = this.prev.y + (this.pos.y - this.prev.y) * alpha;
    const z = this.prev.z + (this.pos.z - this.prev.z) * alpha;

    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmount;

    const sh = this.shake * this.shake;
    const shX = sh * (Math.random() - 0.5) * 0.09;
    const shY = sh * (Math.random() - 0.5) * 0.09;

    const eye = this.dead ? 0.45 : EYE + bobY;
    this.camera.position.set(
      x + bobX * Math.cos(this.yaw) + shX,
      y + eye + shY,
      z - bobX * Math.sin(this.yaw)
    );

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.dead ? Math.max(this.pitch, -0.2) : this.pitch + this.extraPitch);
    // A touch of roll while strafing, and a hard tilt once you're down.
    this.camera.rotateZ(this.dead ? 1.2 : -bobX * 0.35);
  }

  get maxHealth() { return this.stats.maxHealth; }
  get radius() { return RADIUS; }
}
