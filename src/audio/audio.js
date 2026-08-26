// The game's audio: a small mixer, procedural effects bound to game events, and
// an adaptive music bed that shifts when a fight starts.
//
// Everything is lazy: no AudioContext exists until the player interacts, which
// is both what browsers require and what stops a muted tab from doing work.

import * as THREE from 'three';
import { bus } from '../core/events.js';
import { settings } from '../core/settings.js';
import { Synth } from './synth.js';
import { clamp, clamp01 } from '../core/math.js';

const MINOR_PENT = [0, 3, 5, 7, 10];

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this._lastFootstep = 0;
    this._musicTimer = 0;
    this._intensity = 0;
    this._intensityTarget = 0;
    this._listenerPos = new THREE.Vector3();
    this._wired = false;
  }

  /** Called from the first real user gesture. */
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = settings.get('masterVolume');
    // A gentle limiter so a busy fight cannot clip.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.16;
    this.master.connect(this.limiter).connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = settings.get('sfxVolume');
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = settings.get('musicVolume');

    // One shared reverb, built from noise rather than an impulse file.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.6, 2.4);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.sfxBus.connect(this.reverbSend).connect(this.reverb).connect(this.master);

    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    this.sfx = new Synth(this.ctx, this.sfxBus);
    this.music = new Synth(this.ctx, this.musicBus);
    this.ready = true;

    if (!this._wired) { this._wire(); this._wired = true; }
    bus.emit('audio:ready');
  }

  _makeImpulse(duration = 2.5, decay = 2) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Rough distance attenuation. Full 3D panning is overkill for this camera. */
  _gainAt(position, base = 1, falloff = 22) {
    if (!position) return base;
    const d = this._listenerPos.distanceTo(position);
    return base * clamp01(1 - d / falloff) ** 1.6;
  }

  _wire() {
    bus.on('sfx:footstep', ({ actor, heavy, speed }) => {
      const now = this.ctx.currentTime;
      if (now - this._lastFootstep < 0.09) return;
      this._lastFootstep = now;
      const g = this._gainAt(actor.position, heavy ? 0.30 : 0.20, 18) * clamp(speed / 4, 0.4, 1.3);
      if (g < 0.01) return;
      this.sfx.noise({ duration: 0.10, filter: 'lowpass', freq: 380 + Math.random() * 160, q: 0.9, gain: g, sweep: 0.35, attack: 0.002 });
      this.sfx.noise({ duration: 0.05, filter: 'highpass', freq: 2600, gain: g * 0.35, attack: 0.001 });
    });

    bus.on('sfx:swoosh', ({ actor, pitch = 1, big }) => {
      const g = this._gainAt(actor.position, big ? 0.26 : 0.18, 24);
      if (g < 0.01) return;
      this.sfx.noise({
        duration: big ? 0.34 : 0.22, filter: 'bandpass',
        freq: 900 * pitch, q: 1.6, gain: g, sweep: 2.6, attack: 0.02,
      });
    });

    bus.on('combat:hit', ({ defender, report }) => {
      const pos = report.point ?? defender.position;
      const base = this._gainAt(pos, 0.42, 26);
      if (base < 0.01) return;
      if (report.blocked) {
        // Steel on steel: a bright metallic ping over a thud.
        this.sfx.tone({ type: 'triangle', freq: 1800, to: 900, duration: 0.16, gain: base * 0.5, attack: 0.001 });
        this.sfx.tone({ type: 'square', freq: 2700, to: 1600, duration: 0.09, gain: base * 0.22, attack: 0.001 });
        this.sfx.noise({ duration: 0.14, filter: 'highpass', freq: 3400, gain: base * 0.4, attack: 0.001 });
      } else {
        const heavy = report.damage > 60;
        this.sfx.noise({ duration: heavy ? 0.24 : 0.15, filter: 'lowpass', freq: heavy ? 420 : 620, gain: base, sweep: 0.3, attack: 0.001 });
        this.sfx.tone({ type: 'sine', freq: heavy ? 90 : 130, to: 45, duration: 0.20, gain: base * 0.7, attack: 0.001 });
        if (report.relation === 'advantage' || report.relation === 'mutual') {
          this.sfx.tone({ type: 'triangle', freq: 1400, to: 2400, duration: 0.22, gain: base * 0.30, attack: 0.004 });
        }
        if (report.attack?.critical) {
          this.sfx.tone({ type: 'sawtooth', freq: 160, to: 60, duration: 0.5, gain: base * 0.5, attack: 0.002 });
        }
      }
      this._bumpIntensity(0.35);
    });

    bus.on('combat:parried', ({ defender }) => {
      const g = this._gainAt(defender.position, 0.5, 26);
      this.sfx.tone({ type: 'triangle', freq: 2400, to: 3600, duration: 0.28, gain: g * 0.5, attack: 0.001 });
      this.sfx.tone({ type: 'sine', freq: 1200, to: 1800, duration: 0.36, gain: g * 0.3, attack: 0.001 });
      this._bumpIntensity(0.5);
    });

    bus.on('enemy:died', ({ enemy }) => {
      const g = this._gainAt(enemy.position, 0.36, 30);
      this.sfx.pad({ freq: 180, duration: 1.1, gain: g * 0.5, cutoff: 900, attack: 0.02 });
      this.sfx.noise({ duration: 0.9, filter: 'lowpass', freq: 1400, gain: g * 0.4, sweep: 0.15, attack: 0.01 });
    });

    bus.on('enemy:alerted', ({ enemy }) => {
      const g = this._gainAt(enemy.position, 0.28, 22);
      if (g < 0.02) return;
      this.sfx.tone({ type: 'sawtooth', freq: 220, to: 140, duration: 0.5, gain: g * 0.4, attack: 0.02 });
      this._bumpIntensity(0.5);
    });

    bus.on('player:damaged', () => {
      this.sfx.tone({ type: 'sine', freq: 70, to: 40, duration: 0.4, gain: 0.5, attack: 0.002 });
      this._bumpIntensity(0.6);
    });

    bus.on('player:died', () => {
      this._intensityTarget = 0;
      this.music.pad({ freq: 55, duration: 4.5, gain: 0.28, cutoff: 500, attack: 0.4 });
      this.music.pad({ freq: 82.5, duration: 4.0, gain: 0.16, cutoff: 400, attack: 0.6 });
    });

    bus.on('player:noStamina', () => {
      this.sfx.noise({ duration: 0.18, filter: 'bandpass', freq: 380, q: 3, gain: 0.16, attack: 0.01 });
    });

    bus.on('player:flask', () => {
      this.sfx.noise({ duration: 0.5, filter: 'bandpass', freq: 700, q: 2.4, gain: 0.22, sweep: 1.8, attack: 0.05 });
      this.sfx.tone({ type: 'sine', freq: 420, to: 620, duration: 0.5, gain: 0.14, attack: 0.06 });
    });

    bus.on('progression:rested', () => {
      for (const [i, n] of [0, 7, 12].entries()) {
        this.music.tone({
          type: 'sine', freq: 220 * Math.pow(2, n / 12), duration: 1.8,
          gain: 0.16, attack: 0.06,
        }, this.ctx.currentTime + i * 0.22);
      }
    });

    bus.on('progression:levelled', () => {
      for (const [i, n] of [0, 4, 7, 12].entries()) {
        this.music.tone({
          type: 'triangle', freq: 330 * Math.pow(2, n / 12), duration: 0.9,
          gain: 0.16, attack: 0.01,
        }, this.ctx.currentTime + i * 0.09);
      }
    });

    bus.on('covenant:bound', () => {
      for (const [i, n] of [12, 7, 4, 0].entries()) {
        this.music.tone({
          type: 'sine', freq: 440 * Math.pow(2, n / 12), duration: 1.2,
          gain: 0.18, attack: 0.02,
        }, this.ctx.currentTime + i * 0.13);
      }
    });

    bus.on('settings:changed', ({ key }) => {
      if (!this.ready) return;
      if (key === 'masterVolume' || key === '*') this.master.gain.value = settings.get('masterVolume');
      if (key === 'sfxVolume' || key === '*') this.sfxBus.gain.value = settings.get('sfxVolume');
      if (key === 'musicVolume' || key === '*') this.musicBus.gain.value = settings.get('musicVolume');
    });
  }

  _bumpIntensity(amount) {
    this._intensityTarget = Math.min(1, this._intensityTarget + amount);
  }

  /**
   * The music bed. A slow drone plus sparse pentatonic notes out of combat; in
   * combat the drone rises, a pulse comes in, and the notes come faster.
   */
  _tickMusic(dt) {
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;

    const i = this._intensity;
    const t = this.ctx.currentTime;

    // Drone: a root fifth that never quite resolves.
    if (!this._droneAt || t - this._droneAt > 7.5) {
      this._droneAt = t;
      const root = 55 * (i > 0.5 ? 1.0 : 1.0);
      this.music.pad({ freq: root, duration: 9, gain: 0.10 + i * 0.06, cutoff: 420 + i * 700, attack: 1.6 });
      this.music.pad({ freq: root * 1.5, duration: 8, gain: 0.05 + i * 0.05, cutoff: 500 + i * 600, attack: 2.2 });
    }

    // A heartbeat pulse that only exists in combat.
    if (i > 0.25) {
      this.music.tone({ type: 'sine', freq: 48, to: 34, duration: 0.32, gain: 0.08 + i * 0.14, attack: 0.004 });
    }

    // Melody: sparse when calm, insistent when not.
    if (Math.random() < 0.35 + i * 0.4) {
      const octave = Math.random() < 0.3 ? 2 : 1;
      const step = MINOR_PENT[(Math.random() * MINOR_PENT.length) | 0];
      this.music.tone({
        type: i > 0.4 ? 'triangle' : 'sine',
        freq: 220 * octave * Math.pow(2, step / 12),
        duration: 1.4 + Math.random() * 1.6,
        gain: 0.05 + i * 0.05,
        attack: 0.12,
      });
    }

    this._musicTimer = (i > 0.3 ? 0.85 : 2.2) + Math.random() * (i > 0.3 ? 0.3 : 1.4);
  }

  update(dt, listenerPosition) {
    if (!this.ready || !this.enabled) return;
    if (this.ctx.state === 'suspended') return;
    if (listenerPosition) this._listenerPos.copy(listenerPosition);

    // Intensity rises fast on a hit and bleeds away over a few seconds, which
    // is what makes the music track the fight rather than a timer.
    const nearbyAggro = this.game.enemies.reduce((n, e) => (
      e.alive && e.aggro && e.position.distanceTo(this._listenerPos) < 22 ? n + 1 : n
    ), 0);
    if (nearbyAggro > 0) this._intensityTarget = Math.max(this._intensityTarget, clamp01(0.35 + nearbyAggro * 0.18));
    else this._intensityTarget = Math.max(0, this._intensityTarget - dt * 0.30);

    this._intensity += (this._intensityTarget - this._intensity) * Math.min(1, dt * 1.6);
    this._tickMusic(dt);
  }
}
