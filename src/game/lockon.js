// Lock-on targeting.
//
// The rule that matters: pick the target the player is *looking at*, not the
// nearest one. Screen-space angle beats world distance, with distance as a
// tie-break, which is why a lock-on in a good action game never grabs the
// enemy behind you.

import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';

const _toTarget = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _screen = new THREE.Vector3();

export class LockOn {
  constructor(player, camera) {
    this.player = player;
    this.camera = camera;
    this.target = null;
    this.maxDistance = 26;
    this.maxAngle = 0.92;       // radians from the camera's forward
    this.breakDistance = 34;
    this._cycleCooldown = 0;
    this._recentHit = null;
    this._recentHitTime = 0;
  }

  notifyHit(target) {
    this._recentHit = target;
    this._recentHitTime = 0.6;
  }

  /** Score a candidate: lower is better. */
  _score(actor) {
    const cam = this.camera.camera;
    _toTarget.set(actor.position.x, actor.position.y + actor.lockOnHeight, actor.position.z)
      .sub(cam.position);
    const dist = _toTarget.length();
    if (dist > this.maxDistance) return Infinity;
    _toTarget.divideScalar(dist);
    cam.getWorldDirection(_camDir);
    const angle = Math.acos(Math.min(1, Math.max(-1, _toTarget.dot(_camDir))));
    if (angle > this.maxAngle) return Infinity;
    // Angle dominates; distance only separates targets at similar angles.
    return angle * 3.2 + dist * 0.045;
  }

  acquire(candidates, { exclude = null } = {}) {
    let best = null, bestScore = Infinity;
    for (const a of candidates) {
      if (!a.alive || a === exclude) continue;
      const s = this._score(a);
      if (s < bestScore) { bestScore = s; best = a; }
    }
    return best;
  }

  set(target) {
    if (this.target === target) return;
    this.target = target;
    this.player.lockedOn = target;
    this.camera.setLockTarget(target);
    bus.emit('lockon:changed', { target });
  }

  clear() { this.set(null); }

  /** Cycle to the next target left or right of the current one. */
  cycle(candidates, direction) {
    if (!this.target) { this.set(this.acquire(candidates)); return; }
    const cam = this.camera.camera;
    const cur = _project(this.target, cam);
    let best = null, bestDx = Infinity;
    for (const a of candidates) {
      if (!a.alive || a === this.target) continue;
      if (this._score(a) === Infinity) continue;
      const p = _project(a, cam);
      const dx = p.x - cur.x;
      if (Math.sign(dx) !== direction) continue;
      const cost = Math.abs(dx) + Math.abs(p.y - cur.y) * 0.6;
      if (cost < bestDx) { bestDx = cost; best = a; }
    }
    if (best) this.set(best);
  }

  update(dt, candidates) {
    if (this._cycleCooldown > 0) this._cycleCooldown -= dt;
    if (this._recentHitTime > 0) this._recentHitTime -= dt;

    const input = this.player.world?.input ?? null;

    // Drop the lock when the target dies or leaves.
    if (this.target) {
      const d = this.target.position.distanceTo(this.player.position);
      if (!this.target.alive || d > this.breakDistance) {
        // Prefer handing off to another nearby enemy rather than dumping the
        // player back into free-look mid-fight.
        const next = this.acquire(candidates, { exclude: this.target });
        this.set(next && next.position.distanceTo(this.player.position) < 18 ? next : null);
      }
    }

    // Auto lock-on, for players who ask for it in settings.
    if (!this.target && settings.get('autoLockOn') && this._recentHitTime > 0 && this._recentHit?.alive) {
      this.set(this._recentHit);
    }
    void input;
  }

  /** Called by the input layer. Separated so the key binding lives in one place. */
  toggle(candidates) {
    if (this.target) this.clear();
    else this.set(this.acquire(candidates));
  }
}

function _project(actor, cam) {
  _screen.set(actor.position.x, actor.position.y + actor.lockOnHeight, actor.position.z).project(cam);
  return _screen;
}
