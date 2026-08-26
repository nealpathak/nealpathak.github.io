// Collision.
//
// The world is a heightfield plus a set of convex primitives. Characters are
// vertical capsules. That is enough for everything this game does and it stays
// comprehensible, which a general triangle-soup collider would not.
//
// Broadphase is a uniform grid keyed on XZ. Levels here are a few hundred
// metres with a few hundred colliders, so a grid beats a tree comfortably.

import * as THREE from 'three';
import { clamp } from '../core/math.js';

let nextId = 1;

export class BoxCollider {
  /** Axis-aligned in its own frame, rotated about Y only. */
  constructor(center, halfExtents, rotY = 0, { tag = '', solid = true } = {}) {
    this.id = nextId++;
    this.type = 'box';
    this.center = center.clone();
    this.half = halfExtents.clone();
    this.rotY = rotY;
    this.cos = Math.cos(-rotY); this.sin = Math.sin(-rotY);
    this.tag = tag;
    this.solid = solid;
    this.radiusBound = this.half.length();
  }

  toLocal(p, out) {
    const dx = p.x - this.center.x, dz = p.z - this.center.z;
    return out.set(dx * this.cos - dz * this.sin, p.y - this.center.y, dx * this.sin + dz * this.cos);
  }

  toWorldDir(v, out) {
    // Inverse of toLocal's rotation.
    const c = this.cos, s = this.sin;
    return out.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  }

  /** Closest point on the box to `p` (world space), written to `out`. */
  closestPoint(p, out) {
    this.toLocal(p, _l);
    _l.x = clamp(_l.x, -this.half.x, this.half.x);
    _l.y = clamp(_l.y, -this.half.y, this.half.y);
    _l.z = clamp(_l.z, -this.half.z, this.half.z);
    this.toWorldDir(_l, out);
    return out.add(this.center);
  }

  /** True if the world point is strictly inside. */
  contains(p) {
    this.toLocal(p, _l);
    return Math.abs(_l.x) <= this.half.x && Math.abs(_l.y) <= this.half.y && Math.abs(_l.z) <= this.half.z;
  }

  /** Shortest push-out direction and depth for a point inside the box. */
  escape(p, out) {
    this.toLocal(p, _l);
    const dx = this.half.x - Math.abs(_l.x);
    const dy = this.half.y - Math.abs(_l.y);
    const dz = this.half.z - Math.abs(_l.z);
    let depth, n;
    if (dx <= dy && dx <= dz) { depth = dx; n = _l2.set(Math.sign(_l.x) || 1, 0, 0); }
    else if (dy <= dz) { depth = dy; n = _l2.set(0, Math.sign(_l.y) || 1, 0); }
    else { depth = dz; n = _l2.set(0, 0, Math.sign(_l.z) || 1); }
    this.toWorldDir(n, out);
    return depth;
  }

  aabb(out) {
    // Conservative: rotate the extents.
    const c = Math.abs(Math.cos(this.rotY)), s = Math.abs(Math.sin(this.rotY));
    const ex = this.half.x * c + this.half.z * s;
    const ez = this.half.x * s + this.half.z * c;
    out.min.set(this.center.x - ex, this.center.y - this.half.y, this.center.z - ez);
    out.max.set(this.center.x + ex, this.center.y + this.half.y, this.center.z + ez);
    return out;
  }
}

export class CylinderCollider {
  /** A vertical cylinder — trees, pillars, statues. */
  constructor(center, radius, height, { tag = '', solid = true } = {}) {
    this.id = nextId++;
    this.type = 'cylinder';
    this.center = center.clone();     // base centre
    this.radius = radius;
    this.height = height;
    this.tag = tag;
    this.solid = solid;
  }

  closestPoint(p, out) {
    const dx = p.x - this.center.x, dz = p.z - this.center.z;
    const d = Math.hypot(dx, dz);
    const y = clamp(p.y, this.center.y, this.center.y + this.height);
    if (d < 1e-6) return out.set(this.center.x + this.radius, y, this.center.z);
    const k = Math.min(1, this.radius / d);
    return out.set(this.center.x + dx * k, y, this.center.z + dz * k);
  }

  aabb(out) {
    out.min.set(this.center.x - this.radius, this.center.y, this.center.z - this.radius);
    out.max.set(this.center.x + this.radius, this.center.y + this.height, this.center.z + this.radius);
    return out;
  }
}

