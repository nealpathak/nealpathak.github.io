// Zombies: a fixed pool, three body types, and just enough steering to be
// menacing.
//
// No pathfinding — the arenas are open enough that they walk straight at you
// and slide along whatever they bump into. The one bit of cleverness is the
// unstick nudge: a zombie that has been rubbing against a container without
// making progress picks a side and commits, which reads as "going around"
// rather than "broken".

import * as THREE from 'three';
import { resolve, blocked } from './collide.js';

export const MAX_ALIVE = 30;

/**
 * Body types. Multipliers, not absolutes — the level sets the base and the
 * difficulty scales it, so a Nightmare brute on level 6 is the same creature as
 * a Rookie brute on level 1, just further along every axis.
 */
export const TYPES = {
  shambler: { hp: 1.00, speed: 1.00, damage: 1.0, scale: 1.00, skin: 0x6f7d5e, cloth: 0x2c3038 },
  runner:   { hp: 0.50, speed: 2.05, damage: 0.7, scale: 0.93, skin: 0x8c8a68, cloth: 0x5e2a22 },
  brute:    { hp: 3.60, speed: 0.60, damage: 1.9, scale: 1.32, skin: 0x515c46, cloth: 0x1f2329 },
};

const RADIUS = 0.42;
const HEIGHT = 1.8;
const ATTACK_DAMAGE = 22;
const ATTACK_COOLDOWN = 1.15;
const DEATH_TIME = 1.4;

const G = {
  torso: new THREE.BoxGeometry(0.56, 0.72, 0.30),
  head:  new THREE.BoxGeometry(0.30, 0.30, 0.30),
  arm:   new THREE.BoxGeometry(0.16, 0.62, 0.18),
  leg:   new THREE.BoxGeometry(0.20, 0.78, 0.22),
};
// Limbs pivot at the shoulder/hip, so shift the geometry down and rotate the
// mesh itself.
G.arm.translate(0, -0.31, 0);
G.leg.translate(0, -0.39, 0);

const SHADOW_GEO = new THREE.CircleGeometry(0.42, 12);
const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false,
});

const BASE_EMISSIVE = 0x141a12;   // so silhouettes read outside the lamp pools

const _dir = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _tint = new THREE.Color();

class Zombie {
  constructor(index) {
    const skin = new THREE.MeshStandardMaterial({ roughness: 1, emissive: BASE_EMISSIVE });
    const cloth = new THREE.MeshStandardMaterial({ roughness: 1 });
    this.mats = [skin, cloth];
    this.baseEmissive = [BASE_EMISSIVE, 0x000000];

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

    this.parts = [this.torso, this.head, this.armL, this.armR, this.legL, this.legR];
    for (const p of this.parts) {
      p.userData.zombie = this;
      p.castShadow = true;
    }
    this.head.userData.head = true;

    g.visible = false;
    this.group = g;
    this.active = false;

    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.yaw = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.variation = 0.94 + (index % 5) * 0.03;
    this.type = 'shambler';
    this.radius = RADIUS;
  }

