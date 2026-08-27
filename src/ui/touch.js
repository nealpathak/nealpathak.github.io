// On-screen controls.
//
// A personal site is opened on a phone far more often than on a desktop, and
// until this existed a phone visitor got a game they could look at and not
// play. Everything here drives the same named actions the keyboard does, so
// nothing downstream knows the difference.
//
// The layout is built around where thumbs actually reach on a held phone:
// movement is a floating stick anywhere in the left half, the camera is a drag
// anywhere in the right half that is not a button, and the buttons sit in an
// arc inside the right thumb's sweep. Nothing is placed in the middle of the
// screen, because that is where the game is.

import { bus } from '../core/events.js';

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

/** Does this device want on-screen controls? */
export function wantsTouch() {
  const params = new URLSearchParams(location.search);
  if (params.has('touch')) return params.get('touch') !== '0';
  if (typeof matchMedia !== 'function') return false;
  // Coarse pointer AND no hover: a touchscreen laptop has both, and should keep
  // its keyboard.
  return matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;
}

// The primary cluster is a 3x3 grid anchored to the bottom-right corner, in
// the order a right thumb reaches them: the things you press without thinking
// sit lowest and rightmost, and the things you press on purpose sit above and
// to the left. Absolute pixel offsets were tried first and fell off the bottom
// of a landscape phone, which is the shape most people will hold.
const PRIMARY = [
  { action: 'lockOn', label: 'Lock', cls: 'tb--lock' },
  { action: 'parry', label: 'Par', cls: 'tb--parry' },
  { action: 'guard', label: 'Grd', cls: 'tb--guard' },
  { action: 'interact', label: 'Use', cls: 'tb--use' },
  { action: 'heavyAttack', label: 'Hvy', cls: 'tb--hvy' },
  { action: 'lightAttack', label: 'Atk', cls: 'tb--atk' },
  { action: 'heal', label: 'Heal', cls: 'tb--heal' },
  { action: 'dodge', label: 'Roll', cls: 'tb--dodge' },
];

// Deliberate actions, out of the reflex zone entirely.
const SECONDARY = [
  { action: 'skill', label: 'Skill', cls: 'tb--skill' },
  { action: 'bind', label: 'Bind', cls: 'tb--bind' },
  { action: 'menu', label: '❚❚', cls: 'tb--menu' },
];

export class TouchControls {
  constructor(root, engine, game) {
    this.engine = engine;
    this.game = game;
    this.input = engine.input;
    this.input.touchEnabled = true;

    this.root = el('div', 'touch', root);
    this.stick = el('div', 'touch-stick', this.root);
    this.stickKnob = el('div', 'touch-stick__knob', this.stick);
    this.pad = el('div', 'touch-pad', this.root);
    this.top = el('div', 'touch-top', this.root);

    for (const b of PRIMARY) this._button(b, this.pad);
    for (const b of SECONDARY) this._button(b, this.top);

    bus.on('input:stick', ({ stick }) => this._drawStick(stick));
    this.setVisible(false);
  }

  _button(b, parent) {
    const node = el('button', `touch-btn ${b.cls}`, parent);
    el('span', 'touch-btn__label', node, b.label);
    node.type = 'button';
    node.dataset.action = b.action;
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Capture keeps a held guard held when the thumb slides off. It throws
      // for a pointer the element never actually received, which is exactly
      // what a synthetic event is, so it must not be allowed to abort the
      // press it is only there to improve.
      try { node.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
      node.classList.add('is-down');
      this._press(b.action);
    });
    const up = (e) => {
      e.stopPropagation();
      node.classList.remove('is-down');
      this._release(b.action);
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    return node;
  }

  _press(action) {
    if (action === 'menu') { this._toggleMenu(); return; }
    this.input._press(action);
  }

  _release(action) {
    if (action === 'menu') return;
    this.input._release(action);
  }

  _toggleMenu() {
    const g = this.game;
    if (g.mode === 'playing') g.pause();
    else if (g.mode === 'paused') g.resume();
  }

  _drawStick(stick) {
    if (!stick) { this.stick.classList.remove('is-live'); return; }
    this.stick.classList.add('is-live');
    this.stick.style.left = `${stick.ox}px`;
    this.stick.style.top = `${stick.oy}px`;
    const r = this.input.stickRadius;
    this.stickKnob.style.transform = `translate(-50%, -50%) translate(${stick.x * r}px, ${stick.y * r}px)`;
  }

  setVisible(v) {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
    if (!v) this._drawStick(null);
  }
}
