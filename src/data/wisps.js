// Wisps: the spirits you bind.
//
// Each has an affinity that plugs straight into the combat triangle, a small
// move list learned by level, and — for most — something it becomes.

export const WISPS = {

  fenwisp: {
    id: 'fenwisp',
    name: 'Fen Wisp',
    affinity: 'tide',
    colour: 0x7fe0ff,
    blurb: 'A drowned lantern-light that never found the shore. Cold, patient, and quietly loyal.',
    base: { health: 120, power: 34, speed: 4.2, poise: 6 },
    scale: 0.7,
    evolvesTo: 'tidewarden',
    evolveLevel: 16,
    moves: [
      { id: 'tideLance', name: 'Tide Lance', level: 1, kind: 'projectile', affinity: 'tide', power: 1.0, cost: 12, cooldown: 3.2, status: 'frost', statusAmount: 12 },
      { id: 'undertow', name: 'Undertow', level: 6, kind: 'aoe', affinity: 'tide', power: 0.7, cost: 20, cooldown: 8, slow: 0.4, radius: 4 },
      { id: 'lull', name: 'Lull', level: 11, kind: 'buff', affinity: 'tide', cost: 18, cooldown: 22, heal: 0.22 },
    ],
  },

  tidewarden: {
    id: 'tidewarden',
    name: 'Tidewarden',
    affinity: 'tide',
    colour: 0x4fb8e8,
    blurb: 'It remembers being a lantern. It has decided to be a wall instead.',
    base: { health: 260, power: 62, speed: 3.6, poise: 22 },
    scale: 0.95,
    moves: [
      { id: 'tideLance', name: 'Tide Lance', level: 1, kind: 'projectile', affinity: 'tide', power: 1.0, cost: 12, cooldown: 2.6, status: 'frost', statusAmount: 18 },
      { id: 'undertow', name: 'Undertow', level: 1, kind: 'aoe', affinity: 'tide', power: 0.9, cost: 20, cooldown: 7, slow: 0.5, radius: 5.5 },
      { id: 'breakwater', name: 'Breakwater', level: 20, kind: 'guard', affinity: 'tide', cost: 24, cooldown: 18, absorb: 0.6, duration: 6 },
    ],
  },

  cinderling: {
    id: 'cinderling',
    name: 'Cinderling',
    affinity: 'ember',
    colour: 0xff9a4d,
    blurb: 'A scrap of the fallen sun, too small to warm anything but too stubborn to go out.',
    base: { health: 96, power: 44, speed: 5.0, poise: 4 },
    scale: 0.6,
    evolvesTo: 'pyrewisp',
    evolveLevel: 14,
    evolveBond: 320,
    moves: [
      { id: 'emberBolt', name: 'Ember Bolt', level: 1, kind: 'projectile', affinity: 'ember', power: 1.1, cost: 10, cooldown: 2.4 },
      { id: 'kindle', name: 'Kindle', level: 5, kind: 'buff', affinity: 'ember', cost: 16, cooldown: 20, damageBonus: 0.2, duration: 12 },
      { id: 'flashfire', name: 'Flashfire', level: 12, kind: 'aoe', affinity: 'ember', power: 1.3, cost: 26, cooldown: 10, radius: 4.5 },
    ],
  },

  pyrewisp: {
    id: 'pyrewisp',
    name: 'Pyrewisp',
    affinity: 'ember',
    colour: 0xff6a24,
    blurb: 'It has stopped being a scrap. Stand behind it.',
    base: { health: 190, power: 84, speed: 4.4, poise: 12 },
    scale: 0.85,
    moves: [
      { id: 'emberBolt', name: 'Ember Bolt', level: 1, kind: 'projectile', affinity: 'ember', power: 1.2, cost: 10, cooldown: 1.9 },
      { id: 'flashfire', name: 'Flashfire', level: 1, kind: 'aoe', affinity: 'ember', power: 1.5, cost: 26, cooldown: 8, radius: 5.5 },
      { id: 'pyreCrown', name: 'Pyre Crown', level: 22, kind: 'buff', affinity: 'ember', cost: 30, cooldown: 30, damageBonus: 0.35, duration: 10 },
    ],
  },

  bloomshade: {
    id: 'bloomshade',
    name: 'Bloomshade',
    affinity: 'bloom',
    colour: 0x86d05a,
    blurb: 'Everything it touches grows. Not always in a shape you would want.',
    base: { health: 150, power: 30, speed: 3.8, poise: 8 },
    scale: 0.75,
    moves: [
      { id: 'thornlash', name: 'Thornlash', level: 1, kind: 'melee', affinity: 'bloom', power: 1.0, cost: 8, cooldown: 1.8, status: 'bleed', statusAmount: 14 },
      { id: 'greenward', name: 'Greenward', level: 4, kind: 'heal', affinity: 'bloom', cost: 22, cooldown: 16, heal: 0.3 },
      { id: 'rotbloom', name: 'Rotbloom', level: 13, kind: 'aoe', affinity: 'bloom', power: 0.8, cost: 24, cooldown: 12, status: 'rot', statusAmount: 30, radius: 4 },
    ],
  },

  gravemote: {
    id: 'gravemote',
    name: 'Gravemote',
    affinity: 'void',
    colour: 0xa97ce0,
    blurb: 'The part of a person that stays behind after the rest of them has finished leaving.',
    base: { health: 110, power: 52, speed: 4.6, poise: 5 },
    scale: 0.65,
    moves: [
      { id: 'unmake', name: 'Unmake', level: 1, kind: 'projectile', affinity: 'void', power: 1.15, cost: 14, cooldown: 3.0 },
      { id: 'hollow', name: 'Hollow', level: 8, kind: 'debuff', affinity: 'void', cost: 20, cooldown: 18, defenceDown: 0.25, duration: 10 },
    ],
  },

  lampbearer: {
    id: 'lampbearer',
    name: 'Lampbearer',
    affinity: 'radiance',
    colour: 0xffe58a,
    blurb: 'Carries a light for someone who is not coming. Will carry one for you instead.',
    base: { health: 140, power: 46, speed: 4.0, poise: 10 },
    scale: 0.72,
    moves: [
      { id: 'sunlance', name: 'Sunlance', level: 1, kind: 'projectile', affinity: 'radiance', power: 1.05, cost: 12, cooldown: 2.6 },
      { id: 'vigil', name: 'Vigil', level: 7, kind: 'heal', affinity: 'radiance', cost: 24, cooldown: 20, heal: 0.26 },
      { id: 'dawnbreak', name: 'Dawnbreak', level: 15, kind: 'aoe', affinity: 'radiance', power: 1.4, cost: 30, cooldown: 14, radius: 5 },
    ],
  },

  choirwisp: {
    id: 'choirwisp',
    name: 'Choir Wisp',
    affinity: 'radiance',
    colour: 0xffe9a8,
    blurb: 'One voice of a hymn that drowned mid-verse. It has been holding the note ever since.',
    base: { health: 165, power: 58, speed: 4.3, poise: 9 },
    scale: 0.74,
    evolvesTo: 'lampbearer',
    evolveLevel: 18,
    moves: [
      { id: 'sunlance', name: 'Sunlance', level: 1, kind: 'projectile', affinity: 'radiance', power: 1.1, cost: 12, cooldown: 2.8 },
      { id: 'descant', name: 'Descant', level: 6, kind: 'debuff', affinity: 'radiance', cost: 18, cooldown: 16, defenceDown: 0.2, duration: 9 },
      { id: 'vigil', name: 'Vigil', level: 12, kind: 'heal', affinity: 'radiance', cost: 24, cooldown: 20, heal: 0.24 },
    ],
  },
};

export const WISP_IDS = Object.keys(WISPS);
