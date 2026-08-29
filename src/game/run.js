// Run state: the clock, gate scoring and the finish condition.

import { COURSE_LENGTH, GATE_RADIUS } from '../world/course.js';

export const MISS_PENALTY = 2.0; // seconds added per gate flown around

export const State = { READY: 'ready', FLYING: 'flying', FINISHED: 'finished' };

export class Run {
  constructor(course, ship) {
    this.course = course;
    this.ship = ship;
    this.reset();
  }

  reset() {
    this.state = State.READY;
    this.time = 0;
    this.penalty = 0;
    this.passed = 0;
    this.missed = 0;
    this.nextGate = 0;
    this.prevZ = this.ship.z;
    this.events = [];       // drained each frame by the renderer/audio
    this.finalTime = 0;
  }

  start() {
    if (this.state !== State.READY) return;
    this.state = State.FLYING;
    this.prevZ = this.ship.z;
  }

  get total() { return this.time + this.penalty; }

  get progress() {
    return Math.max(0, Math.min(1, this.ship.z / COURSE_LENGTH));
  }

  // Called once per fixed physics step, after the ship has moved.
  update(dt) {
    if (this.state !== State.FLYING) return;
    this.time += dt;

    const z = this.ship.z;
    // Resolve every gate plane crossed this step (at 100+ m/s a single step
    // never spans two gates, but the loop keeps that assumption from mattering).
    while (this.nextGate < this.course.gates.length) {
      const g = this.course.gates[this.nextGate];
      if (z < g.z) break;
      const span = z - this.prevZ;
      // Position at the instant the ship crossed the gate's plane.
      const u = span > 1e-6 ? (g.z - this.prevZ) / span : 0;
      const px = this.prevX === undefined ? this.ship.x : lerp(this.prevX, this.ship.x, u);
      const py = this.prevY === undefined ? this.ship.y : lerp(this.prevY, this.ship.y, u);
      const d = Math.hypot(px - g.x, py - g.y);
      if (d <= GATE_RADIUS) {
        this.passed++;
        g.hitAt = this.time;
        this.events.push({ type: 'gate', gate: g, dist: d });
      } else {
        this.missed++;
        this.penalty += MISS_PENALTY;
        g.missAt = this.time;
        this.events.push({ type: 'miss', gate: g, dist: d });
      }
      this.nextGate++;
    }

    this.prevZ = z;
    this.prevX = this.ship.x;
    this.prevY = this.ship.y;

    if (z >= COURSE_LENGTH) {
      this.state = State.FINISHED;
      this.finalTime = this.total;
      this.events.push({ type: 'finish', time: this.finalTime });
    }
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

export function formatTime(sec) {
  if (!isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
