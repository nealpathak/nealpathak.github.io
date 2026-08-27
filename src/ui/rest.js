// The Emberwake menu: level up, refill, manage the covenant.
//
// Resting is the only safe moment in the game, so this screen is where the
// player is allowed to read numbers and make decisions rather than react.

import { bus } from '../core/events.js';
import { STAT_KEYS, STAT_INFO } from '../combat/stats.js';
import { AFFINITY } from '../combat/affinity.js';
import { TACTICS } from '../game/covenant.js';
import { ITEMS } from '../data/items.js';

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

const TABS = [
  { id: 'level', label: 'Kindle' },
  { id: 'gear', label: 'Gear' },
  { id: 'covenant', label: 'Covenant' },
  { id: 'bestiary', label: 'Bestiary' },
];

export class RestMenu {
  constructor(root, game) {
    this.game = game;
    this.tab = 'level';

    const wrap = el('div', 'rest', root);
    wrap.dataset.interactive = '';
    this.el = wrap;

    const panel = el('div', 'rest__panel panel', wrap);
    const head = el('div', 'rest__head', panel);
    this.title = el('h2', 'rest__title h-display', head, 'Emberwake');
    this.cinders = el('div', 'rest__cinders', head);

    this.tabsEl = el('div', 'rest__tabs', panel);
    for (const t of TABS) {
      const b = el('button', 'rest__tab', this.tabsEl, t.label);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => this.setTab(t.id));
    }

    this.body = el('div', 'rest__body', panel);

    const foot = el('div', 'rest__foot', panel);
    const leave = el('button', 'btn btn--primary', foot, 'Leave');
    leave.addEventListener('click', () => this.close());
    el('span', 'rest__hint', foot, 'Resting wakes everything in the vale.');

    wrap.addEventListener('click', (e) => { if (e.target === wrap) this.close(); });
    this.hide();

