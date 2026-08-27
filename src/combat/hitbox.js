// Melee hit detection.
//
// Hitboxes are swept, not instantaneous. A sword tip crosses two metres in the
// 0.15s a swing is live; testing only where the blade happens to be at frame
// boundaries produces swings that visibly pass through an enemy and do nothing.
//
// So: sample the blade's world segment every time the pose changes, and test
// the volume swept since the last sample, subdivided by how far it moved. On a
// 144Hz machine that is one step; on a struggling one it is six, and the hit
// still lands. Sampling and testing must happen at the same rate — pairing them
// is the whole point, and separating them was a real bug here.

import * as THREE from 'three';
import { resolveHit } from './damage.js';

const _a0 = new THREE.Vector3(), _a1 = new THREE.Vector3();
const _b0 = new THREE.Vector3(), _b1 = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();

/** Squared distance between two segments, with the closest points written out. */
export function segmentDistanceSq(p1, q1, p2, q2, outA, outB) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  const EPS = 1e-8;
  if (a <= EPS && e <= EPS) { s = t = 0; }
  else if (a <= EPS) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = _d1.dot(_r);
    if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  outA.copy(p1).addScaledVector(_d1, s);
  outB.copy(p2).addScaledVector(_d2, t);
  return outA.distanceToSquared(outB);
}

/**
 * A live melee hitbox. Owned by an actor, opened and closed by animation events.
 */
export class MeleeHitbox {
  constructor(owner) {
    this.owner = owner;
    this.active = false;
    this.radius = 0.16;
    this.hitOnce = new Set();
    this.maxTargets = 4;

    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.prevFrom = new THREE.Vector3();
    this.prevTo = new THREE.Vector3();
    this._hasPrev = false;

    this.attack = null;
    this.onHit = null;
    this.trail = null;
    // Sub-steps are capped: past this the extra tests buy nothing and a
    // pathological frame could otherwise cost hundreds of segment tests.
    this.maxSubSteps = 6;
    // Melee in an action game is deliberately forgiving. This is added to the
    // blade radius so a swing that looks like it connected does.
    this.padding = 0.19;
    // Vertical tolerance is separate and much larger, because a horizontal
    // slash lives at roughly chest height while enemies range from knee-high
    // spirits to a boss twice your size. Without it a swing sails over
    // anything short and under anything tall, which is not a difficulty
    // choice, just a miss the player cannot understand.
    this.verticalPad = 0.42;
  }

  /**
   * Open the box. `spec` describes the damage this swing does; `source` is the
   * object whose world matrix defines the blade (a weapon group, or a bone).
   */
  open(source, localFrom, localTo, radius, spec) {
    this.source = source;
    this.localFrom = localFrom;
    this.localTo = localTo;
    this.radius = radius;
    this.attack = spec;
    this.active = true;
    this._hasPrev = false;
    this.hitOnce.clear();
  }

  close() {
    this.active = false;
    this._hasPrev = false;
    this.attack = null;
  }

  /** Sample the blade's current world segment. Call before `test`. */
  sample() {
    if (!this.active || !this.source) return;
    this.prevFrom.copy(this.from);
    this.prevTo.copy(this.to);
    this.source.updateWorldMatrix(true, false);
    this.from.set(this.localFrom[0], this.localFrom[1], this.localFrom[2]).applyMatrix4(this.source.matrixWorld);
    this.to.set(this.localTo[0], this.localTo[1], this.localTo[2]).applyMatrix4(this.source.matrixWorld);
    if (!this._hasPrev) { this.prevFrom.copy(this.from); this.prevTo.copy(this.to); this._hasPrev = true; }
  }

