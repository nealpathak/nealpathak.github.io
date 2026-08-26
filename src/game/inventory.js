// Inventory and equipment.
//
// Weights matter: what you carry decides your equip-load band, and that decides
// how far you roll. That is the entire point of the system, so it is kept
// simple and legible rather than deep.

import { bus } from '../core/events.js';
import { ITEMS } from '../data/items.js';

export class Inventory {
  constructor(player) {
    this.player = player;
    this.items = new Map();       // id -> count
    this.equipped = { weapon: null, offhand: null, armour: null, talisman: null };
  }

  add(id, count = 1) {
    const def = ITEMS[id];
    if (!def) { console.warn(`[inventory] unknown item "${id}"`); return; }
    this.items.set(id, (this.items.get(id) ?? 0) + count);
    bus.emit('inventory:changed', { inventory: this, id, count });
    return def;
  }

  remove(id, count = 1) {
    const have = this.items.get(id) ?? 0;
    if (have < count) return false;
    if (have === count) this.items.delete(id);
    else this.items.set(id, have - count);
    bus.emit('inventory:changed', { inventory: this, id, count: -count });
    return true;
  }

  has(id, count = 1) { return (this.items.get(id) ?? 0) >= count; }
  count(id) { return this.items.get(id) ?? 0; }

  list(kind = null) {
    const out = [];
    for (const [id, count] of this.items) {
      const def = ITEMS[id];
      if (!def) continue;
      if (kind && def.kind !== kind) continue;
      out.push({ id, count, def });
    }
    return out.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }

  equip(slot, id) {
    const def = id ? ITEMS[id] : null;
    if (id && !def) return false;
    if (def && def.slot !== slot) return false;
    this.equipped[slot] = id;

    if (slot === 'weapon') this.player.equip(def?.model ?? 'longsword', def ?? undefined);
    else if (slot === 'offhand') this.player.equipOffhand(def?.model ?? null, def ?? undefined);
    else this._applyPassives();
    bus.emit('inventory:equipped', { slot, id, def });
    return true;
  }

  _applyPassives() {
    const armour = this.equipped.armour ? ITEMS[this.equipped.armour] : null;
    const talisman = this.equipped.talisman ? ITEMS[this.equipped.talisman] : null;
    const p = this.player;

    p.armourWeight = armour?.weight ?? 10;
    p.armourPoise = armour?.poise ?? 0;
    p.defenceFlat = armour?.defenceFlat ?? 0;
    p.defencePercent = armour?.defencePercent ?? 0;

    for (const k of Object.keys(p.stats.bonus)) p.stats.bonus[k] = 0;
    for (const src of [armour, talisman]) {
      for (const [k, v] of Object.entries(src?.statBonus ?? {})) {
        p.stats.bonus[k] = (p.stats.bonus[k] ?? 0) + v;
      }
    }
    p.refreshDerived({ keepRatios: true });
    p._recomputeLoad();
  }

  /** Use a consumable. Returns true if something happened. */
  use(id) {
    const def = ITEMS[id];
    if (!def || def.kind !== 'consumable' || !this.has(id)) return false;
    this.remove(id, 1);
    def.onUse?.(this.player, this);
    bus.emit('inventory:used', { id, def });
    return true;
  }

  snapshot() {
    return { items: [...this.items.entries()], equipped: { ...this.equipped } };
  }

  restore(data) {
    if (!data) return;
    this.items = new Map(data.items ?? []);
    for (const [slot, id] of Object.entries(data.equipped ?? {})) {
      if (id) this.equip(slot, id);
    }
    this._applyPassives();
  }
}
