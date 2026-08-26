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

        // The fen itself: a shallow bowl of standing water and reeds.
        ['basin', -14, 26, 26, 4.2, 14],

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
        ], 3.6, { smooth: 7 }],
        // A branch down to the fen.
        ['path', [[-20, 1.2, 30], [-16, -1.4, 20], [-14, -3.2, 10]], 2.4, { smooth: 5 }],
      ],
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

      // --- shrines ---
      // Two of them: one early, and one on the shelf below the ruin so the walk
      // back to the boss is a walk and not a pilgrimage.
      { kind: 'emberwake', at: [[-26, 6, 0.4]], id: 'shrine:ashfen:wayside', name: 'Wayside Ember' },
      { kind: 'emberwake', at: [[13, -32, -2.4]], id: 'shrine:ashfen:gate', name: 'Ember Below the Gate' },

      // --- scatter ---
      { kind: 'boulder', count: 34, opts: { radius: 1.5 }, minGap: 6,
        area: { x: 0, z: 10, radius: 100 }, maxSlope: 0.85,
        avoid: [[-26, 6, 9], [13, -32, 9], [6, -48, 26]] },
      { kind: 'deadTree', count: 26, opts: { height: 8 }, minGap: 9,
        area: { x: 0, z: 20, radius: 96 }, maxSlope: 0.42,
        avoid: [[-26, 6, 11], [13, -32, 11], [6, -48, 28], [-14, 26, 20]] },
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
      { kind: 'fenWisp', at: [-14, 24], count: 3, tier: 2, elite: true },
    ],

    boss: {
      kind: 'gatewarden',
      at: [6, -52],
      arena: { at: [6, -48], radius: 17 },
    },
  },
};

export const DEFAULT_ZONE = 'ashfen';
