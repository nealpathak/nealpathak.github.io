// Procedural audio. Nothing is loaded from disk: the engine, the wind and
// every cue are synthesised, which keeps the game a pure-text deployment.

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this._pendingMute = false;
  }

  // Must be called from a user gesture; browsers block audio before one.
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // --- engine: two detuned saws through a moving low-pass ---------------
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 6;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc1.frequency.value = 90;
    this.osc2.frequency.value = 135;
    const sub = ctx.createGain(); sub.gain.value = 0.35;
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(sub).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // --- wind: looping white noise through a band-pass --------------------
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.wind = ctx.createBufferSource();
    this.wind.buffer = buf;
    this.wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 900;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.wind.start();

    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  // Continuous state, called once per frame.
  update(ship, flying) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const spd = ship.speed;
    const boost = ship.boostFactor;
    const engineHz = 46 + spd * 0.95 + boost * 26;
    ramp(this.osc1.frequency, engineHz, t);
    ramp(this.osc2.frequency, engineHz * 1.49, t);
    ramp(this.engineFilter.frequency, 520 + spd * 9 + boost * 900, t);
    ramp(this.engineGain.gain, flying ? 0.10 + boost * 0.09 : 0.03, t);
    // Wind rises steeply with speed and sharpens as the boost builds.
    const windAmt = Math.max(0, (spd - 40) / 80);
    ramp(this.windGain.gain, flying ? windAmt * windAmt * 0.30 : 0.0, t);
    ramp(this.windFilter.frequency, 620 + spd * 12 + boost * 700, t);
  }

  _ping(freq, dur, type, gain, slideTo) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _burst(dur, freq, gain) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  gate() { this._ping(880, 0.16, 'sine', 0.22); this._ping(1320, 0.13, 'sine', 0.11); }
  miss() { this._ping(180, 0.30, 'sawtooth', 0.16, 90); }
  crash() { this._burst(0.42, 1600, 0.5); this._ping(70, 0.35, 'square', 0.14, 40); }
  boostReady() { this._ping(520, 0.20, 'triangle', 0.10, 1040); }
  finish() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this._ping(f, 0.55, 'triangle', 0.16), i * 90);
    });
  }
  record() {
    [659.25, 830.6, 987.77, 1318.5].forEach((f, i) => {
      setTimeout(() => this._ping(f, 0.7, 'sine', 0.18), i * 80);
    });
  }
}

// Short ramps everywhere: stepping an AudioParam directly causes clicks.
function ramp(param, value, t) {
  param.setTargetAtTime(value, t, 0.05);
}
