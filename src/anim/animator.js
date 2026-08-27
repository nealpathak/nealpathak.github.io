// Layered animator.
//
// A layer plays one "motion" — either a Clip or a BlendSpace — and crossfades
// to the next. Layers stack: a full-body base layer for locomotion, a masked
// upper-body layer so you can swing a sword while running, and an additive
// layer for breathing and lean that should never fight the other two.

import * as THREE from 'three';
import { Pose, BONE_COUNT, BONE_INDEX, REST_ROT } from './skeleton.js';

/**
 * Blends N clips along one axis (speed, usually). All clips share a normalised
 * phase so a walk and a run stay foot-synced through the transition.
 */
export class BlendSpace1D {
  /** @param {Array<{motion: Clip, value: number}>} points */
  constructor(points, { loop = true } = {}) {
    this.points = points.slice().sort((a, b) => a.value - b.value);
    this.param = this.points[0].value;
    this.loop = loop;
    this._tmp = new Pose();
  }

  set(v) { this.param = v; return this; }

  _bracket() {
    const p = this.points;
    if (this.param <= p[0].value) return [p[0], p[0], 0];
    if (this.param >= p[p.length - 1].value) return [p[p.length - 1], p[p.length - 1], 0];
    for (let i = 0; i < p.length - 1; i++) {
      if (this.param >= p[i].value && this.param <= p[i + 1].value) {
        const t = (this.param - p[i].value) / (p[i + 1].value - p[i].value || 1);
        return [p[i], p[i + 1], t];
      }
    }
    return [p[0], p[0], 0];
  }

  get duration() {
    const [a, b, t] = this._bracket();
    return a.motion.duration + (b.motion.duration - a.motion.duration) * t;
  }

  get rootMotion() {
    const [a, b, t] = this._bracket();
    return (a.motion.rootMotion ?? 0) + ((b.motion.rootMotion ?? 0) - (a.motion.rootMotion ?? 0)) * t;
  }

  get events() { return this._bracket()[0].motion.events ?? []; }

  sample(u, out) {
    const [a, b, t] = this._bracket();
    a.motion.sample(u, out);
    if (t > 0.001 && b !== a) {
      b.motion.sample(u, this._tmp);
      out.blend(this._tmp, t);
    }
    return out;
  }
}

/** Four-way directional blend for locked-on strafing. */
export class BlendSpace2D {
  /** @param {Array<{motion, x: number, y: number}>} points — x right, y forward */
  constructor(points) {
    this.points = points;
    this.x = 0; this.y = 0;
    this._tmp = new Pose();
    this._weights = new Float32Array(points.length);
  }

  set(x, y) { this.x = x; this.y = y; return this; }

  _computeWeights() {
    // Inverse-distance weighting, sharpened so the cardinal poses stay clean.
    const w = this._weights;
    let total = 0;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      const v = d < 0.0001 ? 1e6 : 1 / Math.pow(d, 3);
      w[i] = v; total += v;
    }
    for (let i = 0; i < w.length; i++) w[i] /= total;
    return w;
  }

  get duration() {
    const w = this._computeWeights();
    let d = 0;
    for (let i = 0; i < w.length; i++) d += this.points[i].motion.duration * w[i];
    return d;
  }

  get rootMotion() { return 0; }
  get events() { return this.points[0].motion.events ?? []; }

  sample(u, out) {
    const w = this._computeWeights();
    // Start from the heaviest, then blend the rest in by relative weight.
    let best = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
    this.points[best].motion.sample(u, out);
    let acc = w[best];
    for (let i = 0; i < w.length; i++) {
      if (i === best || w[i] < 0.002) continue;
      this.points[i].motion.sample(u, this._tmp);
      acc += w[i];
      out.blend(this._tmp, w[i] / acc);
    }
    return out;
  }
}

class Playing {
  constructor() { this.motion = null; this.time = 0; this.speed = 1; this.loop = false; this._eventCursor = 0; }
}

export class Layer {
  constructor(name, { mask = null, weight = 1, additive = false } = {}) {
    this.name = name;
    this.mask = mask;
    this.weight = weight;
    this.additive = additive;

    this.cur = new Playing();
    this.prev = new Playing();
    this.fade = 1;          // 1 = fully on `cur`
    this.fadeRate = 10;
    this.onEvent = null;
    this.finished = true;

    this._poseA = new Pose();
    this._poseB = new Pose();
  }

  get motion() { return this.cur.motion; }
  get playing() { return this.cur.motion?.name ?? null; }
  /** Normalised progress through the current motion, 0..1. */
  get progress() {
    const d = this.cur.motion?.duration ?? 1;
    return d > 0 ? Math.min(1, this.cur.time / d) : 1;
  }

  play(motion, { fade = 0.14, speed = 1, loop = null, restart = false, offset = 0 } = {}) {
    if (!motion) return this;
    if (this.cur.motion === motion && !restart) {
      this.cur.speed = speed;
      return this;
    }
    // Shuffle current into previous so we can crossfade out of it.
    const tmp = this.prev;
    this.prev = this.cur;
    this.cur = tmp;
    this.cur.motion = motion;
    this.cur.time = offset * (motion.duration ?? 1);
    this.cur.speed = speed;
    this.cur.loop = loop ?? motion.loop ?? false;
    this.cur._eventCursor = 0;
    this.fade = fade <= 0 || !this.prev.motion ? 1 : 0;
    this.fadeRate = fade <= 0 ? 1e6 : 1 / fade;
    this.finished = false;
    return this;
  }

  stop() { this.cur.motion = null; this.prev.motion = null; this.finished = true; }

  update(dt) {
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * this.fadeRate);

