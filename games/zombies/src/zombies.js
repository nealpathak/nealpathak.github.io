// Zombies: a fixed pool, a blocky humanoid, and just enough steering to be
// menacing.
//
// No pathfinding — the yard is open, so they walk straight at you and slide
// along whatever they bump into. The one bit of cleverness is the unstick
// nudge: if a zombie has been rubbing against a container without making
// progress, it picks a side and commits, which reads as "going around" rather
// than "broken".

import * as THREE from 'three';
import { resolve, blocked } from './collide.js';

export const MAX_ALIVE = 28;

const RADIUS = 0.42;
const HEIGHT = 1.8;
const REACH = 1.25;          // centre-to-centre distance at which it can hit you
const ATTACK_DAMAGE = 22;
const ATTACK_COOLDOWN = 1.15;
const SEPARATION = 1.05;     // they crowd, but they don't occupy each other

const DEATH_TIME = 1.4;

// One geometry per body part, shared by every zombie.
const G = {
  torso: new THREE.BoxGeometry(0.56, 0.72, 0.30),
  head:  new THREE.BoxGeometry(0.30, 0.30, 0.30),
  arm:   new THREE.BoxGeometry(0.16, 0.62, 0.18),
  leg:   new THREE.BoxGeometry(0.20, 0.78, 0.22),
};
// Arms and legs pivot at the shoulder/hip, so shift the geometry down and
// rotate the mesh itself.
G.arm.translate(0, -0.31, 0);
G.leg.translate(0, -0.39, 0);

const SHADOW_GEO = new THREE.CircleGeometry(0.42, 12);
const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false,
});

const SKIN_TONES = [0x6f7d5e, 0x7b8465, 0x5f6b52, 0x82805e];
const CLOTH_TONES = [0x2c3038, 0x3a2f2a, 0x263038, 0x33302b];

const _dir = new THREE.Vector3();
const _sep = new THREE.Vector3();

class Zombie {
  constructor(index) {
    // A whisper of emissive on the skin so a silhouette still reads once it
    // walks out of the lamp pools. Too much and they glow like lanterns.
    const skin = new THREE.MeshStandardMaterial({
      color: SKIN_TONES[index % SKIN_TONES.length], roughness: 1,
      emissive: 0x141a12,
    });
    const cloth = new THREE.MeshStandardMaterial({
      color: CLOTH_TONES[index % CLOTH_TONES.length], roughness: 1,
    });
    this.mats = [skin, cloth];
    // The hit flash overwrites emissive, so remember what to put back.
    this.baseEmissive = [0x141a12, 0x000000];

    const g = new THREE.Group();
    this.torso = new THREE.Mesh(G.torso, cloth); this.torso.position.y = 1.06;
    this.head  = new THREE.Mesh(G.head,  skin);  this.head.position.y = 1.57;
    this.armL  = new THREE.Mesh(G.arm,   skin);  this.armL.position.set(-0.36, 1.36, 0);
    this.armR  = new THREE.Mesh(G.arm,   skin);  this.armR.position.set( 0.36, 1.36, 0);
    this.legL  = new THREE.Mesh(G.leg,   cloth); this.legL.position.set(-0.15, 0.78, 0);
    this.legR  = new THREE.Mesh(G.leg,   cloth); this.legR.position.set( 0.15, 0.78, 0);
    g.add(this.torso, this.head, this.armL, this.armR, this.legL, this.legR);

    this.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    g.add(this.shadow);

    // Everything the bullet can strike, tagged so we know what it hit.
    this.parts = [this.torso, this.head, this.armL, this.armR, this.legL, this.legR];
    for (const p of this.parts) p.userData.zombie = this;
    this.head.userData.head = true;

    g.visible = false;
    this.group = g;
    this.active = false;

    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.yaw = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.build = 0.92 + (index % 5) * 0.04;
  }

