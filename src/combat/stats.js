// Stat blocks and the curves that turn them into the numbers combat uses.
//
// Six stats, all of which matter to somebody:
//   Vigour     health
//   Endurance  stamina and how much armour you can carry
//   Strength   scaling for heavy weapons, and guard stability
//   Finesse    scaling for fast weapons, and critical damage
//   Resolve    poise and status resistance
//   Attunement Wisp power, focus, and how likely a bind is to take

import { clamp, lerp } from '../core/math.js';

export const STAT_KEYS = ['vigour', 'endurance', 'strength', 'finesse', 'resolve', 'attunement'];

export const STAT_INFO = {
  vigour:     { label: 'Vigour',     blurb: 'Health. The only stat that never stops being useful.' },
  endurance:  { label: 'Endurance',  blurb: 'Stamina pool and equip load.' },
  strength:   { label: 'Strength',   blurb: 'Scaling for heavy weapons. Steadies your guard.' },
  finesse:    { label: 'Finesse',    blurb: 'Scaling for fast weapons. Sharpens criticals.' },
  resolve:    { label: 'Resolve',    blurb: 'Poise, and resistance to bleed, rot and frost.' },
  attunement: { label: 'Attunement', blurb: 'Focus, Wisp power, and the odds a bind takes.' },
};

/**
 * A soft cap curve: fast returns early, a knee, then a slow tail. This is what
 * makes levelling feel generous at first and forces specialisation later.
 */
function softCap(value, { base, perPoint, knee = 25, tailFactor = 0.34, hardKnee = 45, tailFactor2 = 0.12 }) {
  const v = Math.max(0, value);
  if (v <= knee) return base + v * perPoint;
  if (v <= hardKnee) return base + knee * perPoint + (v - knee) * perPoint * tailFactor;
  return base + knee * perPoint + (hardKnee - knee) * perPoint * tailFactor
    + (v - hardKnee) * perPoint * tailFactor2;
}

/** Letter grade -> multiplier applied to a weapon's scaling contribution. */
export const SCALING_GRADES = { S: 1.0, A: 0.78, B: 0.58, C: 0.40, D: 0.24, E: 0.12, '-': 0 };

export class StatBlock {
  constructor(init = {}) {
    this.level = init.level ?? 1;
    for (const k of STAT_KEYS) this[k] = init[k] ?? 10;
    this.bonus = {};      // transient modifiers from buffs and equipment
    for (const k of STAT_KEYS) this.bonus[k] = 0;
  }

  effective(key) { return Math.max(1, (this[key] ?? 0) + (this.bonus[key] ?? 0)); }

  get maxHp() { return Math.round(softCap(this.effective('vigour'), { base: 220, perPoint: 22, knee: 26, tailFactor: 0.42, hardKnee: 48, tailFactor2: 0.15 })); }
  get maxStamina() { return Math.round(softCap(this.effective('endurance'), { base: 78, perPoint: 3.6, knee: 30, tailFactor: 0.22, hardKnee: 45, tailFactor2: 0.06 })); }
  get maxFocus() { return Math.round(softCap(this.effective('attunement'), { base: 40, perPoint: 6.5, knee: 30, tailFactor: 0.4 })); }
  get equipLoad() { return softCap(this.effective('endurance'), { base: 42, perPoint: 1.5, knee: 30, tailFactor: 0.5 }); }
  get basePoise() { return softCap(this.effective('resolve'), { base: 18, perPoint: 1.35, knee: 30, tailFactor: 0.4 }); }
  get staminaRegen() { return 26 + this.effective('endurance') * 0.32; }
  get bindPower() { return this.effective('attunement'); }
  get criticalMultiplier() { return 2.0 + this.effective('finesse') * 0.018; }
  get statusResist() { return this.effective('resolve') * 1.6; }

  /** Total soul cost to go from `level` to `level + 1`, Souls-style. */
  static levelCost(level) {
    return Math.round(60 + Math.pow(level + 6, 2.28) * 0.72);
  }

  toJSON() {
    const o = { level: this.level };
    for (const k of STAT_KEYS) o[k] = this[k];
    return o;
  }

  static fromJSON(o) { return new StatBlock(o); }
}

/**
 * Equip load bands, which decide roll distance and speed. Straight from the
 * genre, because it works: light rolls are a real reward for going unarmoured.
 */
export function loadBand(current, max) {
  const ratio = max > 0 ? current / max : 1;
  if (ratio <= 0.30) return { id: 'light', label: 'Light', rollDistance: 1.22, rollSpeed: 1.12, moveSpeed: 1.05, staminaRegen: 1.10 };
  if (ratio <= 0.70) return { id: 'medium', label: 'Medium', rollDistance: 1.0, rollSpeed: 1.0, moveSpeed: 1.0, staminaRegen: 1.0 };
  if (ratio <= 1.0) return { id: 'heavy', label: 'Heavy', rollDistance: 0.74, rollSpeed: 0.86, moveSpeed: 0.93, staminaRegen: 0.9 };
  return { id: 'overloaded', label: 'Overloaded', rollDistance: 0.42, rollSpeed: 0.6, moveSpeed: 0.66, staminaRegen: 0.7 };
}

/** Weapon attack rating from base damage plus stat scaling. */
export function attackRating(weapon, stats) {
  let total = weapon.damage ?? 0;
  for (const [stat, grade] of Object.entries(weapon.scaling ?? {})) {
    const mult = SCALING_GRADES[grade] ?? 0;
    if (!mult) continue;
    // Scaling contribution follows its own soft cap, so a B in Strength on a
    // greatsword is worth a lot early and much less past 40.
    const s = stats.effective(stat);
    const curve = lerp(0, 1, clamp(softCap(s, { base: 0, perPoint: 0.028, knee: 30, tailFactor: 0.35 }), 0, 1.4));
    total += (weapon.damage ?? 0) * mult * curve;
  }
  return Math.round(total);
}
