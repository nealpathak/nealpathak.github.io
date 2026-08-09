// Sound, synthesised at runtime. No files to download, no licences to chase.
//
// Everything is a noise burst or an oscillator through an envelope. It won't
// win awards, but silence makes a shooter feel broken and this doesn't.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
  }

  /** Must be called from a user gesture, or the context stays suspended. */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused by every noise-based sound.
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
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
