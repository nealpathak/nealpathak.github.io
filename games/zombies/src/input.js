// Keyboard + pointer-locked mouse.
//
// Mouse deltas accumulate and are drained once per frame by whoever wants them.
// No smoothing anywhere: smoothing on aim is just input lag wearing a hat.

import { BASE_SENSITIVITY } from './settings.js';

export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.locked = false;
    this.dx = 0;
    this.dy = 0;
    this.firePressed = false;   // edge: consumed by the weapon
    this.fireHeld = false;
    this.aiming = false;        // right mouse held
    this.sensitivity = BASE_SENSITIVITY;
    this.invertY = false;
    this.aimFactor = 1;         // sensitivity multiplier while aiming

    /** @type {(locked:boolean)=>void} */
    this.onLockChange = () => {};

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      // Don't fight the browser over reload/devtools/tab.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
    });

    addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Anything that steals focus should also release every key, or you come
    // back from alt-tab still sprinting into a wall.
    addEventListener('blur', () => this._releaseAll());

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.el;
      this.locked = locked;
      if (!locked) this._releaseAll();
      this.onLockChange(locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    });

    this.el.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.firePressed = true; this.fireHeld = true; }
      if (e.button === 2) { this.aiming = true; e.preventDefault(); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aiming = false;
    });

    // Right-click is aim-down-sights; the context menu would eat it.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _releaseAll() {
    this.keys.clear();
    this.fireHeld = false;
    this.firePressed = false;
    this.aiming = false;
    this.dx = this.dy = 0;
  }

  applySettings(s) {
    this.sensitivity = BASE_SENSITIVITY * s.sensitivity;
    this.invertY = !!s.invertY;
  }

  async lock() {
    if (this.locked) return;
    try {
      await this.el.requestPointerLock();
    } catch {
      // Browsers throttle re-locking right after an Esc. The overlay stays up
      // and the player can just click again.
    }
  }

  unlock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Mouse travel since the last call, in radians. Zeroes the accumulator. */
  takeLook() {
    // Aiming scales sensitivity down with the zoom, so the same hand movement
    // covers the same arc of the world rather than whipping past the target.
    const s = this.sensitivity * this.aimFactor;
    const yaw = -this.dx * s;
    const pitch = (this.invertY ? this.dy : -this.dy) * s;
    this.dx = this.dy = 0;
    return { yaw, pitch };
  }

  /** True once per press. */
  takeFire() {
    const p = this.firePressed;
    this.firePressed = false;
    return p;
  }

  down(code) { return this.keys.has(code); }
}
