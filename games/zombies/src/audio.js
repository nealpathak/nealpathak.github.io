// Sound, synthesised at runtime. No files to download, no licences to chase.
//
// Everything is a noise burst or an oscillator through an envelope. It won't
// win awards, but silence makes a shooter feel broken and this doesn't.

import * as THREE from 'three';

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
    this.volume = 0.5;
    this.growlGate = 0;    // wall-clock time before the next growl is allowed
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Must be called from a user gesture, or the context stays suspended. */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused by every noise-based sound.
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this._ambience();
  }

  /** A low bed so silence never reads as "the audio broke". */
  _ambience() {
    const t = this.ctx.currentTime;
    const bed = this.ctx.createGain();
    bed.gain.value = 0.055;
    bed.connect(this.master);

    for (const f of [46, 69]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 190;
      o.connect(lp).connect(bed);
      o.start(t);
    }

    // Slow wind: looping noise under a heavy low-pass.
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    wind.playbackRate.value = 0.25;
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start(t);
  }

  /**
   * Move the listener to the camera. Positional growls are the only warning a
   * player gets about what is behind them, so this has to track the view every
   * frame, not just on spawn.
   */
  setListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.position;

    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(_fwd.x, t);
      l.forwardY.setValueAtTime(_fwd.y, t);
      l.forwardZ.setValueAtTime(_fwd.z, t);
      l.upX.setValueAtTime(_up.x, t);
      l.upY.setValueAtTime(_up.y, t);
      l.upZ.setValueAtTime(_up.z, t);
    } else if (l.setPosition) {
      // Safari and older Chrome still only have the deprecated setters.
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
  }

  _panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.maxDistance = 40;
    p.rolloffFactor = 1.1;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
    p.connect(this.master);
    return p;
  }

  /** A wet, throaty rasp at a point in the world. */
  growl(x, y, z) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.growlGate) return;    // don't let a crowd become a wall of noise
    this.growlGate = t + 0.45;

    const out = this._panner(x, y, z);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.10 + Math.random() * 0.06;

    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(160 + Math.random() * 90, t);
    band.frequency.linearRampToValueAtTime(90 + Math.random() * 50, t + 0.5);
    band.Q.value = 3.5;

    const env = this.ctx.createGain();
    const dur = 0.4 + Math.random() * 0.4;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.09);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(band).connect(env).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _burst({ duration, gain, freq, q = 1, type = 'lowpass', decay = 2 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq / decay), t + duration);
    filter.Q.value = q;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  _tone({ freq, to, duration, gain, type = 'sine' }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shot() {
    this._burst({ duration: 0.20, gain: 0.42, freq: 5200, decay: 14 });
    this._tone({ freq: 150, to: 46, duration: 0.16, gain: 0.35, type: 'square' });
  }

  dryFire() { this._burst({ duration: 0.04, gain: 0.20, freq: 2600, q: 4 }); }

  hit() { this._tone({ freq: 1250, to: 780, duration: 0.055, gain: 0.16, type: 'triangle' }); }

  headshot() {
    this._tone({ freq: 1900, to: 900, duration: 0.09, gain: 0.20, type: 'triangle' });
    this._burst({ duration: 0.09, gain: 0.18, freq: 1400, q: 2 });
  }

  kill() { this._burst({ duration: 0.34, gain: 0.22, freq: 620, decay: 5 }); }

  hurt() {
    this._tone({ freq: 90, to: 42, duration: 0.30, gain: 0.4, type: 'sawtooth' });
    this._burst({ duration: 0.16, gain: 0.16, freq: 900, decay: 4 });
  }

  reload() {
    this._burst({ duration: 0.05, gain: 0.16, freq: 3200, q: 5 });
    setTimeout(() => this._burst({ duration: 0.06, gain: 0.18, freq: 1800, q: 5 }), 900);
  }

  roundStart() {
    this._tone({ freq: 62, to: 44, duration: 1.6, gain: 0.30, type: 'sawtooth' });
    this._tone({ freq: 186, to: 132, duration: 1.2, gain: 0.10, type: 'sine' });
  }

  death() { this._tone({ freq: 180, to: 30, duration: 1.5, gain: 0.4, type: 'sawtooth' }); }
}
