// Hand-picked moods rather than random hues: a seeded roll through these keeps
// every daily course looking deliberate.

const P = (name, skyTop, skyHorizon, skyGround, sun, rockLo, rockHi, floorCol, fog) =>
  ({ name, skyTop, skyHorizon, skyGround, sun, rockLo, rockHi, floorCol, fog });

export const PALETTES = [
  P('Ember Dawn',
    [0.16, 0.20, 0.42], [0.96, 0.52, 0.34], [0.20, 0.13, 0.18],
    [1.00, 0.72, 0.44], [0.32, 0.17, 0.16], [0.70, 0.39, 0.27], [0.52, 0.38, 0.28], 0.0026),
  P('High Noon',
    [0.20, 0.42, 0.78], [0.58, 0.73, 0.90], [0.20, 0.20, 0.24],
    [1.00, 0.94, 0.82], [0.30, 0.20, 0.17], [0.70, 0.52, 0.37], [0.56, 0.46, 0.33], 0.0022),
  P('Rust Dusk',
    [0.13, 0.10, 0.26], [0.86, 0.35, 0.26], [0.12, 0.08, 0.12],
    [1.00, 0.58, 0.32], [0.26, 0.13, 0.15], [0.60, 0.28, 0.24], [0.42, 0.26, 0.24], 0.0027),
  P('Cold Front',
    [0.30, 0.38, 0.50], [0.62, 0.68, 0.74], [0.16, 0.18, 0.22],
    [0.86, 0.90, 1.00], [0.24, 0.26, 0.30], [0.52, 0.56, 0.60], [0.40, 0.44, 0.48], 0.0032),
  P('Verdigris',
    [0.07, 0.23, 0.28], [0.40, 0.66, 0.56], [0.06, 0.13, 0.13],
    [0.80, 0.94, 0.78], [0.13, 0.21, 0.18], [0.33, 0.49, 0.36], [0.26, 0.38, 0.28], 0.0025),
  P('Violet Hour',
    [0.14, 0.09, 0.30], [0.62, 0.34, 0.72], [0.09, 0.06, 0.16],
    [0.94, 0.72, 1.00], [0.22, 0.16, 0.32], [0.50, 0.36, 0.64], [0.38, 0.30, 0.50], 0.0029),
];

export function paletteFor(t) {
  return PALETTES[Math.min(PALETTES.length - 1, Math.floor(t * PALETTES.length))];
}