export class SphereCollider {
  constructor(center, radius, { tag = '', solid = true } = {}) {
    this.id = nextId++;
    this.type = 'sphere';
    this.center = center.clone();
    this.radius = radius;
    this.tag = tag;
    this.solid = solid;
  }

  closestPoint(p, out) {
    out.copy(p).sub(this.center);
    const d = out.length();
    if (d < 1e-6) return out.set(0, this.radius, 0).add(this.center);
    return out.multiplyScalar(this.radius / d).add(this.center);
  }

  aabb(out) {
    out.min.set(this.center.x - this.radius, this.center.y - this.radius, this.center.z - this.radius);
    out.max.set(this.center.x + this.radius, this.center.y + this.radius, this.center.z + this.radius);
    return out;
  }
}

const _l = new THREE.Vector3();
const _l2 = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _push = new THREE.Vector3();
const _aabb = new THREE.Box3();
const _seg = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class CollisionWorld {
  constructor(terrain, { cellSize = 8 } = {}) {
    this.terrain = terrain;
    this.cellSize = cellSize;
    this.grid = new Map();
    this.colliders = [];
    this.stepHeight = 0.42;
    this.maxSlope = 0.86;         // radians; ~49 degrees
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  add(collider) {
    this.colliders.push(collider);
    collider.aabb(_aabb);
    const c = this.cellSize;
    const x0 = Math.floor(_aabb.min.x / c), x1 = Math.floor(_aabb.max.x / c);
    const z0 = Math.floor(_aabb.min.z / c), z1 = Math.floor(_aabb.max.z / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let bucket = this.grid.get(k);
        if (!bucket) this.grid.set(k, (bucket = []));
        bucket.push(collider);
      }
    }
    return collider;
  }

  clear() { this.grid.clear(); this.colliders.length = 0; }

  /** Colliders whose cells overlap a world XZ disc. */
  query(x, z, radius, out = []) {
    out.length = 0;
    const c = this.cellSize;
    const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    const z0 = Math.floor((z - radius) / c), z1 = Math.floor((z + radius) / c);
    const seen = _querySeen;
    seen.clear();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = this.grid.get(this._key(cx, cz));
        if (!bucket) continue;
        for (const col of bucket) {
          if (seen.has(col.id)) continue;
          seen.add(col.id);
          out.push(col);
        }
      }
    }
    return out;
  }

  /** Terrain height, or the top of a solid collider standing on it. */
  groundAt(x, z, fromY = Infinity) {
    let best = this.terrain ? this.terrain.heightAt(x, z) : 0;
    let normal = null;
    const list = this.query(x, z, 0.35, _queryList);
    for (const col of list) {
      if (!col.solid) continue;
      let top = -Infinity;
      if (col.type === 'box') {
        col.toLocal(_tmp.set(x, col.center.y, z), _l);
        if (Math.abs(_l.x) <= col.half.x && Math.abs(_l.z) <= col.half.z) top = col.center.y + col.half.y;
      } else if (col.type === 'cylinder') {
        if (Math.hypot(x - col.center.x, z - col.center.z) <= col.radius) top = col.center.y + col.height;
      }
      // Only stand on surfaces at or below where we already are.
      if (top > best && top <= fromY + this.stepHeight) { best = top; normal = UP; }
    }
    return { y: best, normal: normal ?? (this.terrain ? this.terrain.normalAt(x, z, _groundNormal) : UP) };
  }

  /**
   * Resolve a vertical capsule out of every solid collider it overlaps.
   * `pos` is the capsule's base (feet). Mutates and returns `pos`.
   */
  resolveCapsule(pos, radius, height, iterations = 3) {
    const bottom = radius, top = Math.max(radius, height - radius);
    let hitSomething = false;
    for (let it = 0; it < iterations; it++) {
      const list = this.query(pos.x, pos.z, radius + 0.6, _queryList);
      let moved = false;
      for (const col of list) {
        if (!col.solid) continue;
        // Closest point on the capsule's core segment to the collider.
        _seg.copy(pos);
        const cy = this._segmentClosestY(col, pos, bottom, top);
        _seg.y = pos.y + cy;
        col.closestPoint(_seg, _cp);
        _push.copy(_seg).sub(_cp);
        let dist = _push.length();
        if (dist > radius) continue;

        if (dist < 1e-5) {
          // Deep inside: use the box's own escape direction.
          if (col.type === 'box') {
            const depth = col.escape(_seg, _push);
            _push.multiplyScalar(radius - depth === 0 ? radius : (radius + depth));
          } else {
            _push.set(_seg.x - col.center.x, 0, _seg.z - col.center.z);
            if (_push.lengthSq() < 1e-8) _push.set(1, 0, 0);
            _push.normalize().multiplyScalar(radius);
          }
          dist = 0;
        } else {
          _push.multiplyScalar((radius - dist) / dist);
        }

        // Never resolve a character downward: that pushes them through floors.
        if (_push.y < 0) _push.y = 0;
        // A near-vertical push is the collider acting as ground; the ground
        // pass handles that, so only take the horizontal component here.
        if (_push.y > 0 && Math.abs(_push.y) > Math.hypot(_push.x, _push.z)) continue;
        _push.y = 0;

        pos.add(_push);
        moved = true;
        hitSomething = true;
      }
      if (!moved) break;
    }
    return hitSomething;
  }

  /** Height along the capsule at which it is closest to a collider. */
  _segmentClosestY(col, pos, bottom, top) {
    const cy = col.type === 'box' ? col.center.y
      : col.type === 'cylinder' ? col.center.y + col.height * 0.5
        : col.center.y;
    return clamp(cy - pos.y, bottom, top);
  }

  /**
   * Ray against terrain and colliders. Used by the camera to avoid clipping
   * through walls. Returns distance, or Infinity.
   */
  raycast(origin, dir, maxDist = 20, { skipTag = null } = {}) {
    let best = maxDist;

    // Colliders: analytic sphere/box tests are overkill here — march the ray in
    // short steps and use the closest-point test we already have. The camera
    // only needs "is something in the way", not a precise surface.
    const list = this.query(origin.x, origin.z, maxDist, _queryList);
    for (const col of list) {
      if (!col.solid || (skipTag && col.tag === skipTag)) continue;
      const d = rayVsCollider(origin, dir, col, best);
      if (d < best) best = d;
    }

    if (this.terrain) {
      // March against the heightfield.
      const stepLen = 0.35;
      const steps = Math.ceil(Math.min(best, maxDist) / stepLen);
      for (let i = 1; i <= steps; i++) {
        const t = i * stepLen;
        _tmp.copy(origin).addScaledVector(dir, t);
        const h = this.terrain.heightAt(_tmp.x, _tmp.z);
        if (_tmp.y < h) { best = Math.min(best, Math.max(0, t - stepLen * 0.5)); break; }
      }
    }
    return best;
  }
}

