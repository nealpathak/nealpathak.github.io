// Pause menu, with the settings that actually matter mid-session.

import { settings, QUALITY_PRESETS } from '../core/settings.js';

export class PauseMenu {
  constructor(root, engine, game) {
    this.engine = engine;
    this.game = game;

    const el = document.createElement('div');
    el.className = 'pause';
    el.dataset.interactive = '';
    el.innerHTML = `
      <div class="pause__panel panel">
        <h2 class="pause__title h-display">Paused</h2>
        <div class="pause__body"></div>
        <div class="pause__actions">
          <button class="btn btn--primary" data-act="resume">Resume</button>
        </div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.body = el.querySelector('.pause__body');
    el.querySelector('[data-act="resume"]').addEventListener('click', () => game.resume());
    el.addEventListener('click', (e) => { if (e.target === el) game.resume(); });

    this._buildSettings();
    this.hide();
  }

  _row(label, control) {
    const row = document.createElement('label');
    row.className = 'setting';
    const name = document.createElement('span');
    name.className = 'setting__label';
    name.textContent = label;
    row.appendChild(name);
    row.appendChild(control);
    this.body.appendChild(row);
    return row;
  }

  _select(key, options) {
    const sel = document.createElement('select');
    sel.className = 'setting__control';
    for (const [value, label] of options) {
      const o = document.createElement('option');
      o.value = value; o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = String(settings.get(key));
    sel.addEventListener('change', () => settings.set(key, sel.value));
    return sel;
  }

  _range(key, min, max, step, format = (v) => v.toFixed(2)) {
    const wrap = document.createElement('span');
    wrap.className = 'setting__control setting__range';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    input.value = settings.get(key);
    const out = document.createElement('output');
    out.textContent = format(Number(input.value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = format(v);
      settings.set(key, v);
    });
    wrap.append(input, out);
    return wrap;
  }

  _toggle(key) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'setting__control setting__toggle';
    input.checked = !!settings.get(key);
    input.addEventListener('change', () => settings.set(key, input.checked));
    return input;
  }

  _buildSettings() {
    this._row('Graphics', this._select('quality', Object.keys(QUALITY_PRESETS).map((k) => [k, k[0].toUpperCase() + k.slice(1)])));
    this._row('Field of view', this._range('fov', 50, 95, 1, (v) => `${v | 0}°`));
    this._row('Look sensitivity', this._range('sensitivity', 0.3, 3, 0.05));
    this._row('Invert vertical look', this._toggle('invertY'));
    this._row('Camera shake', this._range('cameraShake', 0, 1.5, 0.05));
    this._row('Master volume', this._range('masterVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
    this._row('Music', this._range('musicVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
    this._row('Effects', this._range('sfxVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
    this._row('Damage numbers', this._toggle('showDamageNumbers'));
    this._row('Larger text', this._toggle('largeText'));
    this._row('Reduce flashing', this._toggle('reduceFlashing'));
    this._row('Auto lock-on after a hit', this._toggle('autoLockOn'));
  }

  show() { this.el.classList.remove('pause--hidden'); }
  hide() { this.el.classList.add('pause--hidden'); }
}
