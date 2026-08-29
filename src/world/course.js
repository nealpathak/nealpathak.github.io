// The course: a curving canyon defined analytically so the exact same function
// produces the render mesh and answers collision queries. Nothing is baked, so
// a whole day's track costs one seed.

import { fbm, ridged } from './noise.js';
import { makeRng, hash2 } from '../core/rng.js';
import { clamp, smoothstep } from '../core/math.js';

export const COURSE_LENGTH = 4400;   // metres from start line to finish
const GATE_SPACING = 230;
const FIRST_GATE = 260;
const PILLAR_SPACING = 52;
const PILLAR_CLEAR_OF_GATE = 50;     // keep gate approaches unobstructed
export const GATE_RADIUS = 11.5;

export class Course {
  constructor(seed, key = '') {
    this.seed = seed >>> 0;
    this.key = key;
    const rng = makeRng(this.seed);

    // Three octaves of lateral meander: a long sweep, medium bends, and a
    // short wiggle. Amplitudes are bounded so the path can never fold back.
    this.px = [
      { a: 42 + rng() * 26, f: 0.0026 + rng() * 0.0010, p: rng() * 6.283 },
      { a: 18 + rng() * 14, f: 0.0062 + rng() * 0.0026, p: rng() * 6.283 },
      { a: 6 + rng() * 7, f: 0.0141 + rng() * 0.0050, p: rng() * 6.283 },
    ];
    // Floor elevation drifts gently: enough to force pitch input, never enough
    // to hide the next gate.
    this.py = [
      { a: 7 + rng() * 6, f: 0.0036 + rng() * 0.0014, p: rng() * 6.283 },
      { a: 3 + rng() * 3, f: 0.0089 + rng() * 0.0030, p: rng() * 6.283 },
    ];
    // Corridor width breathes between tight squeezes and open halls.
    this.pw = { base: 27 + rng() * 5, a: 9 + rng() * 4, f: 0.0031 + rng() * 0.0015, p: rng() * 6.283 };

    this.wallHeight = 66 + rng() * 22;
    this.noiseSeed = (this.seed ^ 0x5bf03635) >>> 0;
    // Sun azimuth/elevation and palette shift give each day its own look.
    this.sunAngle = rng() * 6.283;
    this.sunHeight = 0.24 + rng() * 0.42;
    this.palette = rng();

    this.gates = this._buildGates();
    this.length = COURSE_LENGTH;
  }

  // Canyon centreline X at distance z.
  pathX(z) {
    const s = this.px;
    return s[0].a * Math.sin(z * s[0].f + s[0].p)
      + s[1].a * Math.sin(z * s[1].f + s[1].p)
      + s[2].a * Math.sin(z * s[2].f + s[2].p);
  }

  // Analytic derivative -- used for gate orientation and the start heading.
  pathDX(z) {
    const s = this.px;
    return s[0].a * s[0].f * Math.cos(z * s[0].f + s[0].p)
      + s[1].a * s[1].f * Math.cos(z * s[1].f + s[1].p)
      + s[2].a * s[2].f * Math.cos(z * s[2].f + s[2].p);
  }

  // Canyon floor elevation at distance z.
  floorY(z) {
    const s = this.py;
    return s[0].a * Math.sin(z * s[0].f + s[0].p)
      + s[1].a * Math.sin(z * s[1].f + s[1].p);
  }

  halfWidth(z) {
    const w = this.pw;
    return w.base + w.a * Math.sin(z * w.f + w.p);
  }

  // Terrain height at an arbitrary world point. This is the single source of
  // truth for both geometry and collision.
  height(x, z) {
    const cx = this.pathX(z);
    const fy = this.floorY(z);
    const hw = this.halfWidth(z);
    const d = Math.abs(x - cx);
    const outside = Math.max(0, d - hw);

    // Cliffs ramp up over ~18m and then saturate, so the corridor has a clean
    // lip rather than a gradual bowl.
    const climb = 1 - Math.exp(-outside / 17);
    let h = fy + this.wallHeight * climb;

    // Rock detail scales with wall height: the floor stays smooth and flyable.
    const rock = ridged(x * 0.0135, z * 0.0135, this.noiseSeed, 4);
    h += (rock - 0.4) * (2.0 + this.wallHeight * climb * 0.42);

    // Gentle floor undulation, faded out as the walls take over.
    const floorFade = 1 - smoothstep(0, 10, outside);
    h += (fbm(x * 0.043, z * 0.043, this.noiseSeed + 91, 3) - 0.5) * 3.4 * floorFade;

    h += this._pillars(x, z);
    return h;
  }

  // Sparse cones rising from the canyon floor. Deterministic per 52m segment,
  // so a query only inspects the two segments that can reach the point.
  _pillars(x, z) {
    let add = 0;
    const s0 = Math.floor((z - 16) / PILLAR_SPACING);
    const s1 = Math.floor((z + 16) / PILLAR_SPACING);
    for (let s = s0; s <= s1; s++) {
      const p = this.pillarAt(s);
      if (!p) continue;
      const dx = x - p.x, dz = z - p.z;
      const r2 = (dx * dx + dz * dz) / (p.r * p.r);
      if (r2 >= 1) continue;
      const f = 1 - r2;
      add += p.h * f * f; // C1-continuous falloff keeps collision smooth
    }
    return add;
  }

  // Returns the pillar for a segment index, or null if that segment is empty.
  pillarAt(s) {
    if (hash2(s, 7) > 0.42) return null;          // most segments stay clear
    const z = s * PILLAR_SPACING + hash2(s, 11) * PILLAR_SPACING;
    if (z < 190 || z > COURSE_LENGTH - 90) return null; // clean start and finish
    // Never block a gate approach.
    const nearestGate = Math.round((z - FIRST_GATE) / GATE_SPACING) * GATE_SPACING + FIRST_GATE;
    if (Math.abs(z - nearestGate) < PILLAR_CLEAR_OF_GATE) return null;
    const hw = this.halfWidth(z);
    const off = (hash2(s, 13) * 2 - 1) * hw * 0.66;
    return {
      z,
      x: this.pathX(z) + off,
      r: 6.5 + hash2(s, 17) * 6.5,
      h: 22 + hash2(s, 19) * 38,
    };
  }

  _buildGates() {
    const gates = [];
    const rng = makeRng(this.seed ^ 0x1f83d9ab);
    for (let z = FIRST_GATE, i = 0; z < COURSE_LENGTH - 120; z += GATE_SPACING, i++) {
      const hw = this.halfWidth(z);
      // Alternate the lateral bias so the line through the course snakes.
      const bias = (rng() * 2 - 1) * 0.55;
      const x = this.pathX(z) + bias * hw;
      let y = this.floorY(z) + 11 + rng() * 15;
      // Guarantee clearance: a gate embedded in rock would be unpassable.
      const ground = this.height(x, z);
      if (y < ground + GATE_RADIUS + 3) y = ground + GATE_RADIUS + 3;
      gates.push({ i, x, y, z, tilt: this.pathDX(z) });
    }
    return gates;
  }

  // Where the ship starts: centred, above the floor, aimed down-canyon.
  startState() {
    const z = 0;
    const x = this.pathX(z);
    const y = Math.max(this.floorY(z) + 16, this.height(x, z) + 14);
    return { x, y, z, yaw: Math.atan2(this.pathDX(z), 1) };
  }

  // Signed clearance from a point to the terrain directly below it.
  clearanceAt(x, y, z) { return y - this.height(x, z); }
}

export function courseFor(seed, key) { return new Course(seed, key); }
export { GATE_SPACING, FIRST_GATE };
