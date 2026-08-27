// Enemy archetypes.
//
// `scale` alone sets a character's size: the body is the shared rig, so its
// height is always RIG_HEIGHT times scale, and collision derives from the same
// number. Do not also pass `height` — that is what let a houndling's capsule
// end up a third shorter than the thing you can see.
//
// Attack entries are the contract between design and the AI: a clip, a range
// band, a weight, and the numbers. The clip's own `hitStart`/`hitEnd` events
// decide when the hitbox is live, so retiming an attack is an animation change,
// not a code change.

export const ENEMIES = {

  /** The rank and file: slow, readable, deadly in threes. */
  husk: {
    id: 'husk',
    name: 'Ashen Husk',
    eliteName: 'Husk Warden',
    scale: 0.98,
    radius: 0.34,
    affinity: 'ember',
    stats: { level: 4, vigour: 9, endurance: 8, strength: 11, finesse: 6, resolve: 8, attunement: 4 },
    cinders: 46,
    poise: 12,
    defenceFlat: 4,
    defencePercent: 0.06,
    aggression: 0.62,
    sightRange: 17,
    sightAngle: 1.15,
    preferredRange: 2.0,
    walkSpeed: 1.15,
    runSpeed: 3.0,
    turnRate: 4.4,
    weapon: 'cleaver',
    weaponVisual: { steel: 0x7d766a, hilt: 0x2f261f },
    look: {
      helm: 'hood', pauldrons: 'cloth', fauld: false, cape: false, build: 0.94,
      rimStrength: 0.30, metalness: 0.2,
      palette: {
        flesh: 0x6f5c4a, cloth: 0x2b2721, cloth2: 0x3d3128, leather: 0x362c22,
        metal: 0x5d564d, metalDark: 0x33302b, accent: 0xff7a3c, eye: 0xff9a44,
      },
    },
    attacks: [
      { clip: 'attackLight1', range: 2.5, weight: 3, damage: 34, poiseDamage: 14, cooldown: 0.7, trackTime: 0.22, advance: 2.0, pitch: 0.85 },
      { clip: 'attackLight2', range: 2.4, weight: 2, damage: 30, poiseDamage: 12, cooldown: 0.55, trackTime: 0.16, advance: 1.4, pitch: 0.95 },
      { clip: 'attackHeavy1', range: 2.7, minRange: 1.2, weight: 1.4, damage: 58, poiseDamage: 34, cooldown: 1.5, trackTime: 0.3, advance: 2.6, heavy: true, pitch: 0.62 },
    ],
  },

  /** Carries a shield: punishes greedy swings, has to be opened up. */
  shieldHusk: {
    id: 'shieldHusk',
    name: 'Warden of the Gate',
    scale: 1.04,
    radius: 0.37,
    affinity: 'none',
    stats: { level: 8, vigour: 13, endurance: 12, strength: 14, finesse: 8, resolve: 14, attunement: 5 },
    cinders: 120,
    poise: 34,
    defenceFlat: 9,
    defencePercent: 0.14,
    canGuard: true,
    guardAbsorption: 0.82,
    guardStability: 0.7,
    aggression: 0.45,
    sightRange: 19,
    preferredRange: 2.2,
    walkSpeed: 1.0,
    runSpeed: 2.6,
    turnRate: 3.4,
    weapon: 'longsword',
    weaponVisual: { steel: 0x9aa2ad, hilt: 0x36291f },
    offhand: 'shield',
    offhandVisual: { face: 0x4a4d57 },
    look: {
      helm: 'greathelm', pauldrons: 'plate', fauld: true, cape: false, build: 1.1,
      rimStrength: 0.28, metalness: 0.6,
      palette: {
        flesh: 0x60513f, cloth: 0x26242a, cloth2: 0x3a3038, leather: 0x33291f,
        metal: 0x666a74, metalDark: 0x32343c, accent: 0xffb060, eye: 0xffc06a,
      },
    },
    attacks: [
      { clip: 'attackLight1', range: 2.6, weight: 3, damage: 44, poiseDamage: 20, cooldown: 0.9, trackTime: 0.24, advance: 1.6, pitch: 0.9 },
      { clip: 'attackHeavy1', range: 2.9, minRange: 1.0, weight: 1.6, damage: 76, poiseDamage: 46, cooldown: 1.9, trackTime: 0.34, advance: 2.2, heavy: true, hyperArmour: true, pitch: 0.6 },
      { clip: 'attackHeavy2', range: 2.8, weight: 1, damage: 66, poiseDamage: 40, cooldown: 1.7, trackTime: 0.28, advance: 1.4, heavy: true, pitch: 0.66 },
    ],
  },

  /** Fast, fragile, comes in packs. Teaches you to use the dodge. */
  houndling: {
    id: 'houndling',
    name: 'Fen Houndling',
    scale: 0.62,
    radius: 0.26,
    affinity: 'bloom',
    stats: { level: 3, vigour: 5, endurance: 12, strength: 7, finesse: 12, resolve: 4, attunement: 4 },
    cinders: 28,
    poise: 4,
    aggression: 0.86,
    sightRange: 22,
    sightAngle: 1.5,
    preferredRange: 1.6,
    walkSpeed: 2.0,
    runSpeed: 5.4,
    turnRate: 8.0,
    idleScan: 0.9,
    weapon: null,
    look: {
      helm: 'skull', pauldrons: 'none', fauld: false, cape: false, build: 0.82,
      rimStrength: 0.42, metalness: 0.05,
      palette: {
        flesh: 0x55603c, cloth: 0x2c3222, cloth2: 0x39421f, leather: 0x2a2f1c,
        metal: 0x4a5136, metalDark: 0x272c1c, accent: 0x9ee06a, eye: 0xb6f06a,
      },
    },
    attacks: [
      // Unarmed: the hitbox rides the right hand bone instead of a weapon.
      { clip: 'attackLight2', range: 1.9, weight: 3, damage: 22, poiseDamage: 6, cooldown: 1.05, trackTime: 0.14, advance: 4.2,
        bone: 'handR', hitFrom: [0, 0.05, 0], hitTo: [0, -0.22, 0.1], radius: 0.26, pitch: 1.3,
        status: 'bleed', statusAmount: 9 },
      { clip: 'attackRunning', range: 3.4, minRange: 1.4, weight: 2, damage: 26, poiseDamage: 9, cooldown: 1.7, trackTime: 0.2, advance: 6.5,
        bone: 'handR', hitFrom: [0, 0.05, 0], hitTo: [0, -0.24, 0.12], radius: 0.28, pitch: 1.4 },
    ],
  },

  /** Ranged caster. Forces you to close the distance rather than trade. */
  emberPriest: {
    id: 'emberPriest',
    name: 'Priest of the Kindle',
    scale: 1.0,
    radius: 0.34,
    affinity: 'radiance',
    stats: { level: 10, vigour: 10, endurance: 10, strength: 8, finesse: 9, resolve: 12, attunement: 18 },
    cinders: 210,
    poise: 14,
    defencePercent: 0.08,
    aggression: 0.7,
    sightRange: 26,
    preferredRange: 7.5,
    walkSpeed: 1.3,
    runSpeed: 2.8,
    turnRate: 5.0,
    leashRange: 40,
    weapon: 'staff',
    weaponVisual: { wood: 0x3a2b20, gem: 0xffd27a },
    look: {
      helm: 'crown', pauldrons: 'cloth', fauld: false, cape: true, build: 0.92,
      rimStrength: 0.5, metalness: 0.35, capeColor: 0x6a5a2e,
      palette: {
        flesh: 0x7a6a52, cloth: 0x3a3222, cloth2: 0x6a5a2e, leather: 0x2f2a1c,
        metal: 0xa08a52, metalDark: 0x4a4028, accent: 0xffe58a, eye: 0xfff0b0,
      },
    },
    attacks: [
      { clip: 'cast', range: 24, minRange: 3.5, weight: 3, damage: 52, poiseDamage: 16, cooldown: 2.2, trackTime: 0.34,
        projectile: 'emberBolt', affinity: 'radiance', pitch: 1.0 },
      { clip: 'attackLight1', range: 2.6, weight: 1, damage: 30, poiseDamage: 12, cooldown: 0.8, trackTime: 0.2, advance: 1.2, pitch: 1.1 },
    ],
  },

  /** A bindable spirit: the Pokemon layer's first target. */
  fenWisp: {
    id: 'fenWisp',
    name: 'Fen Wisp',
    eliteName: 'Elder Fen Wisp',
    scale: 0.72,
    radius: 0.3,
    affinity: 'tide',
    stats: { level: 6, vigour: 7, endurance: 14, strength: 6, finesse: 14, resolve: 6, attunement: 14 },
    cinders: 90,
    poise: 6,
    aggression: 0.55,
    sightRange: 20,
    preferredRange: 3.4,
    walkSpeed: 1.6,
    runSpeed: 4.2,
    turnRate: 7.0,
    bindable: true,
    bindThreshold: 0.35,
    wispId: 'fenwisp',
    weapon: null,
    look: {
      helm: 'none', pauldrons: 'none', fauld: false, cape: true, build: 0.7,
      rimStrength: 0.85, metalness: 0.1, capeColor: 0x2c5f7a, eyeGlow: 1,
      palette: {
        flesh: 0x3f6f86, cloth: 0x24485c, cloth2: 0x2c5f7a, leather: 0x1e3a4a,
        metal: 0x4e8aa6, metalDark: 0x1e3a4a, accent: 0x7fe0ff, eye: 0x9ff0ff,
      },
    },
    attacks: [
      { clip: 'cast', range: 14, minRange: 2.2, weight: 3, damage: 34, poiseDamage: 10, cooldown: 1.6, trackTime: 0.3,
        projectile: 'tideLance', affinity: 'tide', status: 'frost', statusAmount: 14, pitch: 1.2 },
      { clip: 'attackLight1', range: 2.4, weight: 1.4, damage: 26, poiseDamage: 8, cooldown: 0.7, trackTime: 0.18, advance: 2.4,
        bone: 'handR', hitFrom: [0, 0.05, 0], hitTo: [0, -0.3, 0.12], radius: 0.3, affinity: 'tide', pitch: 1.25 },
    ],
  },
};

