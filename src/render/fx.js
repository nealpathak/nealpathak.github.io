// Combat and world VFX: hit sparks, blood, dust, embers, and projectiles.
//
// Everything is pooled. A fight can spawn a few hundred particles a second and
// allocating a Mesh per spark would make the GC the thing that kills you.

import * as THREE from 'three';
import { radialSprite } from './textures.js';
import { makeGlowMaterial } from './materials.js';
import { randRange } from '../core/math.js';
import { makeRng } from '../core/rng.js';

const rng = makeRng(0xf00d);

/** A pooled sprite burst system. One InstancedMesh per material. */
class ParticleGroup {
  constructor(scene, { capacity = 400, material, size = 0.1, gravity = -9, drag = 1.6 }) {
    this.capacity = capacity;
    this.gravity = gravity;
    this.drag = drag;

    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);

    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.colour = new Float32Array(capacity * 3);
    this.count = 0;
    this.baseSize = size;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  emit({ x, y, z, vx, vy, vz, life, size, colour }) {
    let i;
    if (this.count < this.capacity) i = this.count++;
    else i = (Math.random() * this.capacity) | 0;   // recycle the oldest-ish
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size ?? this.baseSize;
    this.spin[i] = randRange(rng, -6, 6);
    this._c.set(colour ?? 0xffffff);
    this.colour[i * 3] = this._c.r; this.colour[i * 3 + 1] = this._c.g; this.colour[i * 3 + 2] = this._c.b;
  }

  update(dt, camera) {
    let write = 0;
    const drag = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag + this.gravity * dt;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      // Compact live particles to the front so the draw call stays tight.
      if (write !== i) {
        for (let k = 0; k < 3; k++) {
          this.pos[write * 3 + k] = this.pos[i3 + k];
          this.vel[write * 3 + k] = this.vel[i3 + k];
          this.colour[write * 3 + k] = this.colour[i3 + k];
        }
        this.life[write] = this.life[i];
        this.maxLife[write] = this.maxLife[i];
        this.size[write] = this.size[i];
        this.spin[write] = this.spin[i];
      }
      write++;
    }
    this.count = write;

    // Billboard everything to the camera.
    this._q.copy(camera.quaternion);
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.maxLife[i];
      const s = this.size[i] * (0.35 + t * 0.9);
      this._p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this._s.set(s, s, s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      const f = t;
      this.mesh.instanceColor.setXYZ(i, this.colour[i * 3] * f, this.colour[i * 3 + 1] * f, this.colour[i * 3 + 2] * f);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    const softAdd = new THREE.MeshBasicMaterial({
      map: radialSprite('#ffffff', 'rgba(255,255,255,0)', 64, 1.5),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, fog: false, vertexColors: true,
    });
    const softAlpha = new THREE.MeshBasicMaterial({
      map: radialSprite('#ffffff', 'rgba(255,255,255,0)', 64, 1.2),
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      toneMapped: false, fog: true, vertexColors: true, opacity: 0.85,
    });

    this.sparks = new ParticleGroup(scene, { capacity: 520, material: softAdd, size: 0.09, gravity: -14, drag: 2.4 });
    this.dust = new ParticleGroup(scene, { capacity: 380, material: softAlpha, size: 0.30, gravity: -1.2, drag: 2.8 });
    this.embers = new ParticleGroup(scene, { capacity: 420, material: softAdd, size: 0.07, gravity: 0.55, drag: 0.5 });

    this.projectiles = [];
    this._projectilePool = [];
  }

  /** A sword landing on flesh: a bright fan of sparks plus a puff. */
  hitSpark(point, direction, { colour = 0xffd9a0, count = 14, power = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const spread = 0.9;
      this.sparks.emit({
        x: point.x, y: point.y, z: point.z,
        vx: (direction.x + randRange(rng, -spread, spread)) * 5 * power,
        vy: (0.6 + randRange(rng, -0.4, 1.3)) * 4.4 * power,
        vz: (direction.z + randRange(rng, -spread, spread)) * 5 * power,
        life: randRange(rng, 0.16, 0.42),
        size: randRange(rng, 0.05, 0.13) * power,
        colour,
      });
    }
  }

  /** A blocked hit: fewer, whiter, sharper. */
  blockSpark(point, direction) {
    this.hitSpark(point, direction, { colour: 0xdfe9ff, count: 18, power: 1.25 });
  }

  /** Footfalls, rolls and landings. */
  dustPuff(point, { count = 8, colour = 0x9a8a76, power = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      this.dust.emit({
        x: point.x + randRange(rng, -0.2, 0.2), y: point.y + 0.05, z: point.z + randRange(rng, -0.2, 0.2),
        vx: randRange(rng, -1, 1) * power, vy: randRange(rng, 0.2, 1.1) * power, vz: randRange(rng, -1, 1) * power,
        life: randRange(rng, 0.4, 0.95), size: randRange(rng, 0.2, 0.5) * power, colour,
      });
    }
  }

