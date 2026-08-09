// Round pacing.
//
// A round is a budget of zombies that trickle in from the fence line. It ends
// when the budget is spent and the yard is empty; then you get a breather.
// Every curve is here so the difficulty is tunable in one place.

import { MAX_ALIVE } from './zombies.js';

const BREATHER = 7;           // seconds between rounds
const FIRST_BREATHER = 3;     // shorter wait before round 1

export const curve = {
  count:    (n) => Math.min(6 + (n - 1) * 3, 40),
  health:   (n) => (n <= 10 ? 40 + (n - 1) * 18 : (40 + 9 * 18) * 1.1 ** (n - 10)),
  speed:    (n) => Math.min(1.15 + (n - 1) * 0.16, 4.4),
  maxAlive: (n) => Math.min(6 + n * 2, MAX_ALIVE),
  interval: (n) => Math.max(0.35, 2.2 - n * 0.12),
};

export class Rounds {
  /** @param {{onRoundStart:(n:number)=>void, onRoundEnd:(n:number)=>void}} hooks */
  constructor(horde, world, hooks) {
    this.horde = horde;
    this.world = world;
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.number = 0;
    this.state = 'breather';
    this.timer = FIRST_BREATHER;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.kills = 0;
  }

  step(dt, playerPos, colliders) {
    if (this.state === 'breather') {
      this.timer -= dt;
      if (this.timer <= 0) this._begin();
      return;
    }

    // --- spawning ---------------------------------------------------------
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      const room = curve.maxAlive(this.number) - this.horde.aliveCount;
      if (this.spawnTimer <= 0 && room > 0) {
        const points = this.world.spawnPoints;
        // Prefer gates behind the player so they arrive from the dark, not
        // straight down the barrel.
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < 6; i++) {
          const p = points[(Math.random() * points.length) | 0];
          const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
          const score = d + Math.random() * 6;
          if (score > bestScore) { bestScore = score; best = p; }
        }
        if (this.horde.spawnAt(best, curve.health(this.number), curve.speed(this.number), colliders, playerPos)) {
          this.toSpawn--;
        }
        this.spawnTimer = curve.interval(this.number);
      }
    }

    // --- end of round ------------------------------------------------------
    if (this.toSpawn === 0 && this.horde.aliveCount === 0) {
      this.hooks.onRoundEnd(this.number);
      this.state = 'breather';
      this.timer = BREATHER;
    }
  }

  _begin() {
    this.number++;
    this.state = 'active';
    this.toSpawn = curve.count(this.number);
    this.spawnTimer = 0;
    this.hooks.onRoundStart(this.number);
  }

  /** Seconds left in the breather, or 0 while a round is running. */
  get breatherLeft() { return this.state === 'breather' ? Math.max(0, this.timer) : 0; }
}
