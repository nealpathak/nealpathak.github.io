// Companions: the two who travel with you, and the two who have opinions.

export const COMPANIONS = {

  seryn: {
    id: 'seryn',
    name: 'Seryn of the Long Watch',
    short: 'Seryn',
    affinity: 'radiance',
    scale: 1.0,
    height: 1.76,
    power: 48,
    bondRadius: 10,
    blurb: 'Held the gate at Cinderreach for eleven days. Does not talk about the twelfth.',
    stats: { level: 8, vigour: 14, endurance: 13, strength: 13, finesse: 11, resolve: 15, attunement: 8 },
    weapon: 'longsword',
    weaponVisual: { steel: 0xdbe2ee, hilt: 0x3a2f22, pommel: 0xc0a060 },
    offhand: 'shield',
    offhandVisual: { face: 0x6a6458 },
    look: {
      helm: 'greathelm', pauldrons: 'plate', fauld: true, cape: true, build: 1.0,
      rimStrength: 0.34, metalness: 0.55, capeColor: 0x8a7b3e,
      palette: {
        flesh: 0x7d6a54, cloth: 0x2e2b26, cloth2: 0x8a7b3e, leather: 0x3d3126,
        metal: 0x8b8d94, metalDark: 0x3e4048, accent: 0xffe58a, eye: 0xfff0b8,
      },
    },
    lines: {
      greet: 'Still upright. Good.',
      lowHealth: 'Fall back. I have this.',
      bondB: "You fight like someone who intends to live. I approve.",
      bondA: "Whatever is at the end of this — we go together.",
      rest: 'Sit. The Vale will still be dying in an hour.',
    },
  },

  mote: {
    id: 'mote',
    name: 'Mote',
    short: 'Mote',
    affinity: 'void',
    scale: 0.68,
    height: 1.24,
    power: 40,
    bondRadius: 12,
    blurb: 'Followed you out of the fen and has not explained why. It answers to Mote because you started calling it that.',
    stats: { level: 6, vigour: 8, endurance: 14, strength: 6, finesse: 14, resolve: 8, attunement: 16 },
    weapon: null,
    moves: [
      { id: 'unmake', name: 'Unmake', kind: 'projectile', affinity: 'void', power: 1.1, cooldown: 3.0 },
    ],
    look: {
      helm: 'none', pauldrons: 'none', fauld: false, cape: true, build: 0.72,
      rimStrength: 0.9, metalness: 0.1, eyeGlow: 1, capeColor: 0x5a3f7a,
      palette: {
        flesh: 0x6a4f8a, cloth: 0x39284d, cloth2: 0x5a3f7a, leather: 0x2b1e3a,
        metal: 0x7a5aa0, metalDark: 0x2b1e3a, accent: 0xa97ce0, eye: 0xd8c0ff,
      },
    },
    lines: {
      greet: '…',
      lowHealth: '(it presses close, cold and insistent)',
      bondB: '(it has started walking on your left, always your left)',
      bondA: '(when you sleep it keeps the flame lit)',
      rest: '(it settles into the ash and dims)',
    },
  },
};
