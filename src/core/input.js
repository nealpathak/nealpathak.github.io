// Unified input: keyboard, mouse-drag, touch-drag and gamepad all resolve to
// the same small axis set so the flight model never branches on device type.

const STICK_RADIUS = 110; // px of drag for full deflection

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    // Axes consumed by the ship: steer (+right), pitch (+nose up), brake 0..1.
    this.steer = 0;
    this.pitch = 0;
    this.brake = 0;
    this.invertPitch = false;
    // Active pointer drag, if any.
    this._drag = null;
    this._extraTouches = 0;
    this.anyPress = false; // consumed by menus as "start / retry"
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    addEventListener('keydown', (e) => {
      // Space and arrows would otherwise scroll the page.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.anyPress = true;
      this.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // Releasing focus must not leave a key stuck down.
    addEventListener('blur', () => { this.keys = Object.create(null); this._drag = null; this._extraTouches = 0; });

    c.addEventListener('pointerdown', (e) => {
      this.anyPress = true;
      if (this._drag === null) {
        this._drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
        // Keep receiving moves even if the finger leaves the canvas bounds.
        if (c.setPointerCapture) { try { c.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }
      } else {
        this._extraTouches++; // second finger = airbrake
      }
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      const d = this._drag;
      if (d && d.id === e.pointerId) { d.dx = e.clientX - d.x0; d.dy = e.clientY - d.y0; }
    });
    const end = (e) => {
      if (this._drag && this._drag.id === e.pointerId) this._drag = null;
      else if (this._extraTouches > 0) this._extraTouches--;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Call once per frame, before the ship reads the axes.
  update() {
    const k = this.keys;
    let steer = 0, pitch = 0, brake = 0;
    if (k.KeyA || k.ArrowLeft) steer -= 1;
    if (k.KeyD || k.ArrowRight) steer += 1;
    if (k.KeyW || k.ArrowUp) pitch += 1;
    if (k.KeyS || k.ArrowDown) pitch -= 1;
    if (k.Space || k.ShiftLeft || k.ShiftRight) brake = 1;

    const d = this._drag;
    if (d) {
      // Pointer drag overrides only the axes it actually deflects, so a player
      // can steer by drag while still braking on the keyboard.
      const sx = clamp1(d.dx / STICK_RADIUS);
      const sy = clamp1(-d.dy / STICK_RADIUS);
      if (Math.abs(sx) > 0.02) steer = sx;
      if (Math.abs(sy) > 0.02) pitch = sy;
    }
    if (this._extraTouches > 0) brake = 1;

    const gp = this._gamepad();
    if (gp) {
      if (Math.abs(gp.steer) > 0.15) steer = gp.steer;
      if (Math.abs(gp.pitch) > 0.15) pitch = gp.pitch;
      brake = Math.max(brake, gp.brake);
    }

    this.steer = clamp1(steer);
    this.pitch = clamp1(this.invertPitch ? -pitch : pitch);
    this.brake = clamp1(brake);
  }

  _gamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = p.buttons;
      if (b && b.some((x) => x && x.pressed)) this.anyPress = true;
      return {
        steer: p.axes[0] || 0,
        pitch: -(p.axes[1] || 0),
        brake: Math.max(b && b[6] ? b[6].value : 0, b && b[0] && b[0].pressed ? 1 : 0),
      };
    }
    return null;
  }

  // Menus poll this; reading it clears the latch.
  takePress() {
    const p = this.anyPress;
    this.anyPress = false;
    return p;
  }
}

function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
