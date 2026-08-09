// Impact particles — blood off zombies, sparks off the level.
//
// One Points object with a fixed buffer, recycled. Nothing is allocated after
// construction, so a firefight can't stutter on garbage collection.
//
// Base colour and rendered colour are separate arrays on purpose: the geometry
// attribute is the one the GPU reads, and fading it in place would compound the
// multiply every frame instead of tracking remaining life.

import * as THREE from 'three';

const MAX = 420;
const GRAVITY = 16;
const BURIED = -999;

export class Fx {
  constructor() {
    this.px = new Float32Array(MAX);
    this.py = new Float32Array(MAX);
    this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.span = new Float32Array(MAX);
    this.base = new Float32Array(MAX * 3);     // colour at birth
    this.cursor = 0;

    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);   // what the GPU reads
    for (let i = 0; i < MAX; i++) this.positions[i * 3 + 1] = BURIED;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.075, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;   // the buffer spans the whole level
  }

  attachTo(scene) { scene.add(this.points); }

  /**
   * @param {THREE.Vector3} at    impact point
   * @param {THREE.Vector3} dir   bullet direction; spray goes back along it
   * @param {'blood'|'spark'} kind
   */
  burst(at, dir, kind) {
    const blood = kind === 'blood';
    const count = blood ? 14 : 8;
    const speed = blood ? 3.4 : 5.5;
    const life = blood ? 0.7 : 0.28;

    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;

      this.px[i] = at.x; this.py[i] = at.y; this.pz[i] = at.z;

      const s = speed * (0.4 + Math.random() * 0.8);
      this.vx[i] = -dir.x * s * 0.5 + (Math.random() - 0.5) * s;
      this.vy[i] = -dir.y * s * 0.5 + Math.random() * s * 0.8;
      this.vz[i] = -dir.z * s * 0.5 + (Math.random() - 0.5) * s;

      this.span[i] = this.life[i] = life * (0.6 + Math.random() * 0.7);

      const c = i * 3;
      if (blood) {
        this.base[c] = 0.42 + Math.random() * 0.22;
        this.base[c + 1] = 0.03;
        this.base[c + 2] = 0.03;
      } else {
        this.base[c] = 1;
        this.base[c + 1] = 0.65 + Math.random() * 0.3;
        this.base[c + 2] = 0.25;
      }
    }
  }

  step(dt) {
    let touched = false;

    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      touched = true;

      this.life[i] -= dt;
      const c = i * 3;

      if (this.life[i] <= 0) {
        this.positions[c + 1] = BURIED;
        this.colors[c] = this.colors[c + 1] = this.colors[c + 2] = 0;
        continue;
      }

      this.vy[i] -= GRAVITY * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;

      if (this.py[i] < 0.02) {          // settle onto the concrete and die soon
        this.py[i] = 0.02;
        this.vx[i] *= 0.3; this.vz[i] *= 0.3; this.vy[i] = 0;
        if (this.life[i] > 0.25) this.life[i] = 0.25;
      }

      this.positions[c] = this.px[i];
      this.positions[c + 1] = this.py[i];
      this.positions[c + 2] = this.pz[i];

      // Fade toward black over the particle's own lifetime.
      const t = this.life[i] / this.span[i];
      const f = t * t;
      this.colors[c] = this.base[c] * f;
      this.colors[c + 1] = this.base[c + 1] * f;
      this.colors[c + 2] = this.base[c + 2] * f;
    }

    if (touched) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  get liveCount() {
    let n = 0;
    for (let i = 0; i < MAX; i++) if (this.life[i] > 0) n++;
    return n;
  }

  clear() {
    for (let i = 0; i < MAX; i++) {
      this.life[i] = 0;
      this.positions[i * 3 + 1] = BURIED;
      this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
