// Items: weapons, armour, talismans and consumables.
//
// Weapon numbers are the contract with combat/stats.js: `damage` is the base
// attack rating, `scaling` is letter grades per stat, and `weight` feeds the
// equip-load band that decides how far you roll.

import { bus } from '../core/events.js';

export const ITEMS = {

  // --- weapons -------------------------------------------------------------

  longsword: {
    id: 'longsword', name: 'Ashbound Longsword', kind: 'weapon', slot: 'weapon', model: 'longsword',
    blurb: 'Issued to every Ashbound who makes it past the first winter. Most do not.',
    damage: 62, poiseDamage: 22, weight: 6, speed: 1, affinity: 'none',
    scaling: { strength: 'C', finesse: 'C' }, stability: 0.5, trailColor: 0xffcf95,
    visual: { steel: 0xc9d2de, hilt: 0x4a3a2c, pommel: 0x8a7346 },
  },
  emberbrand: {
    id: 'emberbrand', name: 'Emberbrand', kind: 'weapon', slot: 'weapon', model: 'longsword',
    blurb: 'The blade holds a coal that has not gone out in two hundred years.',
    damage: 58, poiseDamage: 20, weight: 6.5, speed: 1, affinity: 'ember',
    scaling: { strength: 'D', finesse: 'C', attunement: 'C' }, stability: 0.48,
    status: 'bleed', statusAmount: 0, trailColor: 0xff9a4d,
    visual: { steel: 0xd8a878, hilt: 0x4a2a1c, pommel: 0xc08040, glow: 0xff8a3c },
  },
  valeGreatsword: {
    id: 'valeGreatsword', name: 'Vale Greatsword', kind: 'weapon', slot: 'weapon', model: 'greatsword',
    blurb: 'Two hands, no apologies. Breaks guards and the people behind them.',
    damage: 104, poiseDamage: 58, weight: 14, speed: 0.86, affinity: 'none',
    scaling: { strength: 'A', finesse: 'E' }, stability: 0.62, trailColor: 0xdfe8ff,
    visual: { steel: 0xb6bdc8, hilt: 0x33281f },
  },
  choirSpear: {
    id: 'choirSpear', name: 'Choir Spear', kind: 'weapon', slot: 'weapon', model: 'spear',
    blurb: 'Reach enough to fight something twice your size, and no more.',
    damage: 54, poiseDamage: 16, weight: 7, speed: 1.12, affinity: 'tide',
    scaling: { finesse: 'B', strength: 'D' }, stability: 0.44,
    status: 'frost', statusAmount: 11, trailColor: 0x9fe4ff,
    visual: { steel: 0xcdd6e2, shaft: 0x6b5436 },
  },
  kindleStaff: {
    id: 'kindleStaff', name: 'Kindle Staff', kind: 'weapon', slot: 'weapon', model: 'staff',
    blurb: 'A catalyst. Poor at hitting things, excellent at telling Wisps to. Bring a spirit.',
    damage: 42, poiseDamage: 12, weight: 4, speed: 1.05, affinity: 'radiance',
    scaling: { attunement: 'A' }, stability: 0.3, trailColor: 0xffe58a,
    visual: { wood: 0x4a3628, gem: 0xff9a4d },
  },

  // --- offhand -------------------------------------------------------------

  wakestoneShield: {
    id: 'wakestoneShield', name: 'Wakestone Shield', kind: 'offhand', slot: 'offhand', model: 'shield',
    blurb: 'Heavy enough to matter, light enough to still roll in.',
    weight: 5, stability: 0.62, block: 0.78,
    visual: { face: 0x5b5f6b },
  },
  wardersWall: {
    id: 'wardersWall', name: "Warder's Wall", kind: 'offhand', slot: 'offhand', model: 'shield',
    blurb: 'Taken off a gate warden who no longer needed it.',
    weight: 11, stability: 0.82, block: 0.9,
    visual: { face: 0x45474f },
  },

  // --- armour --------------------------------------------------------------

  ashboundPlate: {
    id: 'ashboundPlate', name: 'Ashbound Plate', kind: 'armour', slot: 'armour',
    blurb: 'Scorched, dented, and still the best thing between you and the Vale.',
    weight: 18, poise: 14, defenceFlat: 8, defencePercent: 0.14,
  },
  pilgrimRags: {
    id: 'pilgrimRags', name: 'Pilgrim Rags', kind: 'armour', slot: 'armour',
    blurb: 'Weighs nothing. Stops nothing. Rolls beautifully.',
    weight: 4, poise: 2, defenceFlat: 2, defencePercent: 0.04,
    statBonus: { finesse: 1 },
  },

  // --- talismans -----------------------------------------------------------

  emberSigilRing: {
    id: 'emberSigilRing', name: 'Sigil-Bearer Ring', kind: 'talisman', slot: 'talisman',
    blurb: 'Bound spirits answer a little faster, and sigils a little truer.',
    weight: 0.5, statBonus: { attunement: 3 },
  },
  wardstoneCharm: {
    id: 'wardstoneCharm', name: 'Wardstone Charm', kind: 'talisman', slot: 'talisman',
    blurb: 'For those who intend to be hit and to keep standing anyway.',
    weight: 0.5, statBonus: { resolve: 3 }, poise: 6,
  },

  // --- consumables ---------------------------------------------------------

  emberSigil: {
    id: 'emberSigil', name: 'Ember Sigil', kind: 'consumable', slot: null,
    blurb: 'Throw at a weakened spirit to bind it to your covenant. Better sigils, better odds.',
    weight: 0.1, bindPower: 1.0, stack: 20,
  },
  keenSigil: {
    id: 'keenSigil', name: 'Keen Sigil', kind: 'consumable', slot: null,
    blurb: 'Cut sharper. Holds a stronger binding.',
    weight: 0.1, bindPower: 1.8, stack: 10,
  },
  emberDust: {
    id: 'emberDust', name: 'Ember Dust', kind: 'consumable', slot: null,
    blurb: 'A pinch on the tongue. Restores a flask charge, once.',
    weight: 0.1, stack: 5,
    onUse(player) {
      player.flask.charges = Math.min(player.flask.max, player.flask.charges + 1);
      bus.emit('ui:toast', { text: 'Flask restored', kind: 'good' });
    },
  },
  bloodRoot: {
    id: 'bloodRoot', name: 'Blood Root', kind: 'consumable', slot: null,
    blurb: 'Stops a bleed. Tastes exactly as bad as it sounds.',
    weight: 0.1, stack: 8,
    onUse(player) {
      player.status.buildup.bleed = 0;
      player.status.removeTimed('rotting');
      bus.emit('ui:toast', { text: 'Bleeding staunched', kind: 'good' });
    },
  },
};

export const STARTING_KIT = {
  weapon: 'longsword',
  offhand: 'wakestoneShield',
  armour: 'ashboundPlate',
  talisman: null,
  items: [['emberSigil', 4], ['emberDust', 2], ['bloodRoot', 2]],
};