/**
 * The Choir's rank and file. Waterlogged and slow on land, but they do not
 * feel the drag you do, so a fight in the nave is fought on their terms.
 */
ENEMIES.drownedChorister = {
  id: 'drownedChorister',
  name: 'Drowned Chorister',
  eliteName: 'Cantor of the Deep',
  scale: 1.0,
  radius: 0.35,
  affinity: 'tide',
  stats: { level: 14, vigour: 17, endurance: 12, strength: 16, finesse: 10, resolve: 13, attunement: 8 },
  cinders: 190,
  poise: 28,
  defenceFlat: 7,
  defencePercent: 0.10,
  aggression: 0.58,
  sightRange: 19,
  sightAngle: 1.3,
  preferredRange: 2.1,
  walkSpeed: 1.15,
  runSpeed: 3.1,
  turnRate: 4.2,
  weapon: 'cleaver',
  weaponVisual: { steel: 0x6f8286, hilt: 0x232b2c },
  look: {
    helm: 'hood', pauldrons: 'cloth', fauld: true, cape: false, build: 1.02,
    rimStrength: 0.42, metalness: 0.22,
    palette: {
      flesh: 0x4e6a68, cloth: 0x1f2c2e, cloth2: 0x2f4448, leather: 0x24302f,
      metal: 0x59696c, metalDark: 0x2b3436, accent: 0x74d6e0, eye: 0x9ff0ff,
    },
  },
  attacks: [
    { clip: 'attackLight1', range: 2.5, weight: 3, damage: 64, poiseDamage: 22, cooldown: 0.66, trackTime: 0.24, advance: 2.0, affinity: 'tide', pitch: 0.8 },
    { clip: 'attackLight2', range: 2.4, weight: 2.2, damage: 56, poiseDamage: 18, cooldown: 0.54, trackTime: 0.18, advance: 1.5, affinity: 'tide', pitch: 0.9 },
    { clip: 'attackHeavy1', range: 2.8, minRange: 1.2, weight: 1.6, damage: 104, poiseDamage: 46, cooldown: 1.5, trackTime: 0.34, advance: 2.6, heavy: true, affinity: 'tide', pitch: 0.58 },
  ],
};