    const c = this.cur;
    if (c.motion) {
      const dur = c.motion.duration || 1;
      const before = c.time;
      c.time += dt * c.speed;
      this._fireEvents(c, before, c.time, dur);
      if (c.time >= dur) {
        if (c.loop) { c.time %= dur; c._eventCursor = 0; }
        else { c.time = dur; this.finished = true; }
      }
    }
    const p = this.prev;
    if (p.motion && this.fade < 1) {
      p.time += dt * p.speed;
      const dur = p.motion.duration || 1;
      if (p.time >= dur) { if (p.loop) p.time %= dur; else p.time = dur; }
    }
  }

  _fireEvents(play, before, after, dur) {
    const events = play.motion.events;
    if (!events || !events.length || !this.onEvent) return;
    const u0 = before / dur, u1 = after / dur;
    for (const e of events) {
      if (e.t > u0 && e.t <= u1) this.onEvent(e, this);
    }
  }

  /** Blend this layer's contribution into `dest`. */
  evaluate(dest) {
    if (!this.cur.motion || this.weight <= 0.0001) return dest;
    const dur = this.cur.motion.duration || 1;
    const u = Math.min(1, this.cur.time / dur);
    this.cur.motion.sample(u, this._poseA);

    if (this.prev.motion && this.fade < 1) {
      const pdur = this.prev.motion.duration || 1;
      this.prev.motion.sample(Math.min(1, this.prev.time / pdur), this._poseB);
      // Fade from prev -> cur: start at prev, blend toward cur by `fade`.
      this._poseB.blend(this._poseA, this.fade);
      this._poseA.copy(this._poseB);
    }

    if (this.additive) dest.additive(this._poseA, this.weight, this.mask);
    else dest.blend(this._poseA, this.weight, this.mask);
    return dest;
  }
}

export class Animator {
  constructor(skeleton) {
    this.skeleton = skeleton;
    this.layers = [];
    this.pose = new Pose();
    this.rootMotionDelta = new THREE.Vector3();

    // Procedural passes run after layers and before the skeleton is written.
    this.lookAt = { enabled: false, target: new THREE.Vector3(), weight: 0, maxYaw: 1.1, maxPitch: 0.5 };
    this.lean = { pitch: 0, roll: 0, weight: 1 };
    this.breath = { amount: 1, phase: Math.random() * 6.28, rate: 1.0 };
    this._time = 0;
  }

  addLayer(name, opts) {
    const l = new Layer(name, opts);
    this.layers.push(l);
    this[name] = l;
    return l;
  }

  layer(name) { return this.layers.find((l) => l.name === name); }

  update(dt) {
    this._time += dt;
    for (const l of this.layers) l.update(dt);
  }

  /** Compose all layers, apply procedural passes, push to the skeleton. */
  evaluate(dt) {
    const pose = this.pose.copyRest();
    for (const l of this.layers) l.evaluate(pose);
    this._applyBreath(pose);
    this._applyLean(pose);
    this._applyLookAt(pose);
    this.skeleton.apply(pose);
    return pose;
  }

  _applyBreath(pose) {
    const a = this.breath.amount;
    if (a <= 0.001) return;
    this.breath.phase += 0;   // advanced in update via _time
    const t = this._time * this.breath.rate;
    const s = Math.sin(t * 1.7 + this.breath.phase);
    _q.setFromAxisAngle(_axisX, s * 0.020 * a);
    pose.rot[BONE_INDEX.chest].multiply(_q);
    _q.setFromAxisAngle(_axisX, s * 0.012 * a);
    pose.rot[BONE_INDEX.spine].multiply(_q);
    _q.setFromAxisAngle(_axisX, -s * 0.016 * a);
    pose.rot[BONE_INDEX.neck].multiply(_q);
  }

  _applyLean(pose) {
    const { pitch, roll, weight } = this.lean;
    if (weight <= 0.001 || (Math.abs(pitch) < 0.001 && Math.abs(roll) < 0.001)) return;
    // Distribute the lean down the spine so it reads as a body, not a hinge.
    const share = [
      [BONE_INDEX.hips, 0.28], [BONE_INDEX.spine, 0.34], [BONE_INDEX.chest, 0.26], [BONE_INDEX.neck, 0.12],
    ];
    for (const [idx, k] of share) {
      _e.set(pitch * k * weight, 0, roll * k * weight, 'XYZ');
      _q.setFromEuler(_e);
      pose.rot[idx].multiply(_q);
    }
  }

  _applyLookAt(pose) {
    const la = this.lookAt;
    if (!la.enabled || la.weight <= 0.001) return;
    // Work out the target direction in the character's local space.
    const headBone = this.skeleton.bones[BONE_INDEX.head];
    headBone.updateMatrixWorld?.();
    const root = this.skeleton.root;
    _v.copy(la.target);
    root.worldToLocal(_v);
    _v.y -= 1.55 * this.skeleton.scaleFactor;
    const yaw = THREE.MathUtils.clamp(Math.atan2(-_v.x, -_v.z), -la.maxYaw, la.maxYaw);
    const pitch = THREE.MathUtils.clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -la.maxPitch, la.maxPitch);
    const w = la.weight;
    _e.set(-pitch * 0.35 * w, yaw * 0.35 * w, 0, 'YXZ');
    _q.setFromEuler(_e);
    pose.rot[BONE_INDEX.neck].multiply(_q);
    _e.set(-pitch * 0.65 * w, yaw * 0.65 * w, 0, 'YXZ');
    _q.setFromEuler(_e);
    pose.rot[BONE_INDEX.head].multiply(_q);
  }
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);

export { Pose, BONE_INDEX, REST_ROT, BONE_COUNT };
