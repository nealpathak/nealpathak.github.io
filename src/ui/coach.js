// Contextual teaching and companion speech.
//
// No tutorial level: the game teaches by noticing what has just become
// relevant and saying one line about it, once. Every hint fires at most once
// per save and can be turned off entirely.

import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';

const SEEN_KEY = 'emberwake.hints.v1';

/**
 * [id, text] — kept short enough to read without stopping.
 *
 * Hints that name a key have a touch wording too, because telling someone on a
 * phone to press R is worse than saying nothing: it teaches them the game was
 * not built for the thing they are holding.
 */
const HINTS = {
  move: [
    'Move with W A S D. The camera follows the mouse.',
    'Drag the left of the screen to move. Drag the right to look.',
  ],
  sprint: [
    'Hold Space to sprint. Tap it to roll — rolling has invincibility frames, sprinting does not.',
    'Hold Roll to sprint. Tap it to roll — rolling has invincibility frames, sprinting does not.',
  ],
  firstEnemy: [
    'Lock on with Q. Locked on, you strafe instead of turning, and the camera keeps both of you in frame.',
    'Tap Lock to lock on. Locked on, you strafe instead of turning, and the camera keeps both of you in frame.',
  ],
  stamina: ['Attacks, rolls and blocking all cost stamina. Running out mid-guard breaks it.'],
  lowHealth: [
    'Press R to drink. It takes a moment — make the space first.',
    'Tap Heal to drink. It takes a moment — make the space first.',
  ],
  guard: [
    'Hold right mouse to guard. Shift + right mouse parries, which is riskier and far better.',
    'Hold Grd to guard. Par parries, which is riskier and far better.',
  ],
  parry: [
    'Parried. Press E now for a riposte, before they recover.',
    'Parried. Tap Use now for a riposte, before they recover.',
  ],
  backstab: [
    'Something has not noticed you. Get behind it and press E.',
    'Something has not noticed you. Get behind it and tap Use.',
  ],
  shrine: ['Resting refills your flask and heals you — and wakes every enemy in the vale.'],
  cindersLost: ['Your cinders are where you fell. Reach them without dying again and they are yours.'],
  bindable: [
    'That spirit can be bound. Get it below a third of its health, then press G to throw a sigil.',
    'That spirit can be bound. Get it below a third of its health, then tap Bind.',
  ],
  affinity: ['Ember beats Bloom beats Tide beats Ember. Radiance and Void tear each other apart.'],
  levelUp: ['You can afford a level. Rest at an Emberwake to spend cinders.'],
  boss: ['It will not follow you out of this ground. Neither will your mistakes.'],
};

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

export class Coach {
  constructor(root, game) {
    this.game = game;
    this.seen = new Set(this._load());
    this.queue = [];
    this.current = null;
    this.timer = 0;

    this.el = el('div', 'coach', root);
    this.text = el('p', 'coach__text', this.el);
    this.el.style.display = 'none';

    this.speech = el('div', 'speech', root);
    this.speech.style.display = 'none';
    this.speechWho = el('span', 'speech__who', this.speech);
    this.speechText = el('p', 'speech__text', this.speech);
    this._speechTimer = 0;

    this._wire();
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; }
  }

  _save() {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ }
  }

  reset() { this.seen.clear(); this._save(); }

  show(id) {
    if (!settings.get('showTutorialHints')) return;
    if (this.seen.has(id) || !HINTS[id]) return;
    this.seen.add(id);
    this._save();
    // Index 1 is the touch wording where a hint has one; most do not, because
    // most hints name a system rather than a control.
    const lines = HINTS[id];
    const touch = document.documentElement.classList.contains('is-touch');
    this.queue.push((touch && lines[1]) || lines[0]);
  }

  say(who, text, duration = 4.5) {
    this.speech.style.display = '';
    this.speechWho.textContent = who;
    this.speechText.textContent = text;
    this.speech.classList.add('speech--in');
    this._speechTimer = duration;
  }

  _wire() {
    bus.on('game:started', () => { this.show('move'); setTimeout(() => this.show('sprint'), 9000); });
    bus.on('enemy:aggro', ({ enemy }) => {
      this.show('firstEnemy');
      if (enemy.bindable) this.show('bindable');
      if (enemy.isBoss) this.show('boss');
    });
    bus.on('player:noStamina', () => this.show('stamina'));
    bus.on('player:blocked', () => this.show('guard'));
    bus.on('combat:parried', ({ defender }) => {
      if (defender === this.game.player) this.show('parry');
    });
    bus.on('enemy:staggered', () => this.show('backstab'));
    bus.on('player:interactTarget', ({ target }) => {
      if (target?.type === 'shrine') this.show('shrine');
    });
    bus.on('player:died', () => this.show('cindersLost'));
    bus.on('combat:hit', ({ report }) => {
      if (report.relation === 'advantage' || report.relation === 'disadvantage') this.show('affinity');
    });
    bus.on('ui:speech', ({ who, text }) => this.say(who, text));
    bus.on('ui:hint', ({ id }) => this.show(id));
  }

  update(dt) {
    const p = this.game.player;
    if (p.alive && p.healthFraction < 0.32) this.show('lowHealth');
    if (p.cinders >= this.game.progression?.levelCost()) this.show('levelUp');

    if (this._speechTimer > 0) {
      this._speechTimer -= dt;
      if (this._speechTimer <= 0) {
        this.speech.classList.remove('speech--in');
        setTimeout(() => { if (this._speechTimer <= 0) this.speech.style.display = 'none'; }, 400);
      }
    }

    if (this.current) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.el.classList.remove('coach--in');
        this.current = null;
        this.timer = 0.5;
      }
      return;
    }
    if (this.timer > 0) { this.timer -= dt; return; }
    if (!this.queue.length) { this.el.style.display = 'none'; return; }

    this.current = this.queue.shift();
    this.text.textContent = this.current;
    this.el.style.display = '';
    requestAnimationFrame(() => this.el.classList.add('coach--in'));
    this.timer = 6.5;
  }
}