/**
 * The reason the aisles exist. It will not leave the water, so the dry stone
 * down either side of the nave is a genuine tactical resource rather than
 * scenery — which is the whole design of the zone in one enemy.
 */
ENEMIES.tideLurker = {
  id: 'tideLurker',
  name: 'Tide Lurker',
  eliteName: 'Elder Lurker',
  scale: 0.86,
  radius: 0.36,
  affinity: 'tide',
  stats: { level: 13, vigour: 13, endurance: 17, strength: 14, finesse: 18, resolve: 9, attunement: 10 },
  cinders: 165,
  poise: 12,
  defencePercent: 0.06,
  aggression: 0.88,
  sightRange: 22,
  sightAngle: 1.9,
  preferredRange: 1.9,
  walkSpeed: 1.5,
  runSpeed: 4.6,
  turnRate: 6.6,
  aquatic: true,
  leashRange: 34,
  weapon: null,
  look: {
    helm: 'none', pauldrons: 'none', fauld: false, cape: false, build: 0.82,
    rimStrength: 0.6, metalness: 0.14,
    palette: {
      flesh: 0x2f5b52, cloth: 0x1b3330, cloth2: 0x27494a, leather: 0x18292a,
      metal: 0x3f6f6a, metalDark: 0x16262a, accent: 0x5fe0c0, eye: 0xa8ffe8,
    },
  },
  attacks: [
    { clip: 'attackLight1', range: 2.3, weight: 3, damage: 56, poiseDamage: 15, cooldown: 0.46, trackTime: 0.14, advance: 3.2,
      bone: 'handR', hitFrom: [0, 0.05, 0], hitTo: [0, -0.30, 0.12], radius: 0.30, affinity: 'tide', pitch: 1.3 },
    { clip: 'attackLight2', range: 2.2, weight: 2.4, damage: 48, poiseDamage: 13, cooldown: 0.40, trackTime: 0.12, advance: 2.8,
      bone: 'handL', hitFrom: [0, 0.05, 0], hitTo: [0, -0.30, 0.12], radius: 0.30, affinity: 'tide', pitch: 1.4 },
    { clip: 'attackRunning', range: 6.5, minRange: 2.6, weight: 1.8, damage: 78, poiseDamage: 30, cooldown: 2.0, trackTime: 0.2, advance: 7.0,
      bone: 'handR', hitFrom: [0, 0.05, 0], hitTo: [0, -0.34, 0.14], radius: 0.34, affinity: 'tide', status: 'frost', statusAmount: 12, pitch: 1.1 },
  ],
};

