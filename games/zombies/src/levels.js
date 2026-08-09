// The campaign: six hand-authored levels, each with its own arena, palette and
// wave script. Nothing here is procedural — a closed game wants a shape you can
// learn and beat, not a curve that runs forever.
//
// Every level's `build` gets a solid() that both draws the box and registers
// its collider, so geometry and collision can never drift apart.

/**
 * Wave ramp. Sizes climb linearly; crowding and spawn cadence tighten across
 * the level so the last wave feels different from the first even at the same
 * count.
 */
const ramp = ({ count, first, step, alive, gap, mix }) =>
  Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 1 : i / (count - 1);
    return {
      n: first + step * i,
      alive: Math.round(alive[0] + (alive[1] - alive[0]) * t),
      gap: +(gap[0] + (gap[1] - gap[0]) * t).toFixed(2),
      mix: typeof mix === 'function' ? mix(t) : mix,
    };
  });

export const LEVELS = [
  // ---------------------------------------------------------------- 1 ------
  {
    id: 'dock',
    spawn: [0, 14],
    name: 'Loading Dock',
    blurb: 'The lights held here. They will not hold everywhere.',
    half: 20,
    fog: 0x0a0c10, fogDensity: 0.026,
    sky: [0x0c1018, 0x1b232f],
    lampColor: 0xffb457,
    lamps: [[-12, 4.4, -12], [12, 4.4, 12], [-12, 4.4, 12], [12, 4.4, -12, true]],
    enemy: { hp: 45, speed: 1.25 },
    build(s, m) {
      s(-11, -8, 6.1, 2.5, 2.6, m.container);
      s(12, -6, 2.5, 6.1, 2.6, m.container);
      s(-7, 11, 6.1, 2.5, 2.6, m.container);
      s(13, 12, 6.1, 2.5, 2.6, m.container);
      s(0, 0, 3.0, 3.0, 3.2, m.steel);
      s(-16, 16, 2.2, 2.2, 2.4, m.crate);
      s(16, -16, 2.2, 2.2, 2.4, m.crate);
      s(-3, -14, 1.6, 1.6, 1.8, m.crate);
      s(6, 8, 1.6, 1.6, 1.8, m.crate);
      for (const x of [-14, 14]) for (const z of [-14, 14]) s(x, z, 0.7, 0.7, 5, m.steel);
    },
    waves: ramp({
      count: 6, first: 10, step: 4, alive: [8, 18], gap: [2.0, 1.2],
      mix: (t) => (t < 0.3 ? { shambler: 1 }
        : t < 0.8 ? { shambler: 5, runner: 1 }
        : { shambler: 4, runner: 2, brute: 1 }),
    }),
  },

  // ---------------------------------------------------------------- 2 ------
  {
    id: 'yard',
    spawn: [0, 16],
    name: 'The Yard',
    blurb: 'Half the floods are out. Learn the dark patches.',
    half: 22,
    fog: 0x090a0e, fogDensity: 0.034,
    sky: [0x090c12, 0x161d27],
    lampColor: 0xffa63f,
    lamps: [[-14, 4.6, 0, true], [14, 4.6, -10], [0, 4.6, 15]],
    enemy: { hp: 68, speed: 1.4 },
    build(s, m) {
      // A long spine wall you can fight either side of, with two gaps.
      s(-4, -3, 1.0, 14, 3.4, m.wall);
      s(9, 4, 1.0, 12, 3.4, m.wall);
      s(-13, -13, 5.5, 2.4, 2.6, m.container);
      s(-13, -9, 5.5, 2.4, 2.6, m.container, 2.6);   // stacked
      s(15, 14, 2.4, 5.5, 2.6, m.container);
      s(4, -16, 6.0, 2.4, 2.6, m.container);
      s(-17, 8, 2.0, 2.0, 2.2, m.crate);
      s(-14, 8, 2.0, 2.0, 2.2, m.crate);
      s(17, -3, 2.0, 2.0, 2.2, m.crate);
      s(0, 10, 2.6, 2.6, 3.0, m.steel);
      for (const x of [-18, 18]) for (const z of [-18, 18]) s(x, z, 0.7, 0.7, 5, m.steel);
    },
    waves: ramp({
      count: 6, first: 16, step: 4, alive: [12, 20], gap: [1.7, 1.05],
      mix: (t) => (t < 0.5 ? { shambler: 4, runner: 1 } : { shambler: 3, runner: 2, brute: 1 }),
    }),
  },

  // ---------------------------------------------------------------- 3 ------
  {
    id: 'cold',
    spawn: [0, 10],
    name: 'Cold Store',
    blurb: 'Aisles. No room to back up, and something is always behind you.',
    half: 14,
    fog: 0x0b1014, fogDensity: 0.075,
    sky: [0x080d11, 0x121b21],
    lampColor: 0x9fd8ff,
    lamps: [[0, 4.2, -9, true], [0, 4.2, 9], [-9, 4.2, 0], [9, 4.2, 0]],
    enemy: { hp: 92, speed: 1.45 },
    build(s, m) {
      // Four shelving runs make three aisles. Deliberately claustrophobic.
      for (const x of [-8, -3, 3, 8]) {
        s(x, -5, 1.6, 12, 3.6, m.steel);
        s(x, 6, 1.6, 8, 3.6, m.steel);
      }
      s(0, -12, 6, 1.4, 2.4, m.crate);
      s(0, 12, 6, 1.4, 2.4, m.crate);
      s(-12, 0, 1.4, 5, 2.4, m.crate);
      s(12, 0, 1.4, 5, 2.4, m.crate);
    },
    waves: ramp({
      count: 7, first: 18, step: 4, alive: [10, 16], gap: [1.5, 0.95],
      mix: (t) => (t < 0.4 ? { shambler: 3, runner: 2 }
        : t < 0.85 ? { shambler: 3, runner: 3, brute: 1 }
        : { shambler: 2, runner: 3, brute: 2 }),
    }),
  },

  // ---------------------------------------------------------------- 4 ------
  {
    id: 'motor',
    spawn: [0, 21],
    name: 'Motor Pool',
    blurb: 'Open ground. The fast ones like open ground.',
    half: 24,
    fog: 0x0a0b0f, fogDensity: 0.022,
    sky: [0x0a0e15, 0x1a2330],
    lampColor: 0xffc266,
    lamps: [[-16, 5.0, -16], [16, 5.0, 16], [0, 5.4, 0]],
    enemy: { hp: 120, speed: 1.6 },
    build(s, m) {
      // Parked vehicles: low cab, long body. Sparse, so sightlines stay long.
      const truck = (x, z, rot) => {
        if (rot) { s(x, z, 2.4, 7.0, 2.0, m.steel); s(x, z - 2.6, 2.4, 2.0, 2.9, m.steel); }
        else { s(x, z, 7.0, 2.4, 2.0, m.steel); s(x - 2.6, z, 2.0, 2.4, 2.9, m.steel); }
      };
      truck(-14, -6, false);
      truck(-14, 6, false);
      truck(13, -10, true);
      truck(13, 8, true);
      truck(-2, 17, false);
      s(4, -16, 3.0, 3.0, 3.4, m.container);
      s(-20, 18, 2.2, 2.2, 2.4, m.crate);
      s(20, -18, 2.2, 2.2, 2.4, m.crate);
      for (const x of [-20, 20]) for (const z of [-20, 20]) s(x, z, 0.7, 0.7, 5, m.steel);
    },
    waves: ramp({
      count: 7, first: 20, step: 4, alive: [16, 24], gap: [1.4, 0.9],
      mix: (t) => (t < 0.5 ? { shambler: 3, runner: 3, brute: 1 } : { shambler: 2, runner: 4, brute: 1 }),
    }),
  },

  // ---------------------------------------------------------------- 5 ------
  {
    id: 'transformer',
    spawn: [0, 13],
    name: 'Transformer Yard',
    blurb: 'Everything here is still live. So is everything coming for you.',
    half: 20,
    fog: 0x0d0a0c, fogDensity: 0.038,
    sky: [0x0d0a10, 0x241a22],
    lampColor: 0xff8f5a,
    lamps: [[-10, 4.8, -10, true], [10, 4.8, 10, true], [-10, 4.8, 10], [10, 4.8, -10]],
    enemy: { hp: 165, speed: 1.75 },
    build(s, m) {
      // Transformer blocks in a grid form lanes; fences pinch the diagonals.
      for (const x of [-9, 0, 9]) {
        for (const z of [-9, 0, 9]) {
          if (x === 0 && z === 0) continue;
          s(x, z, 3.4, 3.4, 3.0, m.steel);
        }
      }
      s(0, 0, 2.2, 2.2, 4.2, m.container);
      s(-16, 0, 1.0, 10, 3.2, m.wall);
      s(16, 0, 1.0, 10, 3.2, m.wall);
      s(0, -16, 10, 1.0, 3.2, m.wall);
      s(0, 16, 10, 1.0, 3.2, m.wall);
    },
    waves: ramp({
      count: 7, first: 24, step: 4, alive: [18, 26], gap: [1.3, 0.85],
      mix: (t) => (t < 0.4 ? { shambler: 3, runner: 3, brute: 1 }
        : t < 0.8 ? { shambler: 2, runner: 3, brute: 2 }
        : { shambler: 2, runner: 3, brute: 3 }),
    }),
  },

  // ---------------------------------------------------------------- 6 ------
  {
    id: 'gate',
    spawn: [0, 15],
    name: 'The Gate',
    blurb: 'Hold until it opens. There is nothing after this.',
    half: 18,
    fog: 0x100a09, fogDensity: 0.042,
    sky: [0x110b0a, 0x2b1a14],
    lampColor: 0xff7a4a,
    lamps: [[0, 5.2, -14], [-11, 4.6, 6, true], [11, 4.6, 6, true]],
    enemy: { hp: 215, speed: 1.9 },
    build(s, m) {
      // The gate itself, north wall. Two towers and a funnel into the middle.
      s(-5, -15, 3.0, 3.0, 5.0, m.steel);
      s(5, -15, 3.0, 3.0, 5.0, m.steel);
      s(-9, -6, 1.0, 11, 3.6, m.wall);
      s(9, -6, 1.0, 11, 3.6, m.wall);
      s(-13, 8, 5.0, 2.4, 2.6, m.container);
      s(13, 8, 5.0, 2.4, 2.6, m.container);
      s(0, 4, 3.4, 3.4, 3.4, m.container);
      s(-4, 13, 2.0, 2.0, 2.2, m.crate);
      s(4, 13, 2.0, 2.0, 2.2, m.crate);
      for (const x of [-15, 15]) for (const z of [-15, 15]) s(x, z, 0.7, 0.7, 5, m.steel);
    },
    waves: ramp({
      count: 8, first: 26, step: 4, alive: [20, 28], gap: [1.2, 0.75],
      mix: (t) => (t < 0.35 ? { shambler: 3, runner: 3, brute: 1 }
        : t < 0.75 ? { shambler: 2, runner: 3, brute: 2 }
        : { shambler: 1, runner: 3, brute: 3 }),
    }),
  },
];

/** Total zombies in the campaign, used for the length estimate and the tests. */
export function campaignSize() {
  return LEVELS.reduce((sum, l) => sum + l.waves.reduce((s, w) => s + w.n, 0), 0);
}
