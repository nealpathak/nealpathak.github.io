// The covenant: bound Wisps, companions, and the support bonds between them.
//
// Three influences meet here. From Pokemon: creatures you weaken and bind, that
// level and evolve. From Fire Emblem: support ranks that grow by fighting side
// by side and unlock a paired attack. From Dragon Age: a party you can give
// standing orders to rather than micromanage.

import { bus } from '../core/events.js';
import { clamp, clamp01 } from '../core/math.js';
import { WISPS } from '../data/wisps.js';

export const BOND_RANKS = [
  { id: 'none', label: '—', at: 0 },
  { id: 'C', label: 'C', at: 100, bonus: { damage: 0.04, defence: 0.03 } },
  { id: 'B', label: 'B', at: 320, bonus: { damage: 0.08, defence: 0.06 } },
  { id: 'A', label: 'A', at: 720, bonus: { damage: 0.14, defence: 0.10 }, unlocks: 'pairedStrike' },
];

/** XP needed to reach the next Wisp level. Deliberately gentle early. */
export function wispXpForLevel(level) {
  return Math.round(44 + Math.pow(level, 1.85) * 12);
}

export class BoundWisp {
  constructor(defId, { level = 1, nickname = null } = {}) {
    this.def = WISPS[defId];
    if (!this.def) throw new Error(`[covenant] unknown wisp "${defId}"`);
    this.id = defId;
    this.uid = `${defId}:${Math.random().toString(36).slice(2, 8)}`;
    this.nickname = nickname;
    this.level = level;
    this.xp = 0;
    this.bond = 0;
    this.moves = this.def.moves.filter((m) => (m.level ?? 1) <= level).map((m) => m.id);
    this.actor = null;         // set while summoned
  }

  get name() { return this.nickname ?? this.def.name; }
  get affinity() { return this.def.affinity; }
  get bondRank() {
    let rank = BOND_RANKS[0];
    for (const r of BOND_RANKS) if (this.bond >= r.at) rank = r;
    return rank;
  }
  get xpToNext() { return wispXpForLevel(this.level); }

  /** Level scaling: everything derives from the definition's base numbers. */
  stat(key) {
    const base = this.def.base[key] ?? 8;
    return Math.round(base * (1 + (this.level - 1) * 0.11));
  }

  get maxHealth() { return Math.round(this.def.base.health * (1 + (this.level - 1) * 0.14)); }
  get power() { return Math.round(this.def.base.power * (1 + (this.level - 1) * 0.12)); }

  gainXp(amount) {
    this.xp += amount;
    let levelled = false;
    while (this.xp >= this.xpToNext && this.level < 60) {
      this.xp -= this.xpToNext;
      this.level++;
      levelled = true;
      for (const m of this.def.moves) {
        if ((m.level ?? 1) <= this.level && !this.moves.includes(m.id)) {
          this.moves.push(m.id);
          bus.emit('covenant:learned', { wisp: this, move: m });
        }
      }
    }
    if (levelled) {
      bus.emit('covenant:levelled', { wisp: this, level: this.level });
      this._checkEvolution();
    }
    return levelled;
  }

  gainBond(amount) {
    const before = this.bondRank.id;
    this.bond += amount;
    const after = this.bondRank;
    if (after.id !== before) bus.emit('covenant:bond', { wisp: this, rank: after });
  }

  _checkEvolution() {
    const evo = this.def.evolvesTo;
    if (!evo) return;
    if (this.level < (this.def.evolveLevel ?? 99)) return;
    if (this.def.evolveBond && this.bond < this.def.evolveBond) return;
    const from = this.name;
    this.id = evo;
    this.def = WISPS[evo];
    if (!this.nickname) this.nickname = null;
    bus.emit('covenant:evolved', { wisp: this, from, to: this.def.name });
    bus.emit('ui:announce', { text: `${from} became ${this.def.name}`, kind: 'area', duration: 3.4 });
  }

  snapshot() {
    return { id: this.id, uid: this.uid, nickname: this.nickname, level: this.level, xp: this.xp, bond: this.bond, moves: this.moves };
  }

  static fromJSON(o) {
    const w = new BoundWisp(o.id, { level: o.level, nickname: o.nickname });
    w.uid = o.uid ?? w.uid;
    w.xp = o.xp ?? 0;
    w.bond = o.bond ?? 0;
    w.moves = o.moves ?? w.moves;
    return w;
  }
}

