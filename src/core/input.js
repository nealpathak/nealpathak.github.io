// Input: keyboard + mouse (pointer lock), gamepad and touch, unified behind
// named actions.
//
// Three things here matter for how the game feels:
//   1. Input buffering. Souls-likes let you queue the next attack during the
//      recovery of the current one. `consume()` is that queue.
//   2. Tap vs hold on the same button. Tap dodge = roll, hold = sprint. This
//      is what makes the on-screen dodge button worth having: the same control
//      is a roll and a sprint on a phone exactly as it is on a keyboard.
//   3. Touch drives `move` and `look` through the same fields the stick and the
//      mouse write, so nothing downstream of here knows or cares which it was.

import { clamp } from './math.js';
import { bus } from './events.js';

// The on-screen stick is drawn by the UI, not here, so the input layer stays
// free of DOM beyond the listeners it needs.
function bus_emitStick(stick) { bus.emit('input:stick', { stick }); }

export const ACTIONS = {
  moveF: 'moveF', moveB: 'moveB', moveL: 'moveL', moveR: 'moveR',
  lightAttack: 'lightAttack', heavyAttack: 'heavyAttack',
  guard: 'guard', parry: 'parry',
  dodge: 'dodge',           // tap = roll, hold = sprint
  interact: 'interact',
  heal: 'heal',
  lockOn: 'lockOn',
  skill: 'skill',           // Wisp / companion skill
  bind: 'bind',             // throw an Ember Sigil
  swapTarget: 'swapTarget',
  menu: 'menu', map: 'map', inventory: 'inventory', covenant: 'covenant',
  cycleItemL: 'cycleItemL', cycleItemR: 'cycleItemR',
  command: 'command',       // party command wheel
};

// Shift is a modifier, not an action: Shift+LMB is the heavy attack, Shift+RMB
// is the parry. That keeps both attack strengths and both defences on the mouse
// without asking the player to let go of WASD.
const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight']);

const DEFAULT_KEYS = {
  KeyW: 'moveF', KeyS: 'moveB', KeyA: 'moveL', KeyD: 'moveR',
  ArrowUp: 'moveF', ArrowDown: 'moveB', ArrowLeft: 'moveL', ArrowRight: 'moveR',
  Space: 'dodge',
  KeyE: 'interact', KeyR: 'heal', KeyQ: 'lockOn', KeyV: 'skill', KeyG: 'bind',
  KeyC: 'command', Tab: 'swapTarget', KeyF: 'parry',
  Escape: 'menu', KeyM: 'map', KeyI: 'inventory', KeyP: 'covenant',
  Digit1: 'cycleItemL', Digit2: 'cycleItemR',
};

// mouse button index -> [action, actionWhileModifierHeld]
const DEFAULT_MOUSE = {
  0: ['lightAttack', 'heavyAttack'],
  2: ['guard', 'parry'],
  1: ['lockOn', 'lockOn'],
  3: ['cycleItemL', 'cycleItemL'],
  4: ['cycleItemR', 'cycleItemR'],
};

// Standard gamepad mapping (Xbox layout)
const DEFAULT_PAD_BUTTONS = {
  0: 'interact',      // A
  1: 'dodge',         // B
  2: 'heal',          // X
  3: 'bind',          // Y
  4: 'parry',         // LB
  5: 'lightAttack',   // RB
  6: 'skill',         // LT
  7: 'guard',         // RT  (analog, see below)
  8: 'map',           // back
  9: 'menu',          // start
  10: 'lockOn',       // L3
  11: 'lockOn',       // R3
  12: 'cycleItemL', 13: 'cycleItemR', 14: 'command', 15: 'swapTarget',
};

class ActionState {
  constructor() {
    this.down = false;
    this.pressedAt = -Infinity;   // time of most recent press
    this.releasedAt = -Infinity;
    this.consumedAt = -Infinity;  // guards against double-consuming one press
    this.heldSince = -Infinity;
  }
}