const UP = Object.freeze(new THREE.Vector3(0, 1, 0));
const _groundNormal = new THREE.Vector3(0, 1, 0);
const _querySeen = new Set();
const _queryList = [];

/** Ray vs a single collider. Returns distance or Infinity. */
function rayVsCollider(origin, dir, col, maxDist) {
  if (col.type === 'sphere') return raySphere(origin, dir, col.center, col.radius, maxDist);
  if (col.type === 'cylinder') {
    // Treat as a sphere around its middle; the camera does not need better.
    _tmp.set(col.center.x, col.center.y + col.height * 0.5, col.center.z);
    return raySphere(origin, dir, _tmp, Math.max(col.radius, col.height * 0.5), maxDist);
  }
  return rayBox(origin, dir, col, maxDist);
}

function raySphere(origin, dir, center, radius, maxDist) {
  _tmp.copy(origin).sub(center);
  const b = _tmp.dot(dir);
  const c = _tmp.lengthSq() - radius * radius;
  if (c > 0 && b > 0) return Infinity;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= maxDist ? t : Infinity;
}

function rayBox(origin, dir, col, maxDist) {
  // Transform the ray into the box's frame; then it is a slab test.
  col.toLocal(origin, _l);
  const c = col.cos, s = col.sin;
  _l2.set(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);
  let tmin = 0, tmax = maxDist;
  const h = col.half;
  for (const axis of ['x', 'y', 'z']) {
    const d = _l2[axis];
    const o = _l[axis];
    const he = h[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < -he || o > he) return Infinity;
    } else {
      let t1 = (-he - o) / d, t2 = (he - o) / d;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}
