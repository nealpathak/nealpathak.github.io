// Procedural sound. There are no audio files in this project either.
//
// Every effect is built from oscillators and filtered noise at play time. That
// costs a little CPU and saves every byte of download, and it means a sword hit
// can be pitched by how hard it landed rather than picking from three samples.

/** Shared noise buffer — generating this per sound would be wasteful. */
let noiseBuffer = null;
function getNoise(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  // Slightly brown-tinted noise: pure white is thin and hissy.
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5 + w * 0.3;
  }
  return noiseBuffer;
}

export class Synth {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = destination;
  }

  get now() { return this.ctx.currentTime; }

  _env(gainNode, { attack = 0.005, decay = 0.2, peak = 1, sustain = 0, release = 0.05, hold = 0 }, t0 = this.now) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    const holdEnd = t0 + attack + hold;
    if (hold > 0) g.setValueAtTime(Math.max(0.0001, peak), holdEnd);
    if (sustain > 0) {
      g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), holdEnd + decay);
      g.exponentialRampToValueAtTime(0.0001, holdEnd + decay + release);
      return holdEnd + decay + release;
    }
    g.exponentialRampToValueAtTime(0.0001, holdEnd + decay);
    return holdEnd + decay;
  }

  /** A filtered noise burst — impacts, footsteps, cloth, wind. */
  noise({ duration = 0.2, filter = 'bandpass', freq = 900, q = 1.2, gain = 0.3, sweep = 0, ...env }, t0 = this.now) {
    const src = this.ctx.createBufferSource();
    src.buffer = getNoise(this.ctx);
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const biq = this.ctx.createBiquadFilter();
    biq.type = filter;
    biq.frequency.setValueAtTime(freq, t0);
    biq.Q.value = q;
    if (sweep) biq.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + duration);

    const g = this.ctx.createGain();
    const end = this._env(g, { peak: gain, decay: duration, ...env }, t0);

    src.connect(biq).connect(g).connect(this.out);
    src.start(t0);
    src.stop(end + 0.05);
    return end;
  }

  /** A pitched tone with an optional glide. */
  tone({ type = 'sine', freq = 220, to = null, duration = 0.3, gain = 0.2, detune = 0, ...env }, t0 = this.now) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
    osc.detune.value = detune;

    const g = this.ctx.createGain();
    const end = this._env(g, { peak: gain, decay: duration, ...env }, t0);
    osc.connect(g).connect(this.out);
    osc.start(t0);
    osc.stop(end + 0.05);
    return end;
  }

  /** Two detuned saws through a filter — the "magic" timbre. */
  pad({ freq = 220, duration = 1.2, gain = 0.12, cutoff = 1400, q = 3, ...env }, t0 = this.now) {
    const g = this.ctx.createGain();
    const biq = this.ctx.createBiquadFilter();
    biq.type = 'lowpass';
    biq.frequency.setValueAtTime(cutoff, t0);
    biq.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.3), t0 + duration);
    biq.Q.value = q;

    for (const d of [-7, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = d;
      osc.connect(biq);
      osc.start(t0);
      osc.stop(t0 + duration + 0.3);
    }
    const end = this._env(g, { peak: gain, attack: 0.04, decay: duration, ...env }, t0);
    biq.connect(g).connect(this.out);
    return end;
  }
}
