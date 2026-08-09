// Campaign state: which level, which wave, and what happens when one ends.
//
// The old endless Rounds object grew its difficulty from a formula. This one
// reads a script. That is the whole point of a closed game — the sixth level is
// the sixth level every time, so you can learn it, and losing to it is
// information rather than noise.

import { LEVELS } from './levels.js';
import { difficultyById, statsFrom } from './upgrades.js';
import { TYPES } from './zombies.js';

const WAVE_BREATHER = 6.5;
const FIRST_WAVE_DELAY = 3.5;

export class Campaign {
  /**
   * @param {{onWaveStart, onWaveCleared, onLevelCleared, onCampaignWon}} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.difficulty = difficultyById('standard');
    this.taken = [];
    this.stats = statsFrom([]);
    this.levelIndex = 0;
    this.reset();
  }

  reset() {
    this.waveIndex = -1;
    this.state = 'idle';       // idle | breather | wave | cleared | won
    this.timer = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.kills = 0;
    this.levelKills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.elapsed = 0;
  }

  /** Start a run. Wipes upgrades and stats. */
  begin(difficultyId, levelIndex = 0, takenIds = []) {
    this.difficulty = difficultyById(difficultyId);
    this.taken = [...takenIds];
    this.stats = statsFrom(this.taken);
    this.levelIndex = levelIndex;
    this.reset();
  }

  /** (Re)start the current level. Called on entry and after a death. */
  startLevel() {
    this.waveIndex = -1;
    this.state = 'breather';
    this.timer = FIRST_WAVE_DELAY;
    this.toSpawn = 0;
    this.levelKills = 0;
  }

  get level() { return LEVELS[this.levelIndex]; }
  get wave() { return this.level.waves[this.waveIndex] || null; }
  get waveCount() { return this.level.waves.length; }
  get isLastLevel() { return this.levelIndex === LEVELS.length - 1; }

  takeUpgrade(id) {
    this.taken.push(id);
    this.stats = statsFrom(this.taken);
  }

  /** Stats for one zombie of `type` on this level at this difficulty. */
  enemyStats(type) {
    const t = TYPES[type] || TYPES.shambler;
    const base = this.level.enemy;
    return {
      hp: base.hp * t.hp * this.difficulty.hp,
      speed: base.speed * t.speed * this.difficulty.speed,
      damageScale: t.damage * this.difficulty.damage,
    };
  }

  /** Weighted pick from a wave's mix, e.g. { shambler: 3, runner: 1 }. */
  _pickType(mix, rand) {
    let total = 0;
    for (const k in mix) total += mix[k];
    let r = rand() * total;
    for (const k in mix) {
      r -= mix[k];
      if (r <= 0) return k;
    }
    return 'shambler';
  }

  step(dt, horde, world, playerPos, colliders, rand = Math.random) {
    if (this.state === 'cleared' || this.state === 'won' || this.state === 'idle') return;
    this.elapsed += dt;

    if (this.state === 'breather') {
      this.timer -= dt;
      if (this.timer <= 0) this._beginWave();
      return;
    }

    // --- spawning ----------------------------------------------------------
    const w = this.wave;
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && horde.aliveCount < w.alive) {
        const type = this._pickType(w.mix, rand);
        const es = this.enemyStats(type);
        const points = world.spawnPoints;

        // Prefer a gate away from the player, so they walk in out of the dark
        // rather than materialising in your line of fire.
        let best = points[0], bestScore = -Infinity;
        for (let i = 0; i < 6; i++) {
          const p = points[(rand() * points.length) | 0];
          const score = Math.hypot(p.x - playerPos.x, p.z - playerPos.z) + rand() * 6;
          if (score > bestScore) { bestScore = score; best = p; }
        }

        if (horde.spawnAt(best, es.hp, es.speed, colliders, playerPos, type, es.damageScale)) {
          this.toSpawn--;
        }
        this.spawnTimer = w.gap;
      }
    }

    // --- wave / level end --------------------------------------------------
    if (this.toSpawn === 0 && horde.aliveCount === 0) {
      this.hooks.onWaveCleared(this.waveIndex + 1, this.waveCount);
      if (this.waveIndex >= this.waveCount - 1) {
        this.state = 'cleared';
        if (this.isLastLevel) {
          this.state = 'won';
          this.hooks.onCampaignWon();
        } else {
          this.hooks.onLevelCleared(this.levelIndex);
        }
      } else {
        this.state = 'breather';
        this.timer = WAVE_BREATHER;
      }
    }
  }

  _beginWave() {
    this.waveIndex++;
    this.state = 'wave';
    this.toSpawn = this.wave.n;
    this.spawnTimer = 0;
    this.hooks.onWaveStart(this.waveIndex + 1, this.waveCount, this.wave);
  }

  /** Advance past a cleared level. Returns false if the campaign is over. */
  advance() {
    if (this.isLastLevel) return false;
    this.levelIndex++;
    return true;
  }

  get accuracy() {
    return this.shotsFired ? this.shotsHit / this.shotsFired : 0;
  }
}