export const TACTICS = {
  aggressive: { id: 'aggressive', label: 'Aggressive', blurb: 'Engages the nearest enemy and stays on it.', engageRange: 22, followDistance: 6, defend: false },
  balanced:   { id: 'balanced',   label: 'Balanced',   blurb: 'Fights what you fight; falls back when hurt.', engageRange: 14, followDistance: 4, defend: false },
  guardian:   { id: 'guardian',   label: 'Guardian',   blurb: 'Stays close and intercepts anything reaching you.', engageRange: 9, followDistance: 2.6, defend: true },
  passive:    { id: 'passive',    label: 'Passive',    blurb: 'Follows and does not engage unless you are struck.', engageRange: 5, followDistance: 3, defend: true },
};

export class Covenant {
  constructor(game) {
    this.game = game;
    this.wisps = [];
    this.active = null;          // the summoned BoundWisp
    this.companions = [];        // Companion actors travelling with you
    this.bestiary = new Map();   // wispId -> { seen, bound }
    this.tactics = 'balanced';
    this.maxBound = 8;
    this.pairedCooldown = 0;
    this._bondTimer = 0;

    this._wire();
  }

  _wire() {
    bus.on('enemy:died', ({ enemy }) => {
      if (enemy.wispId) this.see(enemy.wispId);
      const xp = Math.round((enemy.cinderValue ?? 30) * 0.7);
      this.active?.gainXp(xp);
      for (const c of this.companions) c.gainXp?.(xp);
    });
    bus.on('player:sigilRelease', ({ target }) => this.attemptBind(target));
  }

  see(wispId) {
    const e = this.bestiary.get(wispId) ?? { seen: 0, bound: 0 };
    e.seen++;
    this.bestiary.set(wispId, e);
  }

  /**
   * The bind roll. Chance rises as the target's health falls, with Attunement,
   * with sigil quality, and with status effects on the target — all the levers
   * a player can actually pull.
   */
  bindChance(target, sigilPower = 1) {
    if (!target?.bindable || !target.alive) return 0;
    const missing = 1 - target.healthFraction;
    const threshold = target.bindThreshold ?? 0.3;
    if (target.healthFraction > threshold) return 0;

    // 0 at the threshold, rising steeply as it approaches death.
    const weakness = clamp01((threshold - target.healthFraction) / threshold);
    const attunement = this.game.player.stats.bindPower;
    let chance = 0.10 + weakness * 0.55;
    chance *= sigilPower;
    chance *= 1 + clamp(attunement - 10, 0, 40) * 0.018;
    if (target.state === 'stagger' || target.staggered) chance *= 1.35;
    for (const id of ['bleed', 'frost', 'rot']) {
      if ((target.status.buildup[id] ?? 0) > 40) chance *= 1.12;
    }
    if (this.wisps.length >= this.maxBound) chance = 0;
    void missing;
    return clamp01(chance);
  }

  attemptBind(target) {
    const player = this.game.player;
    const inventory = this.game.inventory;
    const sigil = inventory.has('keenSigil') ? 'keenSigil'
      : inventory.has('emberSigil') ? 'emberSigil' : null;
    if (!sigil) {
      bus.emit('ui:toast', { text: 'No sigils left.', kind: 'bad' });
      return null;
    }
    if (!target?.bindable) {
      bus.emit('ui:toast', { text: 'That spirit cannot be bound.', kind: 'bad' });
      return null;
    }
    if (this.wisps.length >= this.maxBound) {
      bus.emit('ui:toast', { text: 'Your covenant is full.', kind: 'bad' });
      return null;
    }

    inventory.remove(sigil, 1);
    this.game.progression.bindsAttempted++;

    const power = (sigil === 'keenSigil' ? 1.8 : 1.0);
    const chance = this.bindChance(target, power);
    const roll = Math.random();
    const success = roll < chance;

    bus.emit('covenant:bindAttempt', { target, chance, success });

    if (!success) {
      bus.emit('ui:toast', {
        text: target.healthFraction > (target.bindThreshold ?? 0.3)
          ? `${target.name} is too strong. Weaken it first.`
          : `The sigil scatters. ${Math.round(chance * 100)}% — try again.`,
        kind: 'bad', duration: 3,
      });
      return null;
    }

    const wisp = new BoundWisp(target.wispId ?? 'fenwisp', { level: Math.max(1, Math.round(target.stats.level * 0.7)) });
    this.wisps.push(wisp);
    const entry = this.bestiary.get(wisp.id) ?? { seen: 1, bound: 0 };
    entry.bound++;
    this.bestiary.set(wisp.id, entry);
    this.game.progression.bindsSucceeded++;

    target.health = 0;
    target.alive = false;
    target.setState('dead', { force: true });
    this.game.fx.deathBurst(target.position, wisp.def.colour);
    if (!this.active) this.setActive(wisp);

    bus.emit('ui:announce', { text: `${wisp.name} bound`, kind: 'area', duration: 3 });
    bus.emit('covenant:bound', { wisp });
    void player;
    return wisp;
  }