  spawn(x, z, health, speed, typeName, damageScale) {
    const t = TYPES[typeName] || TYPES.shambler;
    this.type = typeName;
    this.active = true;
    this.dying = false;
    this.deathT = 0;
    this.maxHealth = health;
    this.health = health;
    this.speed = speed * (0.92 + Math.random() * 0.16);
    this.damage = ATTACK_DAMAGE * damageScale;
    this.pos.set(x, 0, z);
    this.prev.copy(this.pos);
    this.attackCd = 0.6;     // grace, so a spawn on top of you isn't instant damage
    this.flash = 0;
    this.stuck = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.swing = 0;
    this.growlT = 1 + Math.random() * 5;

    const build = t.scale * this.variation;
    this.radius = RADIUS * t.scale;
    this.reach = this.radius + 0.36 + 0.47;   // + player radius + arm's length

    this.group.visible = true;
    this.group.scale.setScalar(build);

    // Slight per-zombie hue drift so a wave doesn't look stamped out.
    const jitter = 0.9 + Math.random() * 0.2;
    _tint.setHex(t.skin).multiplyScalar(jitter);
    this.mats[0].color.copy(_tint);
    _tint.setHex(t.cloth).multiplyScalar(jitter);
    this.mats[1].color.copy(_tint);
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].emissive.setHex(this.baseEmissive[i]);
      this.mats[i].opacity = 1;
      this.mats[i].transparent = false;
    }
  }

  hit(damage) {
    this.health -= damage;
    this.flash = 0.09;
    if (this.health <= 0 && !this.dying) {
      this.dying = true;
      this.deathT = 0;
      return true;
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
   * @param {{
   *   onPlayerHit:(dmg:number, z:Zombie)=>void,
   *   onKill:(z:Zombie, headshot:boolean)=>void,
   *   onGrowl?:(z:Zombie)=>void,
   * }} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.pool = [];
    for (let i = 0; i < MAX_ALIVE; i++) this.pool.push(new Zombie(i));
    this.hitParts = [];
    this._dirty = true;
  }

  /** Move every zombie into `scene`. three re-parents on add, so this is also
   *  how they follow the player from one level to the next. */
  attachTo(scene) {
    for (const z of this.pool) scene.add(z.group);
  }

  /** Fake contact discs are only wanted when real shadows are switched off —
   *  with both on you get two shadows pointing different ways. */
  setBlobShadows(on) {
    for (const z of this.pool) z.shadow.visible = on;
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

  spawnAt(point, health, speed, colliders, playerPos, type = 'shambler', damageScale = 1) {
    const free = this.pool.find((z) => !z.active);
    if (!free) return false;

    const t = TYPES[type] || TYPES.shambler;
    const radius = RADIUS * t.scale;

    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = attempt * 0.6;
      const x = point.x + Math.cos(a) * r;
      const z = point.z + Math.sin(a) * r;
      if (blocked(x, 0, z, radius, HEIGHT, colliders)) continue;
      if (playerPos && Math.hypot(x - playerPos.x, z - playerPos.z) < 8) continue;
      free.spawn(x, z, health, speed, type, damageScale);
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

      // Growls are the only warning you get about what's behind you, so they
      // fire more often the closer a zombie is.
      z.growlT -= dt * (dist < 12 ? 2 : 1);
      if (z.growlT <= 0) {
        z.growlT = 3 + Math.random() * 6;
        if (dist < 30) this.hooks.onGrowl?.(z);
      }

      if (dist <= z.reach + 0.1) {
        if (z.attackCd <= 0) {
          z.attackCd = ATTACK_COOLDOWN;
          z.swing = 0.35;
          this.hooks.onPlayerHit(z.damage, z);
        }
      } else if (dist > 1e-4) {
        _dir.divideScalar(dist);

        _sep.set(0, 0, 0);
        for (const o of this.pool) {
          if (o === z || !o.active || o.dying) continue;
          const want = z.radius + o.radius + 0.2;
          const dx = z.pos.x - o.pos.x, dz = z.pos.z - o.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 1e-6 && d2 < want * want) {
            const d = Math.sqrt(d2);
            _sep.x += (dx / d) * (1 - d / want);
            _sep.z += (dz / d) * (1 - d / want);
          }
        }

        let vx = _dir.x + _sep.x * 0.9;
        let vz = _dir.z + _sep.z * 0.9;

        if (z.stuck > 0.25) {                 // committed sidestep
          vx += -_dir.z * z.side * 1.5;
          vz +=  _dir.x * z.side * 1.5;
        }

        const len = Math.hypot(vx, vz) || 1;
        const stepLen = z.speed * dt;
        z.pos.x += (vx / len) * stepLen;
        z.pos.z += (vz / len) * stepLen;
        resolve(z.pos, z.radius, HEIGHT, colliders);

        const moved = Math.hypot(z.pos.x - z.prev.x, z.pos.z - z.prev.z);
        if (moved < stepLen * 0.45) {
          z.stuck += dt;
          if (z.stuck > 1.8) { z.stuck = 0; z.side = -z.side; }
        } else if (z.stuck > 0) {
          z.stuck = Math.max(0, z.stuck - dt * 1.5);
        }

        z.phase += moved * 3.4;

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
        g.rotation.x = -t * Math.PI * 0.5;
        g.position.y = -t * 0.35;
        const fade = 1 - Math.max(0, (t - 0.6) / 0.4);
        for (const m of z.mats) { m.transparent = true; m.opacity = fade; }
        continue;
      }

      g.rotation.x = 0;
      for (let i = 0; i < z.mats.length; i++) {
        const m = z.mats[i];
        if (m.opacity !== 1) { m.opacity = 1; m.transparent = false; }
        m.emissive.setHex(z.flash > 0 ? 0x883322 : z.baseEmissive[i]);
      }

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

  /**
   * Snap visible transforms to the simulation and refresh world matrices.
   *
   * Three only updates matrixWorld inside renderer.render(), which runs after
   * the simulation step. Without this a shot is tested against where the horde
   * stood on the *previous* frame — and on the very first frame, against
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

  damagePart(part, damage, headshotMult) {
    const z = part.userData.zombie;
    if (!z || z.dying) return;
    const headshot = part.userData.head === true;
    if (z.hit(headshot ? damage * headshotMult : damage)) {
      this._dirty = true;
      this.hooks.onKill(z, headshot);
    }
  }
}