  spawn(x, z, health, speed) {
    this.active = true;
    this.dying = false;
    this.deathT = 0;
    this.health = health;
    this.speed = speed * (0.92 + Math.random() * 0.16);
    this.pos.set(x, 0, z);
    this.prev.copy(this.pos);
    this.attackCd = 0.6;      // brief grace so a spawn-camp isn't instant damage
    this.flash = 0;
    this.stuck = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.swing = 0;
    this.group.visible = true;
    this.group.scale.setScalar(this.build);
    for (let i = 0; i < this.mats.length; i++) this.mats[i].emissive.setHex(this.baseEmissive[i]);
  }

  hit(damage) {
    this.health -= damage;
    this.flash = 0.09;
    if (this.health <= 0 && !this.dying) {
      this.dying = true;
      this.deathT = 0;
      return true;   // killed
    }
    return false;
  }

  retire() {
    this.active = false;
    this.group.visible = false;
  }
}

export class Horde {
  /**
   * @param {THREE.Scene} scene
   * @param {{onPlayerHit:(dmg:number)=>void, onKill:(z:Zombie, headshot:boolean)=>void}} hooks
   */
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.pool = [];
    for (let i = 0; i < MAX_ALIVE; i++) {
      const z = new Zombie(i);
      scene.add(z.group);
      this.pool.push(z);
    }
    /** Meshes worth raycasting against — rebuilt only when the set changes. */
    this.hitParts = [];
    this._dirty = true;
  }

  get aliveCount() {
    let n = 0;
    for (const z of this.pool) if (z.active && !z.dying) n++;
    return n;
  }

  clear() {
    for (const z of this.pool) if (z.active) z.retire();
    this._dirty = true;
  }

  /** @returns {boolean} whether a zombie was actually placed */
  spawnAt(point, health, speed, colliders, playerPos) {
    const free = this.pool.find((z) => !z.active);
    if (!free) return false;

    // Nudge around the spawn point until we find somewhere clear, and never
    // drop one in the player's lap.
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = attempt * 0.6;
      const x = point.x + Math.cos(a) * r;
      const z = point.z + Math.sin(a) * r;
      if (blocked(x, 0, z, RADIUS, HEIGHT, colliders)) continue;
      if (playerPos && Math.hypot(x - playerPos.x, z - playerPos.z) < 8) continue;
      free.spawn(x, z, health, speed);
      this._dirty = true;
      return true;
    }
    return false;
  }

  step(dt, playerPos, colliders) {
    for (const z of this.pool) {
      if (!z.active) continue;
      z.prev.copy(z.pos);

      if (z.dying) {
        z.deathT += dt;
        if (z.deathT >= DEATH_TIME) { z.retire(); this._dirty = true; }
        continue;
      }

      if (z.flash > 0) z.flash -= dt;
      z.attackCd -= dt;

      _dir.set(playerPos.x - z.pos.x, 0, playerPos.z - z.pos.z);
      const dist = _dir.length();

      if (dist <= REACH + 0.1) {
        // In range: stop and swing.
        if (z.attackCd <= 0) {
          z.attackCd = ATTACK_COOLDOWN;
          z.swing = 0.35;
          this.hooks.onPlayerHit(ATTACK_DAMAGE);
        }
      } else if (dist > 1e-4) {
        _dir.divideScalar(dist);

        // Keep out of each other's space.
        _sep.set(0, 0, 0);
        for (const o of this.pool) {
          if (o === z || !o.active || o.dying) continue;
          const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 1e-6 && d2 < SEPARATION * SEPARATION) {
            const d = Math.sqrt(d2);
            _sep.x += (dx / d) * (1 - d / SEPARATION);
            _sep.z += (dz / d) * (1 - d / SEPARATION);
          }
        }

        let vx = _dir.x + _sep.x * 0.9;
        let vz = _dir.z + _sep.z * 0.9;

        // Committed sidestep while stuck on geometry.
        if (z.stuck > 0.25) {
          vx += -_dir.z * z.side * 1.5;
          vz +=  _dir.x * z.side * 1.5;
        }

        const len = Math.hypot(vx, vz) || 1;
        const stepLen = z.speed * dt;
        const tx = z.pos.x + (vx / len) * stepLen;
        const tz = z.pos.z + (vz / len) * stepLen;

        z.pos.x = tx;
        z.pos.z = tz;
        resolve(z.pos, RADIUS, HEIGHT, colliders);

        // Did the world eat most of that step?
        const moved = Math.hypot(z.pos.x - z.prev.x, z.pos.z - z.prev.z);
        if (moved < stepLen * 0.45) {
          z.stuck += dt;
          if (z.stuck > 1.8) { z.stuck = 0; z.side = -z.side; }
        } else if (z.stuck > 0) {
          z.stuck = Math.max(0, z.stuck - dt * 1.5);
        }

        z.phase += (moved / dt) * dt * 3.4;

        // Turn to face travel, but not instantly.
        const want = Math.atan2(_dir.x, _dir.z);
        let delta = want - z.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        z.yaw += delta * Math.min(1, dt * 7);
      }

      if (z.swing > 0) z.swing -= dt;
    }
  }

  render(alpha) {
    for (const z of this.pool) {
      if (!z.active) continue;
      const g = z.group;
      g.position.set(
        z.prev.x + (z.pos.x - z.prev.x) * alpha,
        0,
        z.prev.z + (z.pos.z - z.prev.z) * alpha
      );
      g.rotation.y = z.yaw;

      if (z.dying) {
        const t = Math.min(1, z.deathT / DEATH_TIME);
        g.rotation.x = -t * Math.PI * 0.5;          // pitch forward onto its face
        g.position.y = -t * 0.35;
        const fade = 1 - Math.max(0, (t - 0.6) / 0.4);
        for (const m of z.mats) { m.transparent = true; m.opacity = fade; }
        z.shadow.material = SHADOW_MAT;
        continue;
      }

      for (let i = 0; i < z.mats.length; i++) {
        const m = z.mats[i];
        if (m.opacity !== 1) { m.opacity = 1; m.transparent = false; }
        m.emissive.setHex(z.flash > 0 ? 0x883322 : z.baseEmissive[i]);
      }

      // Shamble: legs out of phase, arms reaching, torso lolling.
      const sw = Math.sin(z.phase);
      z.legL.rotation.x =  sw * 0.55;
      z.legR.rotation.x = -sw * 0.55;
      const reach = z.swing > 0 ? -2.3 : -1.35 + sw * 0.12;
      z.armL.rotation.x = reach;
      z.armR.rotation.x = reach;
      z.armL.rotation.z =  0.12;
      z.armR.rotation.z = -0.12;
      z.torso.rotation.z = sw * 0.06;
      z.head.rotation.z = sw * 0.09;
      g.position.y = Math.abs(sw) * 0.035;
    }
  }

  /** Meshes to raycast against. Cached; only rebuilt when the roster changes. */
  targets() {
    if (this._dirty) {
      this.hitParts.length = 0;
      for (const z of this.pool) {
        if (z.active && !z.dying) this.hitParts.push(...z.parts);
      }
      this._dirty = false;
    }
    return this.hitParts;
  }

  /**
   * Snap the visible transforms to the current simulation state and refresh
   * world matrices.
   *
   * Three only updates matrixWorld inside renderer.render(), which runs after
   * the simulation step. Without this, a shot is tested against where the
   * horde stood on the *previous* frame — and on the very first frame, against
   * un-updated identity matrices, i.e. every zombie stacked at the origin.
   */
  syncForRaycast() {
    for (const z of this.pool) {
      if (!z.active || z.dying) continue;
      z.group.position.set(z.pos.x, z.group.position.y, z.pos.z);
      z.group.rotation.y = z.yaw;
      z.group.updateMatrixWorld(true);
    }
  }

  /** Called by the weapon when a raycast lands on one of our parts. */
  damagePart(part, damage) {
    const z = part.userData.zombie;
    if (!z || z.dying) return;
    const headshot = part.userData.head === true;
    if (z.hit(headshot ? damage * 2.6 : damage)) {
      this._dirty = true;
      this.hooks.onKill(z, headshot);
    }
  }

  markDirty() { this._dirty = true; }
}
