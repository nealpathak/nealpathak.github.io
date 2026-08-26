// Third-person camera.
//
// A spring arm behind the player with three behaviours layered on:
//   * collision, so the arm shortens rather than clipping through a wall
//   * lock-on, where the camera frames the player and the target together
//   * shake, driven by hits and heavy landings
//
// The pivot lags the player's position but the yaw does not lag the mouse: input
// latency on the look axis is the fastest way to make a game feel bad.

import * as THREE from 'three';
import { clamp, damp, dampAngle, shortestAngle, smoothstep, TAU } from '../core/math.js';
import { settings } from '../core/settings.js';

export class ThirdPersonCamera {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;

    this.yaw = Math.PI;
    this.water = null;
    this.pitch = -0.16;
    this.minPitch = -1.06;
    this.maxPitch = 0.72;

    this.distance = 4.4;
    this.targetDistance = 4.4;
    this.minDistance = 1.1;
    this.height = 1.52;          // pivot height above the player's feet
    this.shoulder = 0.42;        // lateral offset, over the right shoulder
    this.lookAhead = 0.0;

    this.pivot = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.lockTarget = null;
    this.lockBlend = 0;

    this.shake = 0;
    this.shakeFreq = 26;
    this._shakeTime = 0;
    this._shakeOffset = new THREE.Vector3();

    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._focus = new THREE.Vector3();
    this._fovBase = camera.fov;
    this._fovTarget = camera.fov;
    this._fovCurrent = camera.fov;
  }

  /** Apply raw look input. Called every frame, before update. */
  look(dx, dy) {
    if (this.lockTarget) {
      // While locked on, the stick nudges the framing rather than orbiting.
      this.pitch = clamp(this.pitch - dy * 0.5, this.minPitch, this.maxPitch);
      return;
    }
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, this.minPitch, this.maxPitch);
    if (this.yaw > Math.PI) this.yaw -= TAU;
    if (this.yaw < -Math.PI) this.yaw += TAU;
  }

  setLockTarget(actor) {
    this.lockTarget = actor;
  }

  /** Camera-relative forward and right on the ground plane. */
  basis(outForward, outRight) {
    outForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    outRight.crossVectors(outForward, this._up).normalize().negate();
    return outForward;
  }

  addShake(amount) {
    if (settings.get('reduceFlashing')) amount *= 0.35;
    this.shake = Math.min(1.4, this.shake + amount * settings.get('cameraShake'));
  }

  /** Briefly widen the FOV — used for sprinting and boss reveals. */
  setFovBoost(extra) { this._fovTarget = this._fovBase + extra; }

  update(dt, player) {
    const feet = player.position;

    // --- pivot ---------------------------------------------------------------
    // Vertical lag is heavier than horizontal so stairs do not bounce the frame.
    this._focus.set(feet.x, feet.y + this.height * player.scale, feet.z);
    this.pivot.x = damp(this.pivot.x, this._focus.x, 16, dt);
    this.pivot.z = damp(this.pivot.z, this._focus.z, 16, dt);
    this.pivot.y = damp(this.pivot.y, this._focus.y, 7.5, dt);

    // --- lock-on -------------------------------------------------------------
    const wantLock = this.lockTarget && this.lockTarget.alive;
    this.lockBlend = damp(this.lockBlend, wantLock ? 1 : 0, 7, dt);
    if (this.lockBlend < 0.001 && !wantLock) this.lockTarget = null;

    if (wantLock) {
      const t = this.lockTarget.position;
      // Yaw toward the target, and pitch to keep both in frame: the taller the
      // target and the closer it is, the more the camera looks down on it.
      const desiredYaw = Math.atan2(this.pivot.x - t.x, this.pivot.z - t.z);
      const flatDist = Math.hypot(t.x - this.pivot.x, t.z - this.pivot.z);
      const targetEye = t.y + (this.lockTarget.eyeHeight ?? 1.3);
      const desiredPitch = clamp(
        Math.atan2(targetEye - this.pivot.y, Math.max(1.2, flatDist)) - 0.12,
        this.minPitch, this.maxPitch,
      );
      const rate = 9 * this.lockBlend;
      this.yaw = dampAngle(this.yaw, desiredYaw, rate, dt);
      this.pitch = damp(this.pitch, desiredPitch, rate * 0.7, dt);
      // Big targets need more room.
      const want = 4.4 + clamp((this.lockTarget.lockDistanceBonus ?? 0), 0, 4);
      this.targetDistance = want;
    } else {
      this.targetDistance = 4.4;
    }

    // Pull in when looking steeply down, or the camera ends up in the floor.
    const pitchPull = smoothstep((-this.pitch - 0.35) / 0.7) * 1.5;
    let want = this.targetDistance - pitchPull;

    // --- collision -----------------------------------------------------------
    this._dir.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();

    if (this.collision) {
      const margin = 0.34;
      const hit = this.collision.raycast(this.pivot, this._dir, want + margin);
      if (hit < want + margin) want = Math.max(this.minDistance, hit - margin);
    }

    // Snapping in is instant (you must never see through a wall); easing out is
    // slow, so brushing a pillar does not fling the camera back.
    this.distance = want < this.distance
      ? want
      : damp(this.distance, want, 4.5, dt);

    // --- final transform -----------------------------------------------------
    this.desired.copy(this.pivot).addScaledVector(this._dir, this.distance);

    // Shoulder offset, faded out as the camera comes in close.
    const shoulderAmt = this.shoulder * smoothstep((this.distance - 1.4) / 1.6) * (1 - this.lockBlend * 0.55);
    this._tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(shoulderAmt);
    this.desired.add(this._tmp);

    // Shake: a decaying, high-frequency wobble in view space.
    if (this.shake > 0.0005) {
      this._shakeTime += dt;
      const k = this.shake * this.shake;
      const t = this._shakeTime * this.shakeFreq;
      this._shakeOffset.set(
        Math.sin(t * 1.13) * 0.10 * k,
        Math.sin(t * 1.67 + 1.2) * 0.085 * k,
        Math.sin(t * 0.91 + 2.4) * 0.05 * k,
      );
      this.desired.add(this._shakeOffset);
      this.shake = Math.max(0, this.shake - dt * 3.4);
    }

    // The camera must never end up under a water surface. A single plane seen
    // from below is an opaque sheet across the lower half of the screen, and
    // wading is common enough that letting it happen is not an option.
    const water = this.water;
    if (water) {
      const floor = water.level + 0.45;
      if (this.desired.y < floor && water.covers(this.desired.x, this.desired.z)) {
        this.desired.y = floor;
      }
    }

    this.camera.position.copy(this.desired);

    // Aim at the pivot, or between the player and the lock target.
    this._tmp.copy(this.pivot);
    if (wantLock) {
      const t = this.lockTarget.position;
      _look.set(t.x, t.y + (this.lockTarget.eyeHeight ?? 1.3), t.z);
      this._tmp.lerp(_look, 0.34 * this.lockBlend);
    }
    if (this.shake > 0.0005) this._tmp.add(this._shakeOffset);
    this.camera.lookAt(this._tmp);

    // FOV: eased so a sprint boost feels like acceleration, not a cut.
    this._fovCurrent = damp(this._fovCurrent, this._fovTarget, 5, dt);
    if (Math.abs(this.camera.fov - this._fovCurrent) > 0.01) {
      this.camera.fov = this._fovCurrent;
      this.camera.updateProjectionMatrix();
    }
    this._fovTarget = this._fovBase;   // callers re-assert a boost each frame
  }

  setBaseFov(deg) {
    this._fovBase = deg;
    this._fovTarget = deg;
  }

  /** Snap instantly — used on respawn and fast travel. */
  snapTo(player) {
    this._focus.set(player.position.x, player.position.y + this.height * player.scale, player.position.z);
    this.pivot.copy(this._focus);
    this.distance = this.targetDistance;
    this.update(1 / 60, player);
  }

  /** Angle from the camera's forward to a world point, for off-screen markers. */
  angleTo(point) {
    this._tmp.copy(point).sub(this.camera.position);
    this.camera.getWorldDirection(_look);
    return shortestAngle(Math.atan2(_look.x, _look.z), Math.atan2(this._tmp.x, this._tmp.z));
  }
}

const _look = new THREE.Vector3();
