// The HUD is plain DOM over the canvas: text stays crisp at any resolution
// scale, and layout is a stylesheet rather than glyph atlases.

import { formatTime } from '../game/run.js';

const el = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.time = el('hud-time');
    this.delta = el('hud-delta');
    this.speed = el('hud-speed');
    this.boostFill = el('hud-boost-fill');
    this.gates = el('hud-gates');
    this.progressFill = el('hud-progress-fill');
    this.progressMarks = el('hud-progress-marks');
    this.warn = el('hud-warn');
    this.toast = el('hud-toast');
    this.dayLabel = el('hud-day');
    this.bestLabel = el('hud-best');
    this._toastUntil = 0;
    this._lastDelta = null;
  }

  buildProgress(course) {
    this.progressMarks.innerHTML = '';
    for (const g of course.gates) {
      const m = document.createElement('i');
      m.style.left = `${(g.z / course.length) * 100}%`;
      m.dataset.gate = String(g.i);
      this.progressMarks.appendChild(m);
    }
  }

  setCourseLabel(dayText, best) {
    this.dayLabel.textContent = dayText;
    this.bestLabel.textContent = best != null ? `PB ${formatTime(best)}` : 'PB —';
  }

  markGate(i, ok) {
    const m = this.progressMarks.querySelector(`[data-gate="${i}"]`);
    if (m) m.className = ok ? 'ok' : 'bad';
  }

  showToast(text, kind) {
    this.toast.textContent = text;
    this.toast.className = `show ${kind || ''}`;
    this._toastUntil = performance.now() + 1100;
  }

  update(run, ship, ghostDelta, now) {
    this.time.textContent = formatTime(run.total);
    this.speed.textContent = Math.round(ship.speedKph);
    this.boostFill.style.transform = `scaleX(${ship.boostFactor.toFixed(3)})`;
    this.boostFill.classList.toggle('full', ship.boostFactor > 0.92);
    this.gates.textContent = `${run.passed}/${run.course.gates.length}`;
    this.progressFill.style.transform = `scaleX(${run.progress.toFixed(4)})`;

    if (ghostDelta == null) {
      this.delta.textContent = '';
      this.delta.className = '';
    } else {
      const ahead = ghostDelta < 0;
      this.delta.textContent = `${ahead ? '−' : '+'}${Math.abs(ghostDelta).toFixed(2)}`;
      this.delta.className = ahead ? 'ahead' : 'behind';
    }

    // Altitude warning doubles as the "you are cheating the course" nudge.
    if (ship.ceilingWarn > 0.25) {
      this.warn.textContent = 'TOO HIGH — DROP INTO THE CANYON';
      this.warn.classList.add('show');
    } else {
      this.warn.classList.remove('show');
    }

    if (this._toastUntil && now > this._toastUntil) {
      this.toast.className = '';
      this._toastUntil = 0;
    }
  }
}