/** A bindable spirit of the flooded hall. The Choir's answer to the fen wisp. */
ENEMIES.choirWisp = {
  id: 'choirWisp',
  name: 'Choir Wisp',
  eliteName: 'Cantor Wisp',
  scale: 0.74,
  radius: 0.3,
  affinity: 'radiance',
  stats: { level: 14, vigour: 10, endurance: 16, strength: 7, finesse: 16, resolve: 8, attunement: 20 },
  cinders: 240,
  poise: 8,
  aggression: 0.6,
  sightRange: 22,
  preferredRange: 4.2,
  walkSpeed: 1.7,
  runSpeed: 4.4,
  turnRate: 7.2,
  bindable: true,
  bindThreshold: 0.32,
  wispId: 'choirwisp',
  weapon: null,
  look: {
    helm: 'none', pauldrons: 'none', fauld: false, cape: true, build: 0.72,
    rimStrength: 0.9, metalness: 0.1, capeColor: 0x7a6a2e, eyeGlow: 1,
    palette: {
      flesh: 0x8a8f6a, cloth: 0x4a4a30, cloth2: 0x7a6a2e, leather: 0x33301f,
      metal: 0xb0a86a, metalDark: 0x3c3a26, accent: 0xffe9a8, eye: 0xfff4c8,
    },
  },
  attacks: [
    { clip: 'cast', range: 18, minRange: 2.6, weight: 3, damage: 58, poiseDamage: 14, cooldown: 1.9, trackTime: 0.3,
      projectile: 'emberBolt', affinity: 'radiance', pitch: 1.3 },
    { clip: 'attackLight1', range: 2.4, weight: 1.4, damage: 40, poiseDamage: 10, cooldown: 0.7, trackTime: 0.18, advance: 2.4,
      bone: 'handR', hitFrom: [0, 0.05, 0], hitTo: [0, -0.3, 0.12], radius: 0.3, affinity: 'radiance', pitch: 1.3 },
  ],
};