  /**
   * Test against a list of actors, applying damage to any that connect.
   * Returns the reports for anything hit this frame.
   */
  /**
   * Test against a list of actors. Call immediately after `sample()`.
   */
  test(candidates) {
    if (!this.active || !this._hasPrev) return null;
    let results = null;

    // How finely to subdivide the sweep: one step per half-radius of travel.
    const travel = Math.max(this.from.distanceTo(this.prevFrom), this.to.distanceTo(this.prevTo));
    const steps = Math.max(1, Math.min(this.maxSubSteps, Math.ceil(travel / Math.max(0.12, this.radius))));

    for (const target of candidates) {
      if (target === this.owner || !target.alive) continue;
      if (target.faction === this.owner.faction) continue;
      if (this.hitOnce.has(target.id)) continue;
      if (this.hitOnce.size >= this.maxTargets) break;

      // Target capsule: its core segment, extended vertically by the tolerance
      // above so short and tall actors are both reachable by the same swing.
      _b0.set(target.position.x, target.position.y + target.radius - this.verticalPad, target.position.z);
      _b1.set(target.position.x, target.position.y + target.height - target.radius + this.verticalPad, target.position.z);

      // Walk the swept volume from the previous sample to this one.
      const reach = this.radius + this.padding + target.radius;
      const reach2 = reach * reach;
      let connected = false;
      for (let s = steps; s >= 0; s--) {
        const t = s / steps;
        _a0.lerpVectors(this.prevFrom, this.from, t);
        _a1.lerpVectors(this.prevTo, this.to, t);
        if (segmentDistanceSq(_a0, _a1, _b0, _b1, _p, _q) <= reach2) { connected = true; break; }
      }
      if (!connected) continue;

      this.hitOnce.add(target.id);
      const spec = { ...this.attack, source: this.owner };
      spec.point = _p.clone().lerp(_q, 0.5);
      spec.direction = new THREE.Vector3().subVectors(target.position, this.owner.position).setY(0).normalize();
      const report = resolveHit(target, spec);
      (results ??= []).push({ target, report });
      this.onHit?.(target, report);
    }
    return results;
  }
}

/**
 * A weapon trail: a ribbon built from the blade's recent positions. Purely
 * visual, but it is most of what makes a swing legible at speed.
 */
export class WeaponTrail {
  constructor({ segments = 14, color = 0xffe6c0, width = 1 } = {}) {
    this.segments = segments;
    this.width = width;
    this.head = 0;
    this.count = 0;
    this.points = new Float32Array(segments * 6);   // from/to pairs

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 6), 3));
    const alpha = new Float32Array(segments * 2);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const idx = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */`
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float a = vAlpha * uOpacity;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( uColor, a );
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
  }

  begin(color) {
    this.count = 0;
    this.head = 0;
    this.points.fill(0);
    this.mesh.visible = true;
    this.material.uniforms.uOpacity.value = 1;
    if (color != null) this.material.uniforms.uColor.value.set(color);
  }

  push(from, to) {
    const i = this.head * 6;
    this.points[i] = from.x; this.points[i + 1] = from.y; this.points[i + 2] = from.z;
    this.points[i + 3] = to.x; this.points[i + 4] = to.y; this.points[i + 5] = to.z;
    this.head = (this.head + 1) % this.segments;
    this.count = Math.min(this.count + 1, this.segments);
    this._write();
  }

  _write() {
    const pos = this.geometry.attributes.position.array;
    const alpha = this.geometry.attributes.aAlpha.array;
    const n = Math.max(1, this.count);
    for (let s = 0; s < this.segments; s++) {
      const live = s < this.count;
      // Slots past the live tail collapse onto the newest segment rather than
      // keeping whatever was there last swing. A zero-alpha vertex still
      // anchors a quad, so leaving stale positions stretches a bright sheet
      // across the whole level — which is exactly what it did.
      const idx = live ? s : Math.max(0, this.count - 1);
      const src = ((this.head - this.count + idx + this.segments * 2) % this.segments) * 6;
      const dst = s * 6;
      for (let k = 0; k < 6; k++) pos[dst + k] = this.points[src + k];
      const t = n > 1 ? idx / (n - 1) : 1;
      const a = live ? t * t * 0.42 : 0;
      alpha[s * 2] = a;
      alpha[s * 2 + 1] = a * 0.28;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  /** Fade out after the swing ends. */
  fade(dt, rate = 4.5) {
    if (!this.mesh.visible) return;
    const u = this.material.uniforms.uOpacity;
    u.value -= dt * rate;
    if (u.value <= 0) { u.value = 0; this.mesh.visible = false; }
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
