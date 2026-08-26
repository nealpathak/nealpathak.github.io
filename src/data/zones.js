// Zone definitions.
//
// Terrain is shaped, not merely generated: the ridge lines, the sunken bowl and
// the walkable path are all placed by hand, and the noise only fills in between
// them. Read the shapers list top to bottom and you are reading the level.

export const ZONES = {

  ashfen: {
    id: 'ashfen',
    name: 'Ashfen Approach',
    mood: 'ashfen',
    seed: 1471,
    start: [0, 62],

    terrain: {
      size: 240,
      resolution: 257,
      amplitude: 8.5,
      frequency: 2.6,
      detail: 1.0,
      shapers: [
        // The valley walls: two ridges running roughly north-south, so the
        // player is funnelled toward the ruin without an invisible wall.
        ['ridge', [[-62, 0, 110], [-70, 0, 40], [-58, 0, -30], [-72, 0, -95]], 42, 26, 1.5],
        ['ridge', [[64, 0, 112], [76, 0, 30], [62, 0, -40], [78, 0, -100]], 44, 28, 1.5],
        // A cross ridge behind the ruin, closing the far end.
        ['ridge', [[-80, 0, -92], [0, 0, -104], [80, 0, -96]], 34, 22, 1.8],

        // The fen itself: a bowl with a lip all the way round, so the water in
        // it stays in it. Deepest at the middle and waist-high at worst.
        //
        // Set clear of the road on purpose. The path shaper runs last and wins
        // wherever the two overlap, so a pond drawn under the road is simply
        // filled back in by it.
        ['pool', -2, 26, 15, -2.5, 2.0, 9],

        // The ruin sits on a shelf above the fen.
        ['plateau', 6, -48, 22, 6.4, 12],
        // The shrine terraces, just off the path.
        ['plateau', -26, 6, 7.5, 1.6, 5],
        ['plateau', 13, -32, 6.5, 3.6, 5],

        // The road. Its control points carry their own heights, so the route is
        // always walkable no matter what the noise wanted to do.
        ['path', [
          [2, 0.2, 96], [0, 0.1, 74], [-8, 0.4, 54], [-20, 1.2, 30],
          [-22, 1.6, 8], [-12, 2.6, -10], [0, 4.6, -28], [6, 6.4, -44], [8, 6.4, -58],
          // Past the ruin, to the waygate. The Warden stands between the two,
          // which is the only gate this zone actually has.
          [7, 6.2, -68], [6, 5.8, -76],
        ], 3.6, { smooth: 7 }],
        // A branch down to the fen.
        // A branch wading down into the fen. Its far end sits under the
        // waterline, which is the point: the shortcut costs you your footing.
        ['path', [[-19, 1.1, 29], [-12, -0.4, 27], [-6, -2.1, 26]], 2.4, { smooth: 5 }],
      ],
    },

    water: {
      centre: [-2, 26], size: 48, edgeFade: 0.16,
      level: -1.2, maxDepth: 2.0,
      shallow: 0x5c6f52, deep: 0x1b2a24, foam: 0xd2d8bd,
      // Still, silted water under a low sun. A mirror finish here turns the
      // whole pond into one blown-out specular highlight.
      swell: 0.05, choppy: 0.7, opacity: 0.94, flow: 0.5,
      roughness: 0.44, ripple: 0.7,
    },

    foliage: {
      kinds: ['grass', 'ash', 'scrub', 'reed'],
      radius: 96,
      spacing: 0.46,
      centre: [0, 10],
    },

    props: [
      // --- the ruin on the shelf ---
      { kind: 'archway', at: [[6, -34, 0]], opts: { span: 5.0, height: 6.0, thickness: 1.0 } },
      { kind: 'ruinWall', at: [
        [-8, -44, 1.5708], [20, -44, 1.5708],
        [-4, -60, 0], [16, -60, 0],
      ], opts: { length: 9, height: 4.0, thickness: 0.8, ruin: 0.45 } },
      { kind: 'column', at: [
        [-2, -46, 0], [14, -46, 0], [-2, -56, 0], [14, -56, 0],
      ], opts: { height: 5.0, radius: 0.44, broken: false } },
      { kind: 'column', at: [[4, -50, 0], [9, -54, 0]], opts: { height: 5.0, radius: 0.44, broken: true } },
      { kind: 'stairs', at: [[6, -30, 3.1416]], opts: { steps: 12, width: 4.2, rise: 0.3, run: 0.5 } },
      { kind: 'banner', at: [[1, -42, 0], [11, -42, 0]], opts: { height: 4.4, color: 0x7a2f28 } },

      { kind: 'waygate', at: [[6, -77, 0]], opts: { span: 3.2, height: 5.0, veil: 0x7fd8ff },
        id: 'gate:ashfen:descent', name: 'The Sunken Choir', to: 'choir', arrive: 'gate:choir:mouth' },

      // --- shrines ---
      // Two of them: one early, and one on the shelf below the ruin so the walk
      // back to the boss is a walk and not a pilgrimage.
      { kind: 'emberwake', at: [[-26, 6, 0.4]], id: 'shrine:ashfen:wayside', name: 'Wayside Ember' },
      { kind: 'emberwake', at: [[13, -32, -2.4]], id: 'shrine:ashfen:gate', name: 'Ember Below the Gate' },

      // --- scatter ---
      { kind: 'boulder', count: 34, opts: { radius: 1.5 }, minGap: 6,
        area: { x: 0, z: 10, radius: 100 }, maxSlope: 0.85,
        avoid: [[-26, 6, 9], [13, -32, 9], [6, -48, 26], [-2, 26, 17]] },
      { kind: 'deadTree', count: 26, opts: { height: 8 }, minGap: 9,
        area: { x: 0, z: 20, radius: 96 }, maxSlope: 0.42,
        avoid: [[-26, 6, 11], [13, -32, 11], [6, -48, 28], [-2, 26, 19]] },
      { kind: 'paleTree', count: 14, opts: { height: 10 }, minGap: 14,
        area: { x: 0, z: 60, radius: 70 }, maxSlope: 0.36,
        avoid: [[-26, 6, 12]] },
      { kind: 'column', count: 7, opts: { height: 4.4, radius: 0.4, broken: true }, minGap: 11,
        area: { x: 0, z: -6, radius: 46 }, maxSlope: 0.3 },
    ],

    spawns: [
      { kind: 'husk', at: [-16, 42], count: 1, tier: 1 },
      { kind: 'husk', at: [-19, 30], count: 2, tier: 1 },
      { kind: 'husk', at: [-14, 18], count: 1, tier: 1 },
      { kind: 'houndling', at: [-12, 24], count: 2, tier: 1 },
      { kind: 'husk', at: [-9, -4], count: 2, tier: 2 },
      { kind: 'shieldHusk', at: [0, -22], count: 1, tier: 2 },
      { kind: 'houndling', at: [-4, -14], count: 3, tier: 1 },
      { kind: 'husk', at: [4, -40], count: 2, tier: 2 },
      { kind: 'shieldHusk', at: [10, -46], count: 1, tier: 2 },
      { kind: 'emberPriest', at: [6, -54], count: 1, tier: 3, elite: true },
      // Fen creatures, guarding the optional bowl.
      { kind: 'fenWisp', at: [-3, 25], count: 3, tier: 2, elite: true },
    ],

    boss: {
      kind: 'gatewarden',
      at: [6, -52],
      arena: { at: [6, -48], radius: 17 },
    },
  },

  choir: {
    id: 'choir',
    name: 'The Sunken Choir',
    mood: 'choir',
    seed: 8837,
    start: [0, 84],

    // A cathedral in a sinkhole, flooded to the height of the pew backs. The
    // shape of the level is one long nave running north to south, and every
    // decision in it is about whether you fight in the water or out of it.
    terrain: {
      size: 220,
      resolution: 257,
      amplitude: 4.2,
      frequency: 2.4,
      detail: 1.1,
      shapers: [
        // The shell: a ring of broken rock standing in for the outer walls.
        ['ridge', [
          [-96, 0, 60], [-88, 0, 0], [-94, 0, -60], [-40, 0, -100], [40, 0, -102],
          [94, 0, -58], [90, 0, 4], [96, 0, 62], [40, 0, 96], [-42, 0, 94], [-96, 0, 60],
        ], 34, 26, 1.35],

        // The nave. Long and narrow, because a cathedral is a corridor: the
        // aspect ratio squeezes the pool's x axis so one shaper floods a hall
        // 34 across and 88 down rather than a lake. The floor is authored flat
        // so the water over it is an even depth, and turns up near the walls so
        // the shore is a real line.
        ['pool', 0, 0, 44, -5.6, 2.2, 16, 2.6],

        // The two aisles: dry stone either side of the nave, and the reason the
        // Lurkers cannot follow you everywhere.
        ['plateau', -21, 8, 7, -3.9, 5],
        ['plateau', 21, -2, 7, -3.9, 5],
        // The crossing, where the bell came down.
        ['plateau', 0, -16, 7, -3.95, 5],
        // The chancel: dry, raised, and where the Precentor waits.
        ['plateau', 0, -46, 15, -1.6, 10],

        // The causeway down from the rim, and the chancel steps.
        ['path', [
          [0, 3.4, 92], [0, 3.0, 80], [0, 1.2, 68], [0, -1.2, 58], [0, -3.2, 50], [0, -4.4, 42],
        ], 4.2, { smooth: 8 }],
        ['path', [[0, -4.6, -30], [0, -3.4, -35], [0, -1.6, -40]], 5.0, { smooth: 5 }],
        // Two causeways out to the aisles, so they are a choice and not a swim.
        ['path', [[-11, -4.9, 9], [-16, -4.4, 8], [-20, -3.9, 8]], 2.6, { smooth: 4 }],
        ['path', [[11, -4.9, -1], [16, -4.4, -2], [20, -3.9, -2]], 2.6, { smooth: 4 }],
      ],
    },

    water: {
      centre: [0, 0], size: 128, edgeFade: 0.10,
      level: -4.4, maxDepth: 1.6,
      shallow: 0x497f8c, deep: 0x1b4450, foam: 0xc8ecf4,
      swell: 0.075, choppy: 0.9, opacity: 0.9, flow: 0.8,
      roughness: 0.26, ripple: 0.5,
    },

    foliage: {
      kinds: ['kelp', 'reed'],
      radius: 62,
      spacing: 0.8,
      centre: [0, 0],
    },

    props: [
      // --- the nave ---
      // Vault ribs across the hall, springing from the line of the walls.
      // Nothing spans between them any more, so the sky comes straight down
      // the middle of the nave.
      { kind: 'vaultRib', at: [
        [0, 34, 0], [0, 22, 0], [0, 10, 0], [0, -2, 0], [0, -14, 0],
      ], opts: { span: 34, height: 17, thickness: 0.8 } },

      // The outer walls, running the length of the nave.
      { kind: 'ruinWall', at: [
        [-19, 32, 1.5708], [-19, 20, 1.5708], [-19, 8, 1.5708], [-19, -4, 1.5708], [-19, -16, 1.5708],
        [19, 32, 1.5708], [19, 20, 1.5708], [19, 8, 1.5708], [19, -4, 1.5708], [19, -16, 1.5708],
      ], opts: { length: 11, height: 7.0, thickness: 0.9, ruin: 0.5 } },

      // Pews, in rows, with the water up to their backs.
      { kind: 'pew', at: [
        [-8, 28, 0], [-8, 22, 0], [-8, 16, 0], [-8, 10, 0], [-8, 4, 0], [-8, -2, 0],
        [8, 28, 0], [8, 22, 0], [8, 16, 0], [8, 10, 0], [8, 4, 0], [8, -2, 0],
      ], opts: { length: 7.0, ruin: 0.34 } },

      // --- the aisles ---
      { kind: 'column', at: [
        [-21, 12, 0], [-21, 4, 0], [21, 2, 0], [21, -6, 0],
      ], opts: { height: 6.5, radius: 0.5, broken: false } },
      { kind: 'statue', at: [
        [-21, 8, 2.2], [21, -2, 4.1],
      ], opts: { height: 3.8, headless: true } },

      // --- the crossing ---
      { kind: 'drownedBell', at: [[0, -16, 0.8]], opts: { radius: 2.6, height: 3.6, tilt: 0.46 } },

      // --- the chancel ---
      { kind: 'archway', at: [[0, -34, 0]], opts: { span: 6.0, height: 7.0, thickness: 1.1 } },
      { kind: 'stairs', at: [[0, -30, 3.1416]], opts: { steps: 10, width: 5.4, rise: 0.28, run: 0.5 } },
      { kind: 'column', at: [
        [-9, -44, 0], [9, -44, 0], [-9, -54, 0], [9, -54, 0],
      ], opts: { height: 7.5, radius: 0.52, broken: false } },
      { kind: 'statue', at: [[0, -56, 0]], opts: { height: 5.0, headless: false } },
      { kind: 'banner', at: [[-5, -40, 0], [5, -40, 0]], opts: { height: 5.0, color: 0x1d4a52 } },

      // --- the way in and out ---
      { kind: 'waygate', at: [[0, 88, 3.1416]], opts: { span: 3.2, height: 5.0, veil: 0xffb257 },
        id: 'gate:choir:mouth', name: 'Ashfen Approach', to: 'ashfen', arrive: 'gate:ashfen:descent' },

      // --- shrines ---
      { kind: 'emberwake', at: [[-4, 46, 0.5]], id: 'shrine:choir:causeway', name: 'Ember on the Causeway' },
      { kind: 'emberwake', at: [[6, -32, -2.0]], id: 'shrine:choir:chancel', name: 'Ember at the Chancel' },

      // --- scatter ---
      { kind: 'boulder', count: 40, opts: { radius: 1.7 }, minGap: 7,
        area: { x: 0, z: 0, radius: 92 }, maxSlope: 0.9,
        avoid: [[-4, 46, 9], [6, -32, 9], [0, -46, 20], [0, -16, 11]] },
      { kind: 'column', count: 9, opts: { height: 5.0, radius: 0.44, broken: true }, minGap: 8,
        area: { x: 0, z: 4, radius: 34 }, maxSlope: 0.34,
        avoid: [[0, -16, 10], [0, -46, 18]] },
      { kind: 'pew', count: 6, opts: { length: 5.5, ruin: 0.62 }, minGap: 6,
        area: { x: 0, z: 8, radius: 26 }, maxSlope: 0.3,
        avoid: [[0, -16, 10]] },
    ],

    spawns: [
      // The causeway down: choristers on dry stone, so the first fight here is
      // fought on footing you understand.
      { kind: 'drownedChorister', at: [0, 54], count: 2, tier: 1 },
      { kind: 'drownedChorister', at: [0, 44], count: 2, tier: 1 },
      // Then the water, and the things that live in it.
      { kind: 'tideLurker', at: [-4, 30], count: 3, tier: 1 },
      { kind: 'tideLurker', at: [5, 20], count: 3, tier: 1 },
      { kind: 'drownedChorister', at: [8, 14], count: 2, tier: 2 },
      { kind: 'shieldHusk', at: [-8, 8], count: 2, tier: 3 },
      { kind: 'tideLurker', at: [0, -4], count: 4, tier: 2 },
      // The aisles are held, so taking one costs something.
      { kind: 'drownedChorister', at: [-21, 8], count: 2, tier: 2, elite: true },
      { kind: 'emberPriest', at: [21, -2], count: 1, tier: 3, elite: true },
      // The crossing, under the bell.
      { kind: 'drownedChorister', at: [0, -16], count: 3, tier: 3 },
      { kind: 'choirWisp', at: [0, -22], count: 2, tier: 2, elite: true },
      // The chancel steps.
      { kind: 'shieldHusk', at: [0, -34], count: 2, tier: 3, elite: true },
    ],

    boss: {
      kind: 'precentor',
      at: [0, -50],
      arena: { at: [0, -46], radius: 15 },
    },
  },
};

export const DEFAULT_ZONE = 'ashfen';