/**
 * The Ashfen boss. Phase one is a slow, readable armoured knight; phase two
 * lights up, moves faster, and adds an unblockable ground slam that has to be
 * rolled rather than tanked.
 */
ENEMIES.gatewarden = {
  id: 'gatewarden',
  name: 'The Warden of Ashfen',
  isBoss: true,
  scale: 1.34,
  radius: 0.52,
  affinity: 'none',
  stats: { level: 20, vigour: 30, endurance: 20, strength: 22, finesse: 10, resolve: 26, attunement: 10 },
  cinders: 1800,
  healthScale: 2.6,
  poise: 92,
  defenceFlat: 14,
  defencePercent: 0.18,
  aggression: 0.6,
  sightRange: 30,
  sightAngle: 2.0,
  preferredRange: 3.0,
  walkSpeed: 1.3,
  runSpeed: 3.2,
  turnRate: 3.0,
  parryable: false,
  backstabImmune: true,
  weapon: 'greatsword',
  weaponVisual: { steel: 0x8d94a2, hilt: 0x2a2118, pommel: 0x4a4640 },
  look: {
    helm: 'greathelm', pauldrons: 'spiked', fauld: true, cape: true, build: 1.24,
    rimStrength: 0.42, metalness: 0.7, capeColor: 0x4a1c18,
    palette: {
      flesh: 0x4a3d30, cloth: 0x201d22, cloth2: 0x4a1c18, leather: 0x2c241c,
      metal: 0x6a6e78, metalDark: 0x2e3038, accent: 0xff8a3c, eye: 0xff7a3c,
    },
  },
  // A first boss should be readable, but not answerable by rolling on reaction
  // to everything. The heavies telegraph for well over half a second; the jab
  // does not, and the sweep keeps tracking you most of the way through its
  // wind-up, so rolling early just puts you where it is about to swing.
  attacks: [
    { clip: 'attackHeavy1', range: 3.9, weight: 2.6, damage: 118, poiseDamage: 62, cooldown: 1.9, trackTime: 0.34, advance: 2.6, heavy: true, hyperArmour: true, pitch: 0.5 },
    { clip: 'attackHeavy2', range: 3.9, weight: 2.4, damage: 104, poiseDamage: 56, cooldown: 1.7, trackTime: 0.62, advance: 2.4, heavy: true, hyperArmour: true, pitch: 0.55 },
    { clip: 'attackLight1', range: 3.4, weight: 2, damage: 72, poiseDamage: 34, cooldown: 1.0, trackTime: 0.26, advance: 2.2, pitch: 0.7 },
    { clip: 'attackLight2', range: 3.2, weight: 2.2, damage: 58, poiseDamage: 26, cooldown: 0.7, trackTime: 0.30, advance: 2.6, speed: 1.25, pitch: 0.95 },
    { clip: 'attackRunning', range: 7.5, minRange: 3.4, weight: 1.6, damage: 96, poiseDamage: 44, cooldown: 2.6, trackTime: 0.3, advance: 8.0, hyperArmour: true, pitch: 0.8 },
  ],
  phases: [
    { at: 1.0, title: 'The Warden of Ashfen' },
    {
      at: 0.5,
      title: 'The Ember Answers',
      affinity: 'ember',
      aggression: 0.82,
      speedScale: 1.22,
      auraColour: 0xff7a3c,
      transitionTime: 1.8,
      attacks: [
        { clip: 'attackHeavy1', range: 4.1, weight: 2.6, damage: 132, poiseDamage: 70, cooldown: 1.4, trackTime: 0.42, advance: 3.0, heavy: true, hyperArmour: true, affinity: 'ember', pitch: 0.48 },
        { clip: 'attackHeavy2', range: 4.2, weight: 2.6, damage: 118, poiseDamage: 64, cooldown: 1.3, trackTime: 0.70, advance: 2.8, heavy: true, hyperArmour: true, affinity: 'ember', unblockable: true, pitch: 0.52 },
        { clip: 'attackLight1', range: 3.6, weight: 2.4, damage: 84, poiseDamage: 38, cooldown: 0.8, trackTime: 0.34, advance: 2.6, affinity: 'ember', speed: 1.15, pitch: 0.72 },
        { clip: 'attackLight2', range: 3.4, weight: 2.6, damage: 70, poiseDamage: 30, cooldown: 0.55, trackTime: 0.36, advance: 3.0, affinity: 'ember', speed: 1.4, pitch: 1.0 },
        { clip: 'attackLight3', range: 4.2, weight: 2, damage: 96, poiseDamage: 50, cooldown: 1.6, trackTime: 0.24, advance: 2.0, heavy: true, hyperArmour: true, affinity: 'ember', pitch: 0.6 },
        { clip: 'attackRunning', range: 9.0, minRange: 3.6, weight: 1.8, damage: 110, poiseDamage: 50, cooldown: 2.0, trackTime: 0.28, advance: 10.0, hyperArmour: true, affinity: 'ember', pitch: 0.85 },
      ],
    },
  ],
};

