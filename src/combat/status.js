// Status effects: build-up bars that do something when they fill, then decay.
// Bleed, rot and frost are the three the world uses; buffs share the machinery.

import { bus } from '../core/events.js';
import { clamp } from '../core/math.js';

export const STATUS = {
  bleed: {
    label: 'Bleed', color: 0xc4372c, threshold: 100, decay: 14,
    onTrigger(actor) {
      // A flat chunk plus a fraction of max health: dangerous at every level.
      const dmg = Math.round(40 + actor.maxHealth * 0.11);
      actor.health = Math.max(0, actor.health - dmg);
      bus.emit('status:triggered', { actor, status: 'bleed', damage: dmg });
      if (actor.health <= 0) actor.onDeath?.({ result: 'killed', damage: dmg });
    },
  },
  rot: {
    label: 'Rot', color: 0x86d05a, threshold: 100, decay: 8,
    onTrigger(actor) {
      actor.addTimedEffect('rotting', 22, {
        tick: (a, dt) => { a.health = Math.max(1, a.health - a.maxHealth * 0.012 * dt); },
      });
      bus.emit('status:triggered', { actor, status: 'rot' });
    },
  },
  frost: {
    label: 'Frost', color: 0x4fb8e8, threshold: 100, decay: 11,
    onTrigger(actor) {
      const dmg = Math.round(actor.maxHealth * 0.10);
      actor.health = Math.max(0, actor.health - dmg);
      actor.addTimedEffect('chilled', 16, {
        onApply: (a) => { a.staminaRegenMultiplier *= 0.55; a.moveSpeedMultiplier *= 0.85; },
        onRemove: (a) => { a.staminaRegenMultiplier /= 0.55; a.moveSpeedMultiplier /= 0.85; },
      });
      bus.emit('status:triggered', { actor, status: 'frost', damage: dmg });
    },
  },
};

export class StatusTracker {
  constructor(actor) {
    this.actor = actor;
    this.buildup = {};       // status id -> 0..threshold
    this.effects = new Map();  // named timed effects
  }

  add(id, amount) {
    const def = STATUS[id];
    if (!def) return;
    const resist = this.actor.stats?.statusResist ?? 0;
    const scaled = amount * (1 - clamp(resist / 260, 0, 0.7));
    const next = (this.buildup[id] ?? 0) + scaled;
    if (next >= def.threshold) {
      this.buildup[id] = 0;
      def.onTrigger(this.actor);
    } else {
      this.buildup[id] = next;
      bus.emit('status:buildup', { actor: this.actor, status: id, value: next / def.threshold });
    }
  }

  addTimed(name, duration, handlers = {}) {
    const existing = this.effects.get(name);
    if (existing) { existing.remaining = Math.max(existing.remaining, duration); return existing; }
    const e = { name, remaining: duration, ...handlers };
    this.effects.set(name, e);
    e.onApply?.(this.actor);
    bus.emit('status:effect', { actor: this.actor, name, added: true });
    return e;
  }

  removeTimed(name) {
    const e = this.effects.get(name);
    if (!e) return;
    e.onRemove?.(this.actor);
    this.effects.delete(name);
    bus.emit('status:effect', { actor: this.actor, name, added: false });
  }

  has(name) { return this.effects.has(name); }

  clear() {
    for (const name of [...this.effects.keys()]) this.removeTimed(name);
    this.buildup = {};
  }

  update(dt) {
    for (const [id, def] of Object.entries(STATUS)) {
      if (this.buildup[id] > 0) {
        this.buildup[id] = Math.max(0, this.buildup[id] - def.decay * dt);
      }
    }
    for (const e of [...this.effects.values()]) {
      e.tick?.(this.actor, dt);
      e.remaining -= dt;
      if (e.remaining <= 0) this.removeTimed(e.name);
    }
  }

  /** For the HUD: only bars that are actually filling. */
  activeBars() {
    const out = [];
    for (const [id, def] of Object.entries(STATUS)) {
      const v = this.buildup[id] ?? 0;
      if (v > 0.5) out.push({ id, label: def.label, color: def.color, value: v / def.threshold });
    }
    return out;
  }
}
