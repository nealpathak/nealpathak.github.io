// Wisp skills: the player-facing half of the covenant.
//
// Binding a spirit is only interesting if you can then tell it to do something.
// `V` spends Focus to make the active Wisp use one of the moves it has learned,
// aimed at whatever you are locked on to. Each move kind resolves here so a new
// Wisp is a data entry, not new code.

import * as THREE from 'three';
import { bus } from '../core/events.js';
import { resolveHit } from '../combat/damage.js';
import { AFFINITY } from '../combat/affinity.js';
import { clamp01 } from '../core/math.js';

export class Skills {
  constructor(game) {
    this.game = game;
    this.cooldowns = new Map();     // move id -> seconds remaining
    this.selected = 0;
    this._wire();
  }

  _wire() {
    // Resting and dying both clear cooldowns: the shrine is a reset, and being
    // sent back to one should not also cost you your skills for the walk out.
    bus.on('progression:rested', () => this.cooldowns.clear());
    bus.on('progression:respawned', () => this.cooldowns.clear());
    bus.on('covenant:active', () => { this.selected = 0; this.cooldowns.clear(); });
  }

  get wisp() { return this.game.covenant.active; }
  get ally() { return this.wisp?.actor ?? null; }

  /** The moves the active Wisp can actually use right now. */
  available() {
    const w = this.wisp;
    if (!w) return [];
    return w.moves
      .map((id) => w.def.moves.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({
        ...m,
        // `cooldown` on the definition is the full duration; the HUD needs both
        // that and how much is left, so keep them under distinct names.
        cooldownBase: m.cooldown ?? 4,
        cooldown: this.cooldowns.get(m.id) ?? 0,
        affordable: this.game.player.focus >= (m.cost ?? 0),
      }));
  }

  cycle(dir = 1) {
    const list = this.available();
    if (!list.length) return;
    this.selected = (this.selected + dir + list.length) % list.length;
    bus.emit('skills:selected', { move: list[this.selected] });
  }

  /** Fire the selected move. Returns why it failed, or null on success. */
  cast() {
    const list = this.available();
    if (!list.length) {
      bus.emit('ui:toast', { text: 'No Wisp bound. Weaken an elite spirit and throw a sigil.', kind: 'bad' });
      return 'none';
    }
    const move = list[Math.min(this.selected, list.length - 1)];
    if (move.cooldown > 0) {
      bus.emit('ui:toast', { text: `${move.name} — ${move.cooldown.toFixed(1)}s`, kind: 'bad', duration: 1.4 });
      return 'cooldown';
    }
    if (!move.affordable) {
      bus.emit('ui:toast', { text: 'Not enough focus.', kind: 'bad', duration: 1.6 });
      return 'focus';
    }

    const ally = this.ally;
    if (!ally?.alive) {
      bus.emit('ui:toast', { text: `${this.wisp.name} is not in the field.`, kind: 'bad' });
      return 'absent';
    }

    this.game.player.focus -= move.cost ?? 0;
    this.cooldowns.set(move.id, move.cooldownBase);

    const target = this.game.lockOn.target ?? ally.target ?? this._nearestEnemy(ally);
    this._resolve(move, ally, target);
    // A bond grows from being asked to do something and doing it.
    this.wisp.gainBond(6);
    bus.emit('skills:cast', { move, wisp: this.wisp, target });
    return null;
  }