  setActive(wisp) {
    this.active = wisp;
    bus.emit('covenant:active', { wisp });
  }

  release(wisp) {
    const i = this.wisps.indexOf(wisp);
    if (i < 0) return;
    this.wisps.splice(i, 1);
    if (this.active === wisp) this.setActive(this.wisps[0] ?? null);
    bus.emit('covenant:released', { wisp });
  }

  setTactics(id) {
    if (!TACTICS[id]) return;
    this.tactics = id;
    // Every ally in the field, not just named companions: the summoned Wisp
    // takes orders too.
    for (const a of this.game.allies ?? this.companions) a.setTactics?.(TACTICS[id]);
    bus.emit('covenant:tactics', { tactics: TACTICS[id] });
  }

  /**
   * The Paired Strike — the reward for a rank A bond.
   *
   * Everyone bonded at A who is close enough joins the player's next blow: they
   * commit their own attack animation at the same target and their damage is
   * folded into one hit. It is on a long cooldown, because a move that turns
   * every fight into a cutscene is not a move, it is a skip button.
   */
  pairedPartners() {
    return this.companions
      .concat(this.active?.actor ? [this.active.actor] : [])
      .filter((a) => a.alive && a.bondRank.id === 'A'
        && a.position.distanceTo(this.game.player.position) < 14);
  }

  get pairedReady() {
    return this.pairedCooldown <= 0 && this.pairedPartners().length > 0;
  }

  /** Call a Paired Strike at `target`. Returns the partners who joined. */
  callPairedStrike(target) {
    if (!target?.alive) return null;
    const partners = this.pairedPartners();
    if (!partners.length || this.pairedCooldown > 0) return null;

    this.pairedCooldown = 26;
    let total = 0;
    for (const a of partners) {
      a.target = target;
      a.faceTowards(target.position.x, target.position.z, true);
      a.setState('attack', { force: true, clip: 'attackLight3' });
      total += a.power * 1.6;
      a.bondWith?.(this.game.player, 10);
    }
    bus.emit('covenant:pairedStrike', { partners, target, damage: total });
    bus.emit('ui:announce', {
      text: partners.length > 1 ? 'Paired Strike' : `${partners[0].name} — Paired Strike`,
      kind: 'area', duration: 2.2,
    });
    return { partners, damage: total };
  }

  /** Bonds accrue while allies fight near the player. */
  update(dt) {
    if (this.pairedCooldown > 0) this.pairedCooldown -= dt;
    this._bondTimer += dt;
    if (this._bondTimer < 1) return;
    this._bondTimer = 0;

    const player = this.game.player;
    const inCombat = this.game.enemies.some((e) => e.alive && e.aggro
      && e.position.distanceTo(player.position) < 18);
    if (!inCombat) return;

    for (const c of this.companions) {
      if (!c.alive) continue;
      if (c.position.distanceTo(player.position) > (c.bondRadius ?? 9)) continue;
      c.bondWith?.(player, 6);
      this.active?.gainBond(3);
    }
    if (this.active?.actor?.alive) this.active.gainBond(4);
  }

  snapshot() {
    return {
      wisps: this.wisps.map((w) => w.snapshot()),
      active: this.active?.uid ?? null,
      tactics: this.tactics,
      bestiary: [...this.bestiary.entries()],
      companions: this.companions.map((c) => ({ id: c.companionId, bond: c.bond ?? 0 })),
    };
  }

  restore(data) {
    if (!data) return;
    this.wisps = (data.wisps ?? []).map(BoundWisp.fromJSON);
    this.active = this.wisps.find((w) => w.uid === data.active) ?? this.wisps[0] ?? null;
    this.tactics = data.tactics ?? 'balanced';
    this.bestiary = new Map(data.bestiary ?? []);
    for (const saved of data.companions ?? []) {
      const c = this.companions.find((x) => x.companionId === saved.id);
      if (c) c.bond = saved.bond;
    }
  }
}