export class Input {
  constructor(target = window) {
    this.target = target;
    this.time = 0;
    this.actions = new Map();
    for (const a of Object.values(ACTIONS)) this.actions.set(a, new ActionState());

    this.keys = { ...DEFAULT_KEYS };
    this.mouse = { ...DEFAULT_MOUSE };

    this.look = { x: 0, y: 0 };       // accumulated look delta this frame
    this.move = { x: 0, y: 0 };       // analog move, -1..1, y is forward
    this.sensitivity = 0.0022;
    this.padSensitivity = 2.6;
    this.invertY = false;
    this.pointerLocked = false;
    this.usingGamepad = false;
    this.usingTouch = false;
    // Set by the on-screen controls when they exist. Pointers that begin on a
    // button belong to that button and must not also steer the camera.
    this.touchEnabled = false;
    this._stick = null;          // { id, ox, oy, x, y }
    this._lookTouch = null;      // { id, x, y }
    this._touchMove = { x: 0, y: 0 };
    this.padIndex = -1;
    this.deadzone = 0.18;
    this.stickRadius = 58;         // px from the thumb's landing point to full tilt
    this.touchLookScale = 1.35;    // px of drag -> px of mouse-equivalent look
    this.enabled = true;
    this.modifier = false;

    // Which action a mouse button actually triggered, so mouseup releases the
    // same one even if the modifier changed while the button was down.
    this._mouseHeld = new Map();
    this._rawLook = { x: 0, y: 0 };
    this._blockedKeys = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    this._bind();
  }