  _nearestEnemy(from) {
    let best = null, bestD = 24;
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(from.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  _resolve(move, ally, target) {
    const colour = AFFINITY[move.affinity]?.color ?? this.wisp.def.colour;
    const power = ally.power * (move.power ?? 1) * (1 + (this.wisp.bondRank.bonus?.damage ?? 0));

    switch (move.kind) {
      case 'projectile': {
        if (!target?.alive) { this._fizzle(ally); return; }
        ally.pendingMove = move;
        ally.target = target;
        ally.setState('cast', { force: true });
        break;
      }

      case 'melee': {
        if (!target?.alive) { this._fizzle(ally); return; }
        ally.target = target;
        ally.setState('attack', { force: true, clip: 'attackLight1' });
        break;
      }

      case 'aoe': {
        const centre = (target?.alive ? target.position : ally.position).clone();
        const radius = move.radius ?? 4;
        ally.setState('cast', { force: true });
        this._burst(centre, radius, colour);
        for (const e of this.game.enemies) {
          if (!e.alive) continue;
          const d = e.position.distanceTo(centre);
          if (d > radius) continue;
          // Falls off toward the edge, so positioning it well is worth doing.
          const falloff = 1 - clamp01(d / radius) * 0.45;
          resolveHit(e, {
            source: this.game.player,
            damage: power * falloff,
            poiseDamage: power * 0.4 * falloff,
            affinity: move.affinity ?? this.wisp.affinity,
            status: move.status ?? null,
            statusAmount: (move.statusAmount ?? 0) * falloff,
            point: e.position.clone().setY(e.position.y + e.height * 0.5),
            direction: new THREE.Vector3().subVectors(e.position, centre).setY(0).normalize(),
          });
          if (move.slow) {
            e.addTimedEffect('slowed', 6, {
              onApply: (a) => { a.moveSpeedMultiplier *= (1 - move.slow); },
              onRemove: (a) => { a.moveSpeedMultiplier /= (1 - move.slow); },
            });
          }
        }
        break;
      }

      case 'heal': {
        ally.setState('cast', { force: true });
        const amount = Math.round(this.game.player.maxHealth * (move.heal ?? 0.25));
        this.game.player.heal(amount);
        ally.health = Math.min(ally.maxHealth, ally.health + amount * 0.6);
        this._burst(this.game.player.position.clone(), 2.2, colour);
        bus.emit('ui:toast', { text: `${move.name} — +${amount}`, kind: 'good', duration: 2 });
        break;
      }

      case 'buff': {
        ally.setState('cast', { force: true });
        const p = this.game.player;
        const bonus = move.damageBonus ?? 0.2;
        const duration = move.duration ?? 12;
        p.addTimedEffect(`buff:${move.id}`, duration, {
          onApply: (a) => { a.damageMultiplier = (a.damageMultiplier ?? 1) * (1 + bonus); },
          onRemove: (a) => { a.damageMultiplier /= (1 + bonus); },
        });
        if (move.heal) p.heal(Math.round(p.maxHealth * move.heal));
        this._burst(p.position.clone(), 2.0, colour);
        bus.emit('ui:toast', { text: `${move.name} — ${Math.round(bonus * 100)}% for ${duration}s`, kind: 'good', duration: 2.4 });
        break;
      }

      case 'guard': {
        ally.setState('cast', { force: true });
        const p = this.game.player;
        const absorb = move.absorb ?? 0.5;
        p.addTimedEffect(`ward:${move.id}`, move.duration ?? 6, {
          onApply: (a) => { a.defencePercent = Math.min(0.85, a.defencePercent + absorb); },
          onRemove: (a) => { a.defencePercent = Math.max(0, a.defencePercent - absorb); },
        });
        this._burst(p.position.clone(), 2.4, colour);
        bus.emit('ui:toast', { text: `${move.name} — ${Math.round(absorb * 100)}% ward`, kind: 'good', duration: 2.4 });
        break;
      }

      case 'debuff': {
        if (!target?.alive) { this._fizzle(ally); return; }
        ally.setState('cast', { force: true });
        const down = move.defenceDown ?? 0.2;
        target.addTimedEffect(`hollow:${move.id}`, move.duration ?? 10, {
          onApply: (a) => { a.defencePercent = Math.max(0, a.defencePercent - down); },
          onRemove: (a) => { a.defencePercent += down; },
        });
        this._burst(target.position.clone(), 1.8, colour);
        bus.emit('ui:toast', { text: `${target.name} — ${move.name}`, kind: 'info', duration: 2 });
        break;
      }

      default:
        this._fizzle(ally);
        break;
    }
  }

  _burst(centre, radius, colour) {
    const fx = this.game.fx;
    fx.deathBurst(centre, colour);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      fx.embers.emit({
        x: centre.x + Math.cos(a) * r, y: centre.y + 0.2 + Math.random() * 1.2, z: centre.z + Math.sin(a) * r,
        vx: Math.cos(a) * 2.4, vy: 1.2 + Math.random() * 2.2, vz: Math.sin(a) * 2.4,
        life: 0.6 + Math.random() * 0.9, size: 0.06 + Math.random() * 0.1, colour,
      });
    }
    this.game.camera.addShake(0.2);
  }

  _fizzle() {
    bus.emit('ui:toast', { text: 'No target.', kind: 'bad', duration: 1.4 });
  }

  update(dt) {
    for (const [id, t] of this.cooldowns) {
      const next = t - dt;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }
    // Focus regenerates slowly, so skills are a resource between fights rather
    // than something you can lean on every few seconds.
    const p = this.game.player;
    if (p.focus < p.maxFocus) p.focus = Math.min(p.maxFocus, p.focus + p.maxFocus * 0.035 * dt);
  }
}

export { clamp01 };
