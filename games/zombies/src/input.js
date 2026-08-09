// Keyboard + pointer-locked mouse.
//
// Mouse deltas accumulate and are drained once per frame by whoever wants them.
// No smoothing anywhere: smoothing on aim is just input lag wearing a hat.

export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.locked = false;
    this.dx = 0;
    this.dy = 0;
    this.firePressed = false;   // edge: consumed by the weapon
    this.fireHeld = false;
    this.sensitivity = 0.0022;  // radians per pixel of mouse travel

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
      if (!this.locked || e.button !== 0) return;
      this.firePressed = true;
      this.fireHeld = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; });
  }

  _releaseAll() {
    this.keys.clear();
    this.fireHeld = false;
    this.firePressed = false;
    this.dx = this.dy = 0;
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
    const yaw = -this.dx * this.sensitivity;
    const pitch = -this.dy * this.sensitivity;
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
