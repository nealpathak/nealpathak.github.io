// HUD. Plain DOM over the canvas — cheaper and sharper than drawing text in
// WebGL, and it comes with accessibility for free. Every setter short-circuits
// when the value hasn't changed, so we're not touching layout 60 times a
// second.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.roundNum = $('round-num');
    this.roundBadge = $('round-badge');
    this.healthFill = $('health-fill');
    this.healthNum = $('health-num');
    this.mag = $('mag');
    this.reserve = $('reserve');
    this.ammo = $('ammo');
    this.reloadHint = $('reload-hint');
    this.hitmarker = $('hitmarker');
    this.toast = $('toast');
    this.damage = $('damage');

    this._last = {};
    this._toastTimer = 0;
    this._damageTimer = 0;
  }

  show(on) { this.root.hidden = !on; }

  setRound(n) {
    if (this._last.round === n) return;
    this._last.round = n;
    this.roundNum.textContent = n;
    this.roundBadge.classList.remove('flash');
    void this.roundBadge.offsetWidth;   // restart the animation
    this.roundBadge.classList.add('flash');
  }

  setHealth(hp, max) {
    const rounded = Math.ceil(hp);
    if (this._last.hp === rounded) return;
    this._last.hp = rounded;
    const pct = (hp / max) * 100;
    this.healthFill.style.width = pct + '%';
    this.healthFill.classList.toggle('hurt', pct < 45);
    this.healthNum.textContent = rounded;
  }

  setAmmo(mag, reserve, reloading) {
    if (this._last.mag !== mag) {
      this._last.mag = mag;
      this.mag.textContent = mag;
      this.ammo.classList.toggle('empty', mag === 0);
    }
    if (this._last.reserve !== reserve) {
      this._last.reserve = reserve;
      this.reserve.textContent = '/ ' + reserve;
    }
    const hint = mag === 0 && !reloading && reserve > 0;
    if (this._last.hint !== hint) {
      this._last.hint = hint;
      this.reloadHint.hidden = !hint;
    }
  }

  hitMark() {
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
  }

  say(text, seconds = 2.4) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this._toastTimer = seconds;
  }

  hurt() {
    this.damage.classList.add('on');
    this._damageTimer = 0.12;
  }

  tick(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.toast.classList.remove('show');
    }
    if (this._damageTimer > 0) {
      this._damageTimer -= dt;
      if (this._damageTimer <= 0) this.damage.classList.remove('on');
    }
  }

  reset() {
    this._last = {};
    this.toast.classList.remove('show');
    this.damage.classList.remove('on');
  }
}
