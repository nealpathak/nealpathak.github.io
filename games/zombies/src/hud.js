// HUD. Plain DOM over the canvas — cheaper and sharper than drawing text in
// WebGL, and it comes with accessibility for free. Every setter short-circuits
// when the value hasn't changed, so we're not touching layout 60 times a second.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.levelName = $('level-name');
    this.waveNum = $('wave-num');
    this.waveTotal = $('wave-total');
    this.waveBadge = $('wave-badge');
    this.remaining = $('remaining');
    this.healthFill = $('health-fill');
    this.healthNum = $('health-num');
    this.mag = $('mag');
    this.reserve = $('reserve');
    this.ammo = $('ammo');
    this.reloadHint = $('reload-hint');
    this.hitmarker = $('hitmarker');
    this.toast = $('toast');
    this.damage = $('damage');
    this.perks = $('perks');

    this._last = {};
    this._toastTimer = 0;
    this._damageTimer = 0;
  }

  show(on) { this.root.hidden = !on; }

  setLevel(name, index, total) {
    const label = `${index + 1}/${total}  ${name}`;
    if (this._last.level === label) return;
    this._last.level = label;
    this.levelName.textContent = label;
  }

  setWave(n, total) {
    if (this._last.wave === n && this._last.waveTotal === total) return;
    this._last.wave = n;
    this._last.waveTotal = total;
    this.waveNum.textContent = n;
    this.waveTotal.textContent = total;
    this.waveBadge.classList.remove('flash');
    void this.waveBadge.offsetWidth;      // restart the animation
    this.waveBadge.classList.add('flash');
  }

  setRemaining(n) {
    if (this._last.remaining === n) return;
    this._last.remaining = n;
    this.remaining.textContent = n > 0 ? `${n} left` : '';
  }

  setHealth(hp, max) {
    const rounded = Math.ceil(hp);
    if (this._last.hp === rounded && this._last.hpMax === max) return;
    this._last.hp = rounded;
    this._last.hpMax = max;
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

  /** The upgrades taken so far, as a row of tags. */
  setPerks(upgrades) {
    const key = upgrades.map((u) => u.id).join(',');
    if (this._last.perks === key) return;
    this._last.perks = key;
    this.perks.textContent = '';
    for (const u of upgrades) {
      const el = document.createElement('span');
      el.className = 'perk';
      el.textContent = u.name;
      this.perks.appendChild(el);
    }
  }

  hitMark() {
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
  }

  say(text, seconds = 2.4) {
    this.toast.textContent = text;
    this.toast.classList.toggle('show', !!text);
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
