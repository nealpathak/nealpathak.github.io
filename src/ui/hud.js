// The heads-up display.
//
// Built from DOM, updated by mutating a handful of style properties per frame
// rather than re-rendering. The bars use a two-layer trick: a fast foreground
// and a slow "ghost" behind it, so you can see how much a hit took off.

import * as THREE from 'three';
import { bus } from '../core/events.js';
import { clamp, damp } from '../core/math.js';
import { AFFINITY } from '../combat/affinity.js';
import { settings } from '../core/settings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.player = game.player;
    this.visible = true;

    this.el = el('div', 'hud', root);
    this._buildVitals();
    this._buildFlask();
    this._buildSkill();
    this._buildLockOn();
    this._buildBossBar();
    this._buildPrompt();
    this._buildToasts();
    this._buildDamageNumbers();

    this._ghostHp = 1;
    this._ghostStam = 1;
    this._promptTimer = 0;

    this._wire();
  }

  _buildVitals() {
    const wrap = el('div', 'hud__vitals', this.el);

    const mkBar = (kind, label) => {
      const bar = el('div', `bar bar--${kind}`, wrap);
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', label);
      el('i', 'bar__ghost', bar);
      const fill = el('i', 'bar__fill', bar);
      const text = el('span', 'bar__text', bar);
      return { bar, fill, ghost: bar.querySelector('.bar__ghost'), text };
    };

    this.hp = mkBar('hp', 'Health');
    this.stamina = mkBar('stamina', 'Stamina');
    this.focus = mkBar('focus', 'Focus');
    this.statusRow = el('div', 'hud__status', wrap);
  }

  _buildFlask() {
    const wrap = el('div', 'hud__flask', this.el);
    this.flaskIcon = el('div', 'flask', wrap);
    this.flaskIcon.innerHTML = `<svg viewBox="0 0 24 32" aria-hidden="true">
      <path d="M9 2h6v7l5 12a5 5 0 0 1-4.6 7H8.6A5 5 0 0 1 4 21l5-12V2Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path class="flask__liquid" d="M6.2 17h11.6l2 5a4 4 0 0 1-3.7 6H7.9a4 4 0 0 1-3.7-6l2-5Z" fill="currentColor"/>
    </svg>`;
    this.flaskCount = el('span', 'flask__count', wrap, '5');
    this.cinders = el('div', 'hud__cinders', this.el);
    this.cindersValue = el('span', 'hud__cinders-value', this.cinders, '0');
    el('span', 'hud__cinders-label', this.cinders, 'cinders');
  }

  _buildSkill() {
    const wrap = el('div', 'skillchip', this.el);
    this.skillChip = wrap;
    this.skillName = el('div', 'skillchip__name', wrap);
    const meta = el('div', 'skillchip__meta', wrap);
    this.skillCost = el('span', 'skillchip__cost', meta);
    this.skillKey = el('kbd', null, meta, 'V');
    this.skillCool = el('i', 'skillchip__cool', wrap);
    wrap.style.display = 'none';

    this.paired = el('div', 'paired', this.el);
    el('span', 'paired__label', this.paired, 'Paired Strike');
    el('kbd', null, this.paired, 'C');
    this.paired.style.display = 'none';
  }

  _updateSkill() {
    const cov = this.game.covenant;
    const ready = cov?.pairedReady ?? false;
    if (ready !== this._pairedShown) {
      this._pairedShown = ready;
      this.paired.style.display = ready ? '' : 'none';
      if (ready) this.pulse(this.paired);
    }

    const skills = this.game.skills;
    if (!skills) return;
    const list = skills.available();
    if (!list.length) { this.skillChip.style.display = 'none'; return; }
    const move = list[Math.min(skills.selected, list.length - 1)];
    this.skillChip.style.display = '';
    this.skillName.textContent = move.name;
    const aff = AFFINITY[move.affinity] ?? AFFINITY.none;
    this.skillChip.style.setProperty('--aff', `#${aff.color.toString(16).padStart(6, '0')}`);
    this.skillCost.textContent = `${move.cost ?? 0} focus`;
    const total = move.cooldownBase ?? move.cooldown ?? 1;
    const remaining = skills.cooldowns.get(move.id) ?? 0;
    this.skillCool.style.transform = `scaleX(${remaining > 0 ? clamp(remaining / Math.max(total, 0.001), 0, 1) : 0})`;
    this.skillChip.classList.toggle('skillchip--ready', remaining <= 0 && move.affordable);
    this.skillChip.classList.toggle('skillchip--blocked', remaining > 0 || !move.affordable);
  }

  _buildLockOn() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'lockon');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.innerHTML = `
      <g class="lockon__g">
        <path d="M20 3 L24 9 L16 9 Z" fill="currentColor"/>
        <path d="M20 37 L16 31 L24 31 Z" fill="currentColor"/>
        <path d="M3 20 L9 16 L9 24 Z" fill="currentColor"/>
        <path d="M37 20 L31 24 L31 16 Z" fill="currentColor"/>
        <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/>
      </g>`;
    this.el.appendChild(svg);
    this.lockOnEl = svg;
    this.lockOnEl.style.display = 'none';

    this.targetPlate = el('div', 'target-plate', this.el);
    this.targetName = el('div', 'target-plate__name', this.targetPlate);
    this.targetAff = el('div', 'target-plate__aff', this.targetPlate);
    const hb = el('div', 'target-plate__bar', this.targetPlate);
    this.targetGhost = el('i', 'target-plate__ghost', hb);
    this.targetFill = el('i', 'target-plate__fill', hb);
    this.targetPlate.style.display = 'none';
    this._targetGhostValue = 1;
  }

  _buildBossBar() {
    this.bossBar = el('div', 'boss', this.el);
    this.bossName = el('div', 'boss__name', this.bossBar);
    const track = el('div', 'boss__track', this.bossBar);
    this.bossGhost = el('i', 'boss__ghost', track);
    this.bossFill = el('i', 'boss__fill', track);
    this.bossBar.style.display = 'none';
    this._bossGhost = 1;
    this.boss = null;
  }

  _buildPrompt() {
    this.prompt = el('div', 'prompt', this.el);
    this.promptKey = el('kbd', 'prompt__key', this.prompt, 'E');
    this.promptText = el('span', 'prompt__text', this.prompt, '');
    this.prompt.style.display = 'none';
  }

  _buildToasts() {
    this.toasts = el('div', 'toasts', this.el);
    this._toastQueue = [];
  }

  _buildDamageNumbers() {
    this.damageLayer = el('div', 'damage-layer', this.el);
    this._numbers = [];
  }

  _wire() {
    bus.on('combat:hit', ({ defender, attacker, report }) => {
      if (!settings.get('showDamageNumbers')) return;
      if (attacker !== this.player && defender !== this.player) return;
      this.spawnDamageNumber(defender, report);
    });
    bus.on('player:interactTarget', ({ target }) => this.setPrompt(target));
    bus.on('lockon:changed', ({ target }) => { this.lockTarget = target; });
    bus.on('player:flask', ({ flask }) => { this.flaskCount.textContent = String(flask.charges); });
    bus.on('player:noStamina', () => this.pulse(this.stamina.bar));
    bus.on('player:noFlask', () => this.pulse(this.flaskIcon));
    bus.on('ui:toast', (payload) => this.toast(payload));
    bus.on('boss:engaged', ({ actor }) => this.setBoss(actor));
    bus.on('boss:ended', () => this.setBoss(null));
  }

  pulse(node) {
    node.classList.remove('pulse');
    void node.offsetWidth;
    node.classList.add('pulse');
  }

  toast({ text, kind = 'info', duration = 3.2 } = {}) {
    const t = el('div', `toast toast--${kind}`, this.toasts, text);
    requestAnimationFrame(() => t.classList.add('toast--in'));
    setTimeout(() => {
      t.classList.remove('toast--in');
      setTimeout(() => t.remove(), 500);
    }, duration * 1000);
  }

  /** A large centred announcement: YOU DIED, area names, boss defeats. */
  announce(text, kind = 'death', duration = 4) {
    const n = el('div', `announce announce--${kind}`, this.el, text);
    requestAnimationFrame(() => n.classList.add('announce--in'));
    setTimeout(() => {
      n.classList.remove('announce--in');
      setTimeout(() => n.remove(), 1200);
    }, duration * 1000);
    return n;
  }

  setPrompt(target) {
    if (!target) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = '';
    this.promptKey.textContent = this.game.input?.usingGamepad ? 'A' : 'E';
    this.promptText.textContent = target.type === 'shrine'
      ? `Rest at ${target.shrine.name ?? 'Emberwake'}`
      : (target.label ?? 'Interact');
  }

  setBoss(actor) {
    this.boss = actor;
    if (!actor) { this.bossBar.style.display = 'none'; return; }
    this.bossBar.style.display = '';
    this.bossName.textContent = actor.name;
    this._bossGhost = actor.healthFraction;
  }

  spawnDamageNumber(target, report) {
    const n = el('div', 'dmg', this.damageLayer, String(report.damage));
    if (report.relation === 'advantage' || report.relation === 'mutual') n.classList.add('dmg--effective');
    if (report.relation === 'disadvantage') n.classList.add('dmg--resisted');
    if (report.blocked) n.classList.add('dmg--blocked');
    if (report.attack?.critical) n.classList.add('dmg--critical');
    if (target === this.player) n.classList.add('dmg--taken');
    this._numbers.push({
      node: n, life: 1.1, age: 0,
      world: (report.point ?? target.position).clone
        ? (report.point ?? target.position).clone()
        : { x: 0, y: 0, z: 0 },
      drift: (Math.random() - 0.5) * 40,
      rise: 46 + Math.random() * 18,
    });
    if (report.point == null) this._numbers[this._numbers.length - 1].world.y += target.height * 0.7;
  }

  update(dt) {
    const p = this.player;

    // Vitals. The ghost bar trails the real one so damage is visible as a gap.
    const hpF = p.healthFraction;
    this._ghostHp = hpF > this._ghostHp ? hpF : damp(this._ghostHp, hpF, 3.4, dt);
    this.hp.fill.style.width = `${hpF * 100}%`;
    this.hp.ghost.style.width = `${this._ghostHp * 100}%`;
    this.hp.text.textContent = `${Math.ceil(p.health)}`;
    this.hp.bar.style.setProperty('--w', `${Math.round(clamp(p.maxHealth / 6.2, 130, 420))}px`);

    const stF = p.staminaFraction;
    this._ghostStam = stF > this._ghostStam ? stF : damp(this._ghostStam, stF, 6, dt);
    this.stamina.fill.style.width = `${stF * 100}%`;
    this.stamina.ghost.style.width = `${this._ghostStam * 100}%`;
    this.stamina.bar.classList.toggle('bar--empty', p.stamina < 6);
    this.stamina.bar.style.setProperty('--w', `${Math.round(clamp(p.maxStamina / 2.4, 120, 380))}px`);

    this.focus.fill.style.width = `${p.focusFraction * 100}%`;
    this.focus.ghost.style.width = `${p.focusFraction * 100}%`;
    this.focus.bar.style.setProperty('--w', `${Math.round(clamp(p.maxFocus / 1.6, 90, 300))}px`);

    this.flaskCount.textContent = String(p.flask.charges);
    this.flaskIcon.classList.toggle('flask--empty', p.flask.charges <= 0);
    this.cindersValue.textContent = p.cinders.toLocaleString();

    this._updateStatusBars();
    this._updateSkill();
    this._updateLockOn(dt);
    this._updateBoss(dt);
    this._updateDamageNumbers(dt);
  }

  _updateStatusBars() {
    const bars = this.player.status.activeBars();
    const row = this.statusRow;
    while (row.childElementCount > bars.length) row.lastElementChild.remove();
    while (row.childElementCount < bars.length) {
      const b = el('div', 'statusbar', row);
      el('i', 'statusbar__fill', b);
    }
    bars.forEach((b, i) => {
      const node = row.children[i];
      node.title = b.label;
      node.style.setProperty('--c', `#${b.color.toString(16).padStart(6, '0')}`);
      node.firstElementChild.style.width = `${b.value * 100}%`;
    });
  }

  _updateLockOn(dt) {
    const t = this.game.lockOn.target;
    if (!t || !t.alive) {
      this.lockOnEl.style.display = 'none';
      this.targetPlate.style.display = 'none';
      return;
    }
    const cam = this.game.camera.camera;
    _v.set(t.position.x, t.position.y + t.lockOnHeight, t.position.z).project(cam);
    if (_v.z > 1) { this.lockOnEl.style.display = 'none'; return; }
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    this.lockOnEl.style.display = '';
    this.lockOnEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%)`;

    this.targetPlate.style.display = '';
    this.targetName.textContent = t.name;
    const aff = AFFINITY[t.affinity] ?? AFFINITY.none;
    this.targetAff.textContent = aff.label;
    this.targetAff.style.color = `#${aff.color.toString(16).padStart(6, '0')}`;
    const f = t.healthFraction;
    this._targetGhostValue = f > this._targetGhostValue ? f : damp(this._targetGhostValue, f, 3.4, dt);
    this.targetFill.style.width = `${f * 100}%`;
    this.targetGhost.style.width = `${this._targetGhostValue * 100}%`;
  }

  _updateBoss(dt) {
    if (!this.boss) return;
    if (!this.boss.alive) { this.setBoss(null); return; }
    const f = this.boss.healthFraction;
    this._bossGhost = f > this._bossGhost ? f : damp(this._bossGhost, f, 2.2, dt);
    this.bossFill.style.width = `${f * 100}%`;
    this.bossGhost.style.width = `${this._bossGhost * 100}%`;
  }

  _updateDamageNumbers(dt) {
    const cam = this.game.camera.camera;
    for (let i = this._numbers.length - 1; i >= 0; i--) {
      const n = this._numbers[i];
      n.age += dt;
      if (n.age >= n.life) { n.node.remove(); this._numbers.splice(i, 1); continue; }
      _v.set(n.world.x, n.world.y, n.world.z).project(cam);
      if (_v.z > 1) { n.node.style.opacity = '0'; continue; }
      const t = n.age / n.life;
      const x = (_v.x * 0.5 + 0.5) * window.innerWidth + n.drift * t;
      const y = (-_v.y * 0.5 + 0.5) * window.innerHeight - n.rise * Math.sqrt(t);
      n.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) scale(${(1.25 - t * 0.35).toFixed(2)})`;
      n.node.style.opacity = String(clamp((1 - t) * 2.2, 0, 1));
    }
  }

  setVisible(v) {
    this.visible = v;
    this.el.classList.toggle('hud--hidden', !v);
  }
}

const _v = new THREE.Vector3();