/**
 * The Choir boss: what is left of the precentor who kept the hymn going while
 * the water came up.
 *
 * Where the Warden is a wall you learn to walk through, the Precentor is a
 * rhythm you learn to read. Phase one is a long-reach spear cadence with
 * genuinely punishable recoveries. Phase two floods the chancel — the arena
 * itself rises — and adds a tide burst that cannot be blocked, only left.
 */
ENEMIES.precentor = {
  id: 'precentor',
  name: 'The Precentor',
  isBoss: true,
  scale: 1.26,
  radius: 0.50,
  affinity: 'tide',
  stats: { level: 30, vigour: 34, endurance: 24, strength: 20, finesse: 24, resolve: 28, attunement: 22 },
  cinders: 3200,
  healthScale: 2.9,
  poise: 84,
  defenceFlat: 16,
  defencePercent: 0.20,
  aggression: 0.7,
  sightRange: 32,
  sightAngle: 2.2,
  preferredRange: 3.6,
  walkSpeed: 1.5,
  runSpeed: 3.6,
  turnRate: 3.4,
  parryable: false,
  backstabImmune: true,
  weapon: 'greatsword',
  weaponVisual: { steel: 0x8fb0b6, hilt: 0x1e2a2c, pommel: 0x6d6034 },
  look: {
    helm: 'crown', pauldrons: 'spiked', fauld: true, cape: true, build: 1.18,
    rimStrength: 0.55, metalness: 0.62, capeColor: 0x1d4a52,
    palette: {
      flesh: 0x486460, cloth: 0x172427, cloth2: 0x1d4a52, leather: 0x1e2a2c,
      metal: 0x6d7f84, metalDark: 0x2a3538, accent: 0x7fe6ff, eye: 0xb4f4ff,
    },
  },
  attacks: [
    { clip: 'attackHeavy1', range: 4.1, weight: 2.4, damage: 126, poiseDamage: 60, cooldown: 2.0, trackTime: 0.36, advance: 2.8, heavy: true, hyperArmour: true, affinity: 'tide', pitch: 0.52 },
    { clip: 'attackHeavy2', range: 4.0, weight: 2.2, damage: 112, poiseDamage: 54, cooldown: 1.8, trackTime: 0.66, advance: 2.4, heavy: true, hyperArmour: true, affinity: 'tide', pitch: 0.56 },
    { clip: 'attackLight1', range: 3.6, weight: 2.6, damage: 78, poiseDamage: 32, cooldown: 0.9, trackTime: 0.24, advance: 2.4, affinity: 'tide', pitch: 0.74 },
    { clip: 'attackLight2', range: 3.4, weight: 2.4, damage: 64, poiseDamage: 26, cooldown: 0.66, trackTime: 0.28, advance: 2.8, speed: 1.25, affinity: 'tide', pitch: 0.98 },
    { clip: 'attackLight3', range: 4.4, weight: 1.8, damage: 98, poiseDamage: 46, cooldown: 1.5, trackTime: 0.26, advance: 2.2, heavy: true, hyperArmour: true, affinity: 'tide', pitch: 0.64 },
    { clip: 'cast', range: 22, minRange: 5.0, weight: 2.0, damage: 84, poiseDamage: 24, cooldown: 3.0, trackTime: 0.36,
      projectile: 'tideLance', affinity: 'tide', status: 'frost', statusAmount: 20, pitch: 0.9 },
  ],
  phases: [
    { at: 1.0, title: 'The Precentor' },
    {
      at: 0.52,
      title: 'The Hymn Resumes',
      affinity: 'tide',
      aggression: 0.9,
      speedScale: 1.24,
      auraColour: 0x6fd8f0,
      transitionTime: 1.9,
      attacks: [
        { clip: 'attackHeavy1', range: 4.3, weight: 2.6, damage: 142, poiseDamage: 68, cooldown: 1.5, trackTime: 0.42, advance: 3.2, heavy: true, hyperArmour: true, affinity: 'tide', pitch: 0.50 },
        { clip: 'attackHeavy2', range: 4.4, weight: 2.6, damage: 128, poiseDamage: 62, cooldown: 1.4, trackTime: 0.72, advance: 3.0, heavy: true, hyperArmour: true, affinity: 'tide', unblockable: true, pitch: 0.54 },
        { clip: 'attackLight1', range: 3.8, weight: 2.4, damage: 92, poiseDamage: 36, cooldown: 0.76, trackTime: 0.32, advance: 2.8, affinity: 'tide', speed: 1.18, pitch: 0.76 },
        { clip: 'attackLight2', range: 3.6, weight: 2.6, damage: 76, poiseDamage: 30, cooldown: 0.52, trackTime: 0.34, advance: 3.2, affinity: 'tide', speed: 1.42, pitch: 1.02 },
        { clip: 'attackLight3', range: 4.6, weight: 2.2, damage: 108, poiseDamage: 52, cooldown: 1.3, trackTime: 0.24, advance: 2.4, heavy: true, hyperArmour: true, affinity: 'tide', pitch: 0.62 },
        { clip: 'cast', range: 24, minRange: 4.0, weight: 2.4, damage: 104, poiseDamage: 30, cooldown: 2.1, trackTime: 0.3,
          projectile: 'tideLance', affinity: 'tide', status: 'frost', statusAmount: 28, unblockable: true, pitch: 0.86 },
        { clip: 'attackRunning', range: 9.0, minRange: 3.8, weight: 1.8, damage: 118, poiseDamage: 52, cooldown: 2.2, trackTime: 0.28, advance: 10.0, hyperArmour: true, affinity: 'tide', pitch: 0.84 },
      ],
    },
  ],
};

/** Encounter tiers exist so the same archetype can staff an early and a late fight. */
export const TIER_LABEL = { 1: '', 2: 'Hardened', 3: 'Ancient' };
