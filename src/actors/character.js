// A character: skeleton + body + animator, with the plumbing every actor needs.
//
// Player, enemies and companions all extend Actor (which owns this), so a
// change to how animation events are routed happens once.

import * as THREE from 'three';
import { Skeleton } from '../anim/skeleton.js';
import { Animator } from '../anim/animator.js';
import { UPPER_BODY_MASK } from '../anim/skeleton.js';
import { Body, makeBlobShadow } from './body.js';
import { clip, makeLocomotionBlend, makeStrafeBlend } from '../anim/library.js';

export class Character {
  /**
   * @param {object} opts
   * @param {object} opts.look      body appearance, see DEFAULT_LOOK
   * @param {number} opts.scale     1 = a 1.75m human
   * @param {boolean} [opts.cape]
   */
  constructor({ look = {}, scale = 1, blobShadow = true } = {}) {
    this.scale = scale;
    this.skeleton = new Skeleton(scale);
    this.body = new Body(this.skeleton, look);
    this.animator = new Animator(this.skeleton);

    // Root holds the skeleton and anything world-anchored (blob shadow, cape).
    this.root = new THREE.Group();
    this.root.add(this.skeleton.root);

    this.locomotion = makeLocomotionBlend();
    this.strafe = makeStrafeBlend();

    this.base = this.animator.addLayer('base', { weight: 1 });
    this.upper = this.animator.addLayer('upper', { mask: UPPER_BODY_MASK, weight: 0 });
    this.base.play(this.locomotion, { fade: 0 });

    this.onAnimEvent = null;
    const route = (e, layer) => this.onAnimEvent?.(e, layer);
    this.base.onEvent = route;
    this.upper.onEvent = route;

    if (blobShadow) {
      this.blob = makeBlobShadow(0.44 * scale);
      this.root.add(this.blob);
    }

    // The cape lives in world space, so it hangs off the scene, not the root.
    this.capeMesh = this.body.cape?.mesh ?? null;

    this._flashTime = 0;
    this._flashColor = new THREE.Color(0xffffff);
  }

  /** Add every renderable this character owns to a scene. */
  addTo(scene) {
    scene.add(this.root);
    if (this.capeMesh) scene.add(this.capeMesh);
    return this;
  }

  removeFrom(scene) {
    scene.remove(this.root);
    if (this.capeMesh) scene.remove(this.capeMesh);
  }

  /** Drive the free-movement blend from ground speed in m/s. */
  setSpeed(speed) { this.locomotion.set(speed); }

  /** Drive the locked-on blend. x is strafe (+ = left), y is forward. */
  setStrafe(x, y) { this.strafe.set(x, y); }

  /** Switch the base layer between free and locked-on locomotion. */
  useLocomotion(lockedOn, fade = 0.22) {
    const want = lockedOn ? this.strafe : this.locomotion;
    if (this.base.motion !== want) this.base.play(want, { fade });
  }

  /** Play a one-shot on the base layer (rolls, staggers, deaths). */
  playFull(name, opts = {}) {
    this.upper.weight = 0;
    this.base.play(typeof name === 'string' ? clip(name) : name, { fade: 0.10, restart: true, ...opts });
    return this;
  }

  /** Play a one-shot on the upper body only, so the legs keep walking. */
  playUpper(name, opts = {}) {
    this.upper.weight = 1;
    this.upper.play(typeof name === 'string' ? clip(name) : name, { fade: 0.08, restart: true, ...opts });
    return this;
  }

  /** Fade the upper layer back out — call when an attack recovers. */
  releaseUpper(fade = 0.18) { this._upperFadeOut = fade; }

  /** A one-frame white flash on being hit. */
  flash(color = 0xffffff, duration = 0.09) {
    this._flashColor.set(color);
    this._flashTime = duration;
    this._flashDuration = duration;
  }

  setLookAt(target, weight = 1) {
    const la = this.animator.lookAt;
    if (!target) { la.enabled = false; la.weight = 0; return; }
    la.enabled = true;
    la.target.copy(target);
    la.weight = weight;
  }

  setLean(pitch, roll) {
    this.animator.lean.pitch = pitch;
    this.animator.lean.roll = roll;
  }

  update(dt) {
    // The cape samples bone world matrices, and bones hang off this root. The
    // scene graph is not flushed until render, so flush this branch ourselves.
    this.root.updateMatrixWorld(true);

    if (this._upperFadeOut) {
      this.upper.weight = Math.max(0, this.upper.weight - dt / this._upperFadeOut);
      if (this.upper.weight <= 0) this._upperFadeOut = 0;
    }
    this.animator.update(dt);
    this.animator.evaluate(dt);

    if (this._flashTime > 0) {
      this._flashTime -= dt;
      const k = Math.max(0, this._flashTime / this._flashDuration);
      this.body.setEmissive(this._flashColor, k * 1.6);
      if (this._flashTime <= 0) this.body.setEmissive(0x000000, 0);
    }

    this.body.update(dt);
  }

  dispose() { this.body.dispose(); }
}
