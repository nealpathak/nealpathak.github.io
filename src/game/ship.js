// Flight model. Arcade, not simulation: the ship always flies along its own
// heading, and the only real resource is speed. Speed is bought by flying
// close to rock -- that trade is the whole game.

import { clamp, smoothstep, damp } from '../core/math.js';

export const SHIP_RADIUS = 2.3;
const SLIP_RANGE = 18;        // proximity band that feeds the boost
const PROBE_STEP = 2.0;
const PROBE_MAX = 21;         // must exceed SLIP_RANGE or charge can never start

const BASE_SPEED = 62;        // m/s cruise
const BRAKE_SPEED = 36;
const BOOST_MULT = 1.8;       // top speed at full slipstream
const ACCEL = 26;
const YAW_RATE = 1.55;        // rad/s at full deflection
const PITCH_RATE = 1.15;
const MAX_PITCH = 0.58;       // ~33 deg; prevents loops and nose-in dives
const MAX_BANK = 1.05;
const CHARGE_GAIN = 1.6;      // per second at point-blank range
const CHARGE_DECAY = 0.5;     // net gain begins around 12m from rock
const CEILING = 58;           // metres above the canyon floor
const MAX_YAW_OFF = 1.4;      // ~80 deg off the canyon axis

// Wraps an angle into [-pi, pi].
function wrapPi(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

// Horizontal probe directions relative to the heading, in radians.
const PROBE_DIRS = [0, 0.7854, -0.7854, 1.5708, -1.5708, 2.3562, -2.3562, 3.1416];

export class Ship {
  constructor(course) {
    this.course = course;
    this.reset();
  }

  reset() {
    const s = this.course.startState();
    this.x = s.x; this.y = s.y; this.z = s.z;
    this.yaw = s.yaw; this.pitch = 0; this.roll = 0;
    this.speed = BASE_SPEED * 0.55;
    this.charge = 0;
    this.clearance = SLIP_RANGE;
    this.crashed = false;
    this.crashCooldown = 0;
    this.crashCount = 0;
    this.shake = 0;
    this.ceilingWarn = 0;
    this.distanceFlown = 0;
  }

  get heading() {
    const cp = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp];
  }

  get boostFactor() { return this.charge; }
  get speedKph() { return this.speed * 3.6; }

  // dt is a fixed physics step, so behaviour is identical at any frame rate.
  update(dt, input) {
    const c = this.course;
    const braking = input.brake;

    // --- attitude -------------------------------------------------------
    // Braking tightens the turn: the skill move is to brake into a bend and
    // ride the inside wall for charge.
    const agility = 1 + braking * 0.55;
    this.yaw += input.steer * YAW_RATE * agility * dt;
    // Clamp the heading to a cone around the canyon direction. Without this a
    // player can spin 180 and fly the course backwards, which makes gates and
    // timing meaningless; at 80 degrees you are already scraping a wall.
    const pathYaw = Math.atan2(c.pathDX(this.z), 1);
    const off = wrapPi(this.yaw - pathYaw);
    if (Math.abs(off) > MAX_YAW_OFF) {
      this.yaw = pathYaw + Math.sign(off) * MAX_YAW_OFF;
    }
    this.pitch = clamp(this.pitch + input.pitch * PITCH_RATE * dt, -MAX_PITCH, MAX_PITCH);
    // Pitch self-centres so the ship tends back toward level flight.
    this.pitch = damp(this.pitch, this.pitch * 0.82, 1.6, dt);
    // Roll is cosmetic banking driven by turn input.
    this.roll = damp(this.roll, -input.steer * MAX_BANK, 6, dt);

    // --- speed ----------------------------------------------------------
    const target = braking
      ? BRAKE_SPEED
      : BASE_SPEED * (1 + (BOOST_MULT - 1) * this.charge);
    // Shedding speed is quicker than gaining it, so braking feels responsive
    // while a boost still has to be earned and held.
    this.speed = damp(this.speed, target, target < this.speed ? 2.6 : 1.2, dt);

    // --- integrate ------------------------------------------------------
    const h = this.heading;
    const step = this.speed * dt;
    this.x += h[0] * step;
    this.y += h[1] * step;
    this.z += h[2] * step;
    this.distanceFlown += step;

    // --- soft ceiling ---------------------------------------------------
    // Flying over the canyon would trivialise the course, so altitude above
    // the rim bleeds speed and pushes the nose down.
    const rim = c.floorY(this.z) + CEILING;
    if (this.y > rim) {
      const over = this.y - rim;
      this.ceilingWarn = clamp(over / 12, 0, 1);
      this.y -= Math.min(over, over * 3.2 * dt + 0.02);
      this.pitch = damp(this.pitch, -0.25, 2.4, dt);
      this.charge = damp(this.charge, 0, 3, dt);
      this.speed = damp(this.speed, BASE_SPEED * 0.8, 1.4, dt);
    } else {
      this.ceilingWarn = damp(this.ceilingWarn, 0, 4, dt);
    }

    // --- proximity, charge, collision -----------------------------------
    this.clearance = this._probe();
    const near = 1 - smoothstep(SHIP_RADIUS + 0.5, SLIP_RANGE, this.clearance);
    if (this.ceilingWarn < 0.5) {
      this.charge = clamp(this.charge + (near * CHARGE_GAIN - CHARGE_DECAY) * dt, 0, 1);
    }

    if (this.crashCooldown > 0) this.crashCooldown -= dt;
    this.crashed = false;
    if (this._contact()) this._resolveCrash();

    this.shake = damp(this.shake, 0, 5, dt);
    return this.crashed;
  }

  // True distance-ish to the nearest rock: the vertical gap to the floor, and
  // the marched distance to any wall around the ship.
  _probe() {
    const c = this.course;
    let best = Math.min(this.y - c.height(this.x, this.z), PROBE_MAX);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    for (const a of PROBE_DIRS) {
      // Rotate the probe direction into world space around the heading.
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = sy * ca + cy * sa;
      const dz = cy * ca - sy * sa;
      for (let t = PROBE_STEP; t <= PROBE_MAX; t += PROBE_STEP) {
        if (t >= best) break; // cannot improve on the current minimum
        if (c.height(this.x + dx * t, this.z + dz * t) > this.y) { best = t; break; }
      }
    }
    return Math.max(0, best);
  }

  // Sphere-vs-heightfield contact: the centre plus a ring at the hull radius.
  _contact() {
    const c = this.course;
    if (c.height(this.x, this.z) > this.y - SHIP_RADIUS) return true;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = this.x + Math.cos(a) * SHIP_RADIUS;
      const pz = this.z + Math.sin(a) * SHIP_RADIUS;
      if (c.height(px, pz) > this.y) return true;
    }
    return false;
  }

  _resolveCrash() {
    const c = this.course;
    // Surface normal from the height-field gradient, by central difference.
    const e = 1.2;
    const nx = c.height(this.x - e, this.z) - c.height(this.x + e, this.z);
    const nz = c.height(this.x, this.z - e) - c.height(this.x, this.z + e);
    let n = [nx, 2 * e, nz];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];

    // Lift clear of the surface so the next step starts outside the rock.
    const pen = c.height(this.x, this.z) + SHIP_RADIUS - this.y;
    const push = Math.max(pen, 0) + 0.7;
    this.x += n[0] * push;
    this.y += n[1] * push;
    this.z += n[2] * push;

    if (this.crashCooldown > 0) return; // still recovering: no double penalty

    // Deflect the heading away from the wall rather than stopping dead.
    const h = this.heading;
    const d = h[0] * n[0] + h[1] * n[1] + h[2] * n[2];
    const bx = h[0] - 1.7 * d * n[0];
    const by = h[1] - 1.7 * d * n[1];
    const bz = h[2] - 1.7 * d * n[2];
    const bl = Math.hypot(bx, by, bz) || 1;
    this.yaw = Math.atan2(bx / bl, bz / bl);
    this.pitch = clamp(Math.asin(clamp(by / bl, -1, 1)), -MAX_PITCH, MAX_PITCH);

    this.speed *= 0.42;
    this.charge = 0;
    this.crashed = true;
    this.crashCount++;
    this.crashCooldown = 0.55;
    this.shake = 1;
  }
}