  /**
   * Water thrown up by a foot, a roll or a body. Droplets arc and fall; the
   * ring of mist at the base is what actually sells the weight.
   */
  splash(point, { power = 1, colour = 0xa9d8e2 } = {}) {
    const n = Math.round(10 * power);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const s = randRange(rng, 0.6, 2.4) * power;
      this.sparks.emit({
        x: point.x + Math.cos(a) * 0.18, y: point.y + 0.06, z: point.z + Math.sin(a) * 0.18,
        vx: Math.cos(a) * s, vy: randRange(rng, 1.6, 4.2) * power, vz: Math.sin(a) * s,
        life: randRange(rng, 0.22, 0.5), size: randRange(rng, 0.03, 0.09) * power,
        colour,
      });
    }
    for (let i = 0; i < Math.round(5 * power); i++) {
      const a = rng() * Math.PI * 2;
      this.dust.emit({
        x: point.x + Math.cos(a) * 0.3, y: point.y + 0.04, z: point.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * 1.1 * power, vy: randRange(rng, 0.1, 0.5), vz: Math.sin(a) * 1.1 * power,
        life: randRange(rng, 0.35, 0.8), size: randRange(rng, 0.18, 0.42) * power,
        colour: 0xdff0f4,
      });
    }
  }

  /** The ambient drift of embers that gives every zone its air. */
  ambientEmber(centre, radius, count = 1) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      this.embers.emit({
        x: centre.x + Math.cos(a) * r,
        y: centre.y + randRange(rng, -1, 5),
        z: centre.z + Math.sin(a) * r,
        vx: randRange(rng, -0.35, 0.35), vy: randRange(rng, 0.25, 0.9), vz: randRange(rng, -0.35, 0.35),
        life: randRange(rng, 2.5, 6), size: randRange(rng, 0.03, 0.08),
        colour: rng() < 0.7 ? 0xff9a4d : 0xffd08a,
      });
    }
  }

  /** A death burst: the soul leaving. */
  deathBurst(position, colour = 0xffa04c) {
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2;
      const s = rng() * 1.6;
      this.embers.emit({
        x: position.x + Math.cos(a) * s * 0.4,
        y: position.y + rng() * 1.4,
        z: position.z + Math.sin(a) * s * 0.4,
        vx: Math.cos(a) * s, vy: randRange(rng, 1.2, 3.4), vz: Math.sin(a) * s,
        life: randRange(rng, 0.9, 2.2), size: randRange(rng, 0.06, 0.16), colour,
      });
    }
  }

  // --- projectiles ----------------------------------------------------------

  spawnProjectile({ from, to, speed = 16, radius = 0.28, colour = 0xffd27a, spec, owner, trail = true }) {
    let p = this._projectilePool.pop();
    if (!p) {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 1),
        makeGlowMaterial(colour, { opacity: 0.95, depthWrite: false }),
      );
      const light = new THREE.PointLight(colour, 3, 7, 2);
      mesh.add(light);
      p = { mesh, light, velocity: new THREE.Vector3() };
    }
    p.mesh.material.color.set(colour);
    p.light.color.set(colour);
    p.mesh.scale.setScalar(radius);
    p.mesh.position.copy(from);
    p.mesh.visible = true;
    p.velocity.copy(to).sub(from).normalize().multiplyScalar(speed);
    p.life = 5;
    p.radius = radius;
    p.spec = spec;
    p.owner = owner;
    p.trail = trail;
    p.colour = colour;
    this.scene.add(p.mesh);
    this.projectiles.push(p);
    return p;
  }

  updateProjectiles(dt, actors, collision, onHit) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 3.4;

      if (p.trail) {
        this.embers.emit({
          x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z,
          vx: randRange(rng, -0.3, 0.3), vy: randRange(rng, -0.2, 0.4), vz: randRange(rng, -0.3, 0.3),
          life: randRange(rng, 0.18, 0.45), size: p.radius * 0.7, colour: p.colour,
        });
      }

      let done = p.life <= 0;
      if (!done) {
        for (const a of actors) {
          if (!a.alive || a === p.owner || a.faction === p.owner?.faction) continue;
          const dx = a.position.x - p.mesh.position.x;
          const dy = (a.position.y + a.height * 0.55) - p.mesh.position.y;
          const dz = a.position.z - p.mesh.position.z;
          const r = a.radius + p.radius;
          if (dx * dx + dy * dy * 0.55 + dz * dz < r * r) {
            onHit?.(a, p);
            done = true;
            break;
          }
        }
      }
      if (!done && collision) {
        const ground = collision.terrain?.heightAt(p.mesh.position.x, p.mesh.position.z) ?? -Infinity;
        if (p.mesh.position.y <= ground) { done = true; onHit?.(null, p); }
      }

      if (done) {
        this.hitSpark(p.mesh.position, _zero, { colour: p.colour, count: 20, power: 1.3 });
        this.scene.remove(p.mesh);
        p.mesh.visible = false;
        this.projectiles.splice(i, 1);
        this._projectilePool.push(p);
      }
    }
  }

  update(dt) {
    this.sparks.update(dt, this.camera);
    this.dust.update(dt, this.camera);
    this.embers.update(dt, this.camera);
  }
}

const _zero = new THREE.Vector3(0, 1, 0);
