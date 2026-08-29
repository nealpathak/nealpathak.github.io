// First-run coaching for the slipstream mechanic.
//
// The whole game rests on "fly close to rock to go faster", and a player who
// never happens to fly low simply never discovers it -- they just have a slow,
// dull run and leave. This watches what the player is actually doing and only
// speaks up when the mechanic is going unused.

import { getFlag, setFlag } from '../core/storage.js';

const LEARNED = 'slipLearned';
const MAX_PROMPTS = 4;        // stop nagging after a few runs either way
const QUIET_BEFORE_HINT = 9;  // seconds of low charge before prompting
const HINT_SECONDS = 4.5;

export class Coach {
  constructor(el) {
    this.el = el;
    this.learned = getFlag(LEARNED, 0) === 1;
    this.prompts = getFlag('slipPrompts', 0);
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.quiet = 0;
    this.show = 0;
    this.peak = 0;
    this.praised = false;
    this.hinted = false;
    this._set('');
  }

  _set(text, cls) {
    if (this._text === text) return;
    this._text = text;
    this.el.textContent = text;
    this.el.className = text ? `show ${cls || ''}` : '';
  }

  // Called every frame while flying.
  update(dt, ship) {
    // Run the countdown before any early-out, or a message shown on the last
    // frame we had work to do would never be cleared and would stick forever.
    if (this.show > 0) {
      this.show -= dt;
      if (this.show <= 0) this._set('');
      return;
    }

    if (this.learned && this.praised) return;
    this.elapsed += dt;
    this.peak = Math.max(this.peak, ship.charge);

    // Praise the moment they get it -- then never mention it again. The time
    // guard keeps an incidental skim in the first seconds off the launch pad
    // from being mistaken for the player understanding the mechanic.
    if (!this.praised && this.elapsed > 3.5 && ship.charge > 0.6) {
      this.praised = true;
      if (!this.learned) {
        this.learned = true;
        setFlag(LEARNED, 1);
        this._set('THAT’S IT — SPEED IS BOUGHT WITH RISK', 'good');
        this.show = HINT_SECONDS;
      }
      return;
    }

    if (this.learned || this.hinted || this.prompts >= MAX_PROMPTS) return;

    // Only nag when the mechanic is genuinely going unused.
    if (ship.charge < 0.15) this.quiet += dt;
    else this.quiet = 0;

    if (this.quiet > QUIET_BEFORE_HINT) {
      this.hinted = true;
      this.prompts++;
      setFlag('slipPrompts', this.prompts);
      this._set('FLY LOW — SKIM THE ROCK TO CHARGE YOUR SLIPSTREAM');
      this.show = HINT_SECONDS;
    }
  }
}
