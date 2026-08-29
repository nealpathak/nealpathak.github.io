// Small procedural meshes. Everything is generated at load; there are no
// asset files to fetch, which keeps the whole game a handful of text files.

import { GATE_RADIUS } from '../world/course.js';

// Torus lying in the local XY plane, so it faces down-course (+Z).
export function gateRing(segsMajor = 36, segsMinor = 6, minor = 0.62) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < segsMajor; i++) {
    const a = (i / segsMajor) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j < segsMinor; j++) {
      const b = (j / segsMinor) * Math.PI * 2;
      const cb = Math.cos(b), sb = Math.sin(b);
      pos.push(
        ca * (GATE_RADIUS + cb * minor),
        sa * (GATE_RADIUS + cb * minor),
        sb * minor,
      );
    }
  }
  for (let i = 0; i < segsMajor; i++) {
    const ni = (i + 1) % segsMajor;
    for (let j = 0; j < segsMinor; j++) {
      const nj = (j + 1) % segsMinor;
      const a = i * segsMinor + j;
      const b = ni * segsMinor + j;
      const c = i * segsMinor + nj;
      const d = ni * segsMinor + nj;
      idx.push(a, b, c, c, b, d);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint16Array(idx) };
}

// The skimmer: an open delta shell, nose at +Z to match the heading convention.
export function shipHull() {
  const nose = [0, 0, 3.4];
  const tipL = [-2.7, -0.10, -1.4];
  const tipR = [2.7, -0.10, -1.4];
  const top = [0, 0.85, -0.5];
  const bot = [0, -0.55, -0.3];
  const tailL = [-0.78, 0.10, -2.1];
  const tailR = [0.78, 0.10, -2.1];
  // Engine mouth, flagged so the shader can make it emissive.
  const eLB = [-0.72, -0.20, -2.15];
  const eRB = [0.72, -0.20, -2.15];
  const eLT = [-0.62, 0.52, -2.15];
  const eRT = [0.62, 0.52, -2.15];

  const tris = [
    [nose, tipL, top, 0], [nose, top, tipR, 0],
    [nose, bot, tipL, 0], [nose, tipR, bot, 0],
    [top, tipL, tailL, 0], [top, tailL, tailR, 0], [top, tailR, tipR, 0],
    [bot, tailL, tipL, 0], [bot, tailR, tailL, 0], [bot, tipR, tailR, 0],
    [eLB, eRB, eRT, 1], [eLB, eRT, eLT, 1],
  ];

  const pos = [];
  const glow = [];
  for (const [a, b, c, g] of tris) {
    pos.push(...a, ...b, ...c);
    glow.push(g, g, g);
  }
  return { positions: new Float32Array(pos), glow: new Float32Array(glow), count: tris.length * 3 };
}

// Two vertices per streak: a head anchored in world space and a tail that the
// vertex shader drags backwards along the velocity vector.
export function streakField(n, rng) {
  const seed = new Float32Array(n * 2 * 3);
  const end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = rng(), y = rng(), z = rng();
    seed[i * 6 + 0] = x; seed[i * 6 + 1] = y; seed[i * 6 + 2] = z;
    seed[i * 6 + 3] = x; seed[i * 6 + 4] = y; seed[i * 6 + 5] = z;
    end[i * 2] = 0;
    end[i * 2 + 1] = 1;
  }
  return { seed, end, count: n * 2 };
}