  _bind() {
    const t = this.target;
    this._onKeyDown = (e) => {
      if (this._blockedKeys.has(e.code)) e.preventDefault();
      if (MODIFIER_CODES.has(e.code)) this.modifier = true;
      if (e.repeat) return;
      const action = this.keys[e.code];
      if (action) this._press(action);
      this.usingGamepad = false;
    };
    this._onKeyUp = (e) => {
      if (MODIFIER_CODES.has(e.code)) this.modifier = false;
      const action = this.keys[e.code];
      if (action) this._release(action);
    };
    this._onMouseDown = (e) => {
      if (!this.pointerLocked) return;
      const pair = this.mouse[e.button];
      if (!pair) return;
      const action = this.modifier ? pair[1] : pair[0];
      e.preventDefault();
      this._mouseHeld.set(e.button, action);
      this._press(action);
    };
    this._onMouseUp = (e) => {
      const action = this._mouseHeld.get(e.button);
      if (action) { this._mouseHeld.delete(e.button); this._release(action); }
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this._rawLook.x += e.movementX || 0;
      this._rawLook.y += e.movementY || 0;
      this.usingGamepad = false;
    };
    this._onWheel = (e) => { this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); };
    this._onContext = (e) => { if (this.pointerLocked) e.preventDefault(); };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement != null;
      if (!this.pointerLocked) this.releaseAll();
    };
    this._onBlur = () => this.releaseAll();
    this._onPadConnect = (e) => { this.padIndex = e.gamepad.index; };

    // Touch. Pointer events rather than touch events, so a stylus or a
    // touchscreen laptop behaves the same as a phone.
    this._onPointerDown = (e) => {
      if (!this.touchEnabled || e.pointerType === 'mouse') return;
      if (e.target?.closest?.('.touch-btn, .menu, .rest, .pause, button')) return;
      this.usingTouch = true;
      this.usingGamepad = false;
      const half = window.innerWidth * 0.5;
      if (e.clientX < half && !this._stick) {
        // The stick centres wherever the thumb lands, which is the only way a
        // virtual stick is usable without looking at it.
        this._stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
        bus_emitStick(this._stick);
      } else if (!this._lookTouch) {
        this._lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      }
    };
    this._onPointerMove = (e) => {
      if (!this.touchEnabled || e.pointerType === 'mouse') return;
      const st = this._stick;
      if (st && st.id === e.pointerId) {
        const dx = e.clientX - st.ox, dy = e.clientY - st.oy;
        const r = this.stickRadius;
        const len = Math.hypot(dx, dy);
        const k = len > r ? r / len : 1;
        st.x = (dx * k) / r;
        st.y = (dy * k) / r;
        // Dragging past the ring drags the ring with it, so a long push does
        // not run out of stick.
        if (len > r) { st.ox += dx * (1 - k); st.oy += dy * (1 - k); }
        this._touchMove.x = st.x;
        this._touchMove.y = -st.y;
        bus_emitStick(st);
        return;
      }
      const lk = this._lookTouch;
      if (lk && lk.id === e.pointerId) {
        this._rawLook.x += (e.clientX - lk.x) * this.touchLookScale;
        this._rawLook.y += (e.clientY - lk.y) * this.touchLookScale;
        lk.moved += Math.abs(e.clientX - lk.x) + Math.abs(e.clientY - lk.y);
        lk.x = e.clientX; lk.y = e.clientY;
      }
    };
    this._onPointerUp = (e) => {
      if (this._stick?.id === e.pointerId) {
        this._stick = null;
        this._touchMove.x = this._touchMove.y = 0;
        bus_emitStick(null);
      }
      if (this._lookTouch?.id === e.pointerId) this._lookTouch = null;
    };

    t.addEventListener('keydown', this._onKeyDown);
    t.addEventListener('keyup', this._onKeyUp);
    t.addEventListener('mousedown', this._onMouseDown);
    t.addEventListener('mouseup', this._onMouseUp);
    t.addEventListener('mousemove', this._onMouseMove);
    t.addEventListener('wheel', this._onWheel, { passive: true });
    t.addEventListener('contextmenu', this._onContext);
    t.addEventListener('blur', this._onBlur);
    t.addEventListener('pointerdown', this._onPointerDown);
    t.addEventListener('pointermove', this._onPointerMove);
    t.addEventListener('pointerup', this._onPointerUp);
    t.addEventListener('pointercancel', this._onPointerUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('gamepadconnected', this._onPadConnect);
  }

  dispose() {
    const t = this.target;
    t.removeEventListener('keydown', this._onKeyDown);
    t.removeEventListener('keyup', this._onKeyUp);
    t.removeEventListener('mousedown', this._onMouseDown);
    t.removeEventListener('mouseup', this._onMouseUp);
    t.removeEventListener('mousemove', this._onMouseMove);
    t.removeEventListener('wheel', this._onWheel);
    t.removeEventListener('contextmenu', this._onContext);
    t.removeEventListener('blur', this._onBlur);
    t.removeEventListener('pointerdown', this._onPointerDown);
    t.removeEventListener('pointermove', this._onPointerMove);
    t.removeEventListener('pointerup', this._onPointerUp);
    t.removeEventListener('pointercancel', this._onPointerUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('gamepadconnected', this._onPadConnect);
  }

  _press(action) {
    const s = this.actions.get(action);
    if (!s || s.down) return;
    s.down = true;
    s.pressedAt = this.time;
    s.heldSince = this.time;
  }

  _release(action) {
    const s = this.actions.get(action);
    if (!s || !s.down) return;
    s.down = false;
    s.releasedAt = this.time;
  }

  releaseAll() {
    for (const [name, s] of this.actions) if (s.down) this._release(name);
    this._mouseHeld.clear();
    this.modifier = false;
    this.move.x = this.move.y = 0;
    this._stick = null;
    this._lookTouch = null;
    this._touchMove.x = this._touchMove.y = 0;
    bus_emitStick(null);
  }

  /**
   * Ask for pointer lock. Browsers refuse this outside a user gesture and some
   * refuse `unadjustedMovement` outright, so every path here swallows its own
   * failure: a refused lock is a normal thing that happens, not an error the
   * player should ever see.
   */
  requestPointerLock(el) {
    // A touch device has no pointer to lock, and asking wakes a permission
    // prompt on some browsers for a capability the player will never use.
    if (this.touchEnabled || !el || document.pointerLockElement === el) return;
    // Both the options form and the bare form can throw synchronously OR
    // return a promise that rejects, depending on the browser and on whether a
    // gesture is in progress. Every one of those four paths has to be
    // swallowed, or a refused lock surfaces as an uncaught error.
    const attempt = (arg) => {
      try {
        const p = arg === undefined ? el.requestPointerLock?.() : el.requestPointerLock?.(arg);
        return p && typeof p.catch === 'function' ? p : null;
      } catch { return null; }
    };
    const first = attempt({ unadjustedMovement: true });
    if (first) first.catch(() => { const second = attempt(); if (second) second.catch(() => {}); });
  }

  exitPointerLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // ---- queries -------------------------------------------------------------

  /** Is the action currently held? */
  held(action) { return this.enabled && (this.actions.get(action)?.down ?? false); }

  /** Seconds the action has been held, or 0. */
  heldFor(action) {
    const s = this.actions.get(action);
    return s && s.down ? this.time - s.heldSince : 0;
  }

  /** Was it pressed within `window` seconds and not yet consumed? Consumes it. */
  consume(action, window = 0.18) {
    if (!this.enabled) return false;
    const s = this.actions.get(action);
    if (!s) return false;
    if (s.pressedAt <= s.consumedAt) return false;
    if (this.time - s.pressedAt > window) return false;
    s.consumedAt = this.time;
    return true;
  }

  /** Peek without consuming. */
  buffered(action, window = 0.18) {
    const s = this.actions.get(action);
    return !!s && this.enabled && s.pressedAt > s.consumedAt && this.time - s.pressedAt <= window;
  }

  /** A release that happened within `window` and was a short tap. Consumes. */
  consumeTap(action, maxHold = 0.22, window = 0.2) {
    if (!this.enabled) return false;
    const s = this.actions.get(action);
    if (!s || s.down) return false;
    if (s.releasedAt <= s.consumedAt) return false;
    if (this.time - s.releasedAt > window) return false;
    if (s.releasedAt - s.pressedAt > maxHold) return false;
    s.consumedAt = this.time;
    return true;
  }

  clearBuffer(action) {
    const s = this.actions.get(action);
    if (s) s.consumedAt = this.time;
  }

  clearAllBuffers() { for (const s of this.actions.values()) s.consumedAt = this.time; }

  // ---- per-frame update ----------------------------------------------------

  update(dt) {
    this.time += dt;

    // Keyboard move vector -> analog, normalised so diagonals aren't faster.
    let kx = (this.held('moveR') ? 1 : 0) - (this.held('moveL') ? 1 : 0);
    let ky = (this.held('moveF') ? 1 : 0) - (this.held('moveB') ? 1 : 0);
    const kLen = Math.hypot(kx, ky);
    if (kLen > 1) { kx /= kLen; ky /= kLen; }

    this.look.x = this._rawLook.x * this.sensitivity;
    this.look.y = this._rawLook.y * this.sensitivity * (this.invertY ? -1 : 1);
    this._rawLook.x = this._rawLook.y = 0;

    const pad = this._pollGamepad(dt);
    if (pad && (Math.hypot(pad.mx, pad.my) > 0.01 || Math.hypot(pad.lx, pad.ly) > 0.01)) {
      this.usingGamepad = true;
    }
    if (pad && this.usingGamepad) {
      this.move.x = pad.mx; this.move.y = pad.my;
      this.look.x += pad.lx * this.padSensitivity * dt;
      this.look.y += pad.ly * this.padSensitivity * dt * (this.invertY ? -1 : 1);
    } else if (this.usingTouch && (this._stick || kLen === 0)) {
      this.move.x = this._touchMove.x; this.move.y = this._touchMove.y;
    } else {
      this.move.x = kx; this.move.y = ky;
    }
    if (!this.enabled) { this.move.x = this.move.y = 0; this.look.x = this.look.y = 0; }
  }

  _applyDeadzone(x, y) {
    const len = Math.hypot(x, y);
    if (len < this.deadzone) return [0, 0];
    const scaled = (len - this.deadzone) / (1 - this.deadzone);
    const k = clamp(scaled, 0, 1) / len;
    return [x * k, y * k];
  }

  _pollGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let pad = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!pad || !pad.connected) {
      pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; this.padIndex = p.index; break; }
    }
    if (!pad) return null;

    const [mx, my] = this._applyDeadzone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
    const [lx, ly] = this._applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);

    for (const [idxStr, action] of Object.entries(DEFAULT_PAD_BUTTONS)) {
      const b = pad.buttons[+idxStr];
      if (!b) continue;
      const pressed = b.pressed || b.value > 0.5;
      const s = this.actions.get(action);
      if (!s) continue;
      if (pressed && !s.down) this._press(action);
      else if (!pressed && s.down) this._release(action);
    }
    // Triggers are analog on most pads: RT past half is guard, LT is the skill.
    // A heavy attack on the pad is RB while LB is held.
    if (this.held('parry') && this.buffered('lightAttack', 0.05)) {
      this.clearBuffer('lightAttack');
      this._press('heavyAttack');
      this._release('heavyAttack');
    }
    return { mx, my, lx, ly };
  }
}