    bus.on('player:interact', ({ target }) => {
      if (target?.type === 'shrine') this.open(target.shrine);
    });
    bus.on('progression:levelled', () => this.render());
    bus.on('covenant:bound', () => this.render());
    bus.on('inventory:changed', () => { if (this.visible) this.render(); });
  }

  get visible() { return !this.el.classList.contains('rest--hidden'); }

  /**
   * @param {object|null} shrine  null when opened away from a shrine, which
   *   hides the levelling tab: spending cinders is what makes resting matter.
   * @param {string} [tab]
   */
  open(shrine, tab = 'level') {
    this.shrine = shrine;
    this.atShrine = !!shrine;
    this.tab = shrine ? tab : (tab === 'level' ? 'gear' : tab);
    this.title.textContent = shrine?.name ?? 'Covenant';
    for (const b of this.tabsEl.children) {
      b.hidden = b.dataset.tab === 'level' && !shrine;
    }
    this.el.querySelector('.rest__hint').textContent = shrine
      ? 'Resting wakes everything in the vale.'
      : 'Kindling requires an Emberwake.';
    this.el.classList.remove('rest--hidden');
    this.game.mode = 'resting';
    this.game.engine.loop.paused = true;
    this.game.input.exitPointerLock();
    document.body.classList.remove('playing');
    this.render();
  }

  close() {
    this.hide();
    this.game.mode = 'playing';
    this.game.engine.loop.paused = false;
    this.game.input.clearAllBuffers();
    this.game.input.requestPointerLock(this.game.engine.canvas);
    document.body.classList.add('playing');
  }

  hide() { this.el.classList.add('rest--hidden'); }

  setTab(id) { this.tab = id; this.render(); }

  render() {
    if (!this.visible) return;
    const p = this.game.player;
    this.cinders.innerHTML = `<b>${p.cinders.toLocaleString()}</b> cinders`;
    for (const b of this.tabsEl.children) b.classList.toggle('rest__tab--on', b.dataset.tab === this.tab);
    this.body.innerHTML = '';
    if (this.tab === 'level') this._renderLevel();
    else if (this.tab === 'gear') this._renderGear();
    else if (this.tab === 'covenant') this._renderCovenant();
    else this._renderBestiary();
  }

  _renderLevel() {
    const g = this.game;
    const p = g.player;
    const cost = g.progression.levelCost();

    const head = el('div', 'kindle__head', this.body);
    el('div', 'kindle__level', head).innerHTML = `<span>Level</span><b>${p.stats.level}</b>`;
    el('div', 'kindle__cost', head).innerHTML = `<span>Next</span><b>${cost.toLocaleString()}</b>`;

    const list = el('div', 'kindle__stats', this.body);
    for (const key of STAT_KEYS) {
      const row = el('div', 'kindle__row', list);
      const info = STAT_INFO[key];
      const label = el('div', 'kindle__name', row);
      el('span', null, label, info.label);
      el('small', 'kindle__blurb', label, info.blurb);
      el('div', 'kindle__value', row, String(p.stats[key]));
      const btn = el('button', 'btn kindle__up', row, '+');
      btn.disabled = !g.progression.canLevel(key);
      btn.title = btn.disabled ? `Needs ${cost.toLocaleString()} cinders` : `Raise ${info.label}`;
      btn.addEventListener('click', () => { g.progression.levelUp(key); this.render(); });
    }

    const derived = el('div', 'kindle__derived', this.body);
    const stat = (label, value) => {
      const d = el('div', 'kindle__derived-item', derived);
      el('span', null, d, label);
      el('b', null, d, String(value));
    };
    stat('Health', p.maxHealth);
    stat('Stamina', p.maxStamina);
    stat('Focus', p.maxFocus);
    stat('Poise', Math.round(p.maxPoise));
    stat('Equip load', `${p.equipLoadCurrent.toFixed(1)} / ${p.stats.equipLoad.toFixed(1)}`);
    stat('Weight class', p.load?.label ?? '—');
  }

  _renderGear() {
    const g = this.game;
    const inv = g.inventory;

    for (const slot of ['weapon', 'offhand', 'armour', 'talisman']) {
      const section = el('div', 'gear__section', this.body);
      el('h3', 'gear__slot', section, slot[0].toUpperCase() + slot.slice(1));
      const options = Object.values(ITEMS).filter((i) => i.slot === slot);
      const row = el('div', 'gear__options', section);
      if (slot === 'talisman' || slot === 'offhand') {
        const none = el('button', 'gear__option', row, 'None');
        none.classList.toggle('gear__option--on', !inv.equipped[slot]);
        none.addEventListener('click', () => { inv.equip(slot, null); this.render(); });
      }
      for (const item of options) {
        const b = el('button', 'gear__option', row);
        el('span', 'gear__option-name', b, item.name);
        el('small', 'gear__option-meta', b, gearMeta(item));
        b.title = item.blurb;
        b.classList.toggle('gear__option--on', inv.equipped[slot] === item.id);
        b.addEventListener('click', () => { inv.equip(slot, item.id); this.render(); });
      }
    }

    const bag = el('div', 'gear__section', this.body);
    el('h3', 'gear__slot', bag, 'Carried');
    const list = el('div', 'gear__bag', bag);
    const consumables = inv.list('consumable');
    if (!consumables.length) el('p', 'gear__empty', list, 'Nothing but ash and intent.');
    for (const { id, count, def } of consumables) {
      const b = el('button', 'gear__option', list);
      el('span', 'gear__option-name', b, `${def.name} ×${count}`);
      el('small', 'gear__option-meta', b, def.blurb);
      b.addEventListener('click', () => { inv.use(id); this.render(); });
    }
  }

  _renderCovenant() {
    const cov = this.game.covenant;

    const tac = el('div', 'cov__tactics', this.body);
    el('h3', 'gear__slot', tac, 'Standing orders');
    const row = el('div', 'gear__options', tac);
    for (const t of Object.values(TACTICS)) {
      const b = el('button', 'gear__option', row);
      el('span', 'gear__option-name', b, t.label);
      el('small', 'gear__option-meta', b, t.blurb);
      b.classList.toggle('gear__option--on', cov.tactics === t.id);
      b.addEventListener('click', () => { cov.setTactics(t.id); this.render(); });
    }

    const section = el('div', 'cov__wisps', this.body);
    el('h3', 'gear__slot', section, `Bound spirits (${cov.wisps.length}/${cov.maxBound})`);
    if (!cov.wisps.length) {
      el('p', 'gear__empty', section,
        'None yet. Weaken an elite spirit below a third of its health, then throw an Ember Sigil with G.');
    }
    for (const w of cov.wisps) {
      const card = el('div', 'wisp', section);
      const aff = AFFINITY[w.affinity] ?? AFFINITY.none;
      card.style.setProperty('--aff', `#${aff.color.toString(16).padStart(6, '0')}`);
      const head = el('div', 'wisp__head', card);
      el('span', 'wisp__name', head, w.name);
      el('span', 'wisp__aff', head, aff.label);
      el('span', 'wisp__level', head, `Lv ${w.level}`);
      el('p', 'wisp__blurb', card, w.def.blurb);

      const bars = el('div', 'wisp__bars', card);
      const xpBar = el('div', 'wisp__bar', bars);
      el('i', null, xpBar).style.width = `${Math.round((w.xp / w.xpToNext) * 100)}%`;
      el('small', 'wisp__barlabel', bars, `XP ${w.xp}/${w.xpToNext} · Bond ${w.bondRank.label}`);

      const moves = el('div', 'wisp__moves', card);
      for (const id of w.moves) {
        const m = w.def.moves.find((x) => x.id === id);
        if (m) el('span', 'wisp__move', moves, m.name);
      }

      const acts = el('div', 'wisp__acts', card);
      const setA = el('button', 'btn', acts, cov.active === w ? 'Active' : 'Summon');
      setA.disabled = cov.active === w;
      setA.addEventListener('click', () => { cov.setActive(w); this.render(); });
      const rel = el('button', 'btn', acts, 'Release');
      rel.addEventListener('click', () => { cov.release(w); this.render(); });
    }
  }

  _renderBestiary() {
    const cov = this.game.covenant;
    el('p', 'gear__empty', this.body,
      'Spirits you have met, and those you have convinced.');
    const grid = el('div', 'bestiary', this.body);
    const ids = new Set([...cov.bestiary.keys()]);
    for (const w of cov.wisps) ids.add(w.id);
    if (!ids.size) el('p', 'gear__empty', grid, 'Nothing recorded yet.');
    for (const id of ids) {
      const entry = cov.bestiary.get(id) ?? { seen: 0, bound: 0 };
      const def = cov.wisps.find((w) => w.id === id)?.def ?? null;
      const card = el('div', 'bestiary__card', grid);
      el('b', null, card, def?.name ?? id);
      el('small', null, card, `Encountered ${entry.seen} · Bound ${entry.bound}`);
    }
  }
}

function gearMeta(item) {
  const bits = [];
  if (item.damage) bits.push(`${item.damage} dmg`);
  if (item.block) bits.push(`${Math.round(item.block * 100)}% block`);
  if (item.defencePercent) bits.push(`${Math.round(item.defencePercent * 100)}% def`);
  if (item.poise) bits.push(`+${item.poise} poise`);
  if (item.weight != null) bits.push(`${item.weight} wt`);
  if (item.scaling) bits.push(Object.entries(item.scaling).map(([k, v]) => `${k.slice(0, 3).toUpperCase()} ${v}`).join(' '));
  return bits.join(' · ');
}
