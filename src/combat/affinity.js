// The affinity wheel — the Fire Emblem weapon triangle, reworked as elements so
// it can apply to weapons, spells and spirits alike.
//
//        Ember → Bloom → Tide → Ember
//        Radiance ⇄ Void   (both ways, both hard)

export const AFFINITY = {
  none:     { id: 'none',     label: 'Untuned',  color: 0xb6b0a6, css: '--aff-none' },
  ember:    { id: 'ember',    label: 'Ember',    color: 0xff7a3c, css: '--aff-ember' },
  bloom:    { id: 'bloom',    label: 'Bloom',    color: 0x86d05a, css: '--aff-bloom' },
  tide:     { id: 'tide',     label: 'Tide',     color: 0x4fb8e8, css: '--aff-tide' },
  radiance: { id: 'radiance', label: 'Radiance', color: 0xffe58a, css: '--aff-radiance' },
  void:     { id: 'void',     label: 'Void',     color: 0xa97ce0, css: '--aff-void' },
};

export const AFFINITY_IDS = Object.keys(AFFINITY);

/** What each affinity is strong against. */
const BEATS = {
  ember: ['bloom'],
  bloom: ['tide'],
  tide: ['ember'],
  radiance: ['void'],
  void: ['radiance'],
  none: [],
};

export const ADVANTAGE_DAMAGE = 1.35;
export const DISADVANTAGE_DAMAGE = 0.70;
export const MUTUAL_DAMAGE = 1.50;      // radiance vs void, either direction
export const ADVANTAGE_POISE = 1.50;
export const DISADVANTAGE_POISE = 0.60;

/**
 * @returns {{damage:number, poise:number, relation:'advantage'|'disadvantage'|'neutral'|'mutual'}}
 */
export function affinityMatchup(attack, defend) {
  if (!attack || !defend || attack === 'none' || defend === 'none') {
    return { damage: 1, poise: 1, relation: 'neutral' };
  }
  const mutual = (attack === 'radiance' && defend === 'void') || (attack === 'void' && defend === 'radiance');
  if (mutual) return { damage: MUTUAL_DAMAGE, poise: ADVANTAGE_POISE, relation: 'mutual' };
  if (BEATS[attack]?.includes(defend)) {
    return { damage: ADVANTAGE_DAMAGE, poise: ADVANTAGE_POISE, relation: 'advantage' };
  }
  if (BEATS[defend]?.includes(attack)) {
    return { damage: DISADVANTAGE_DAMAGE, poise: DISADVANTAGE_POISE, relation: 'disadvantage' };
  }
  return { damage: 1, poise: 1, relation: 'neutral' };
}

/** For the UI: a short phrase describing the matchup. */
export function matchupLabel(relation) {
  switch (relation) {
    case 'advantage': return 'Effective';
    case 'disadvantage': return 'Resisted';
    case 'mutual': return 'Opposed';
    default: return '';
  }
}
