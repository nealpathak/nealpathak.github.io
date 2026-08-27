// Fixed-timestep simulation with a variable-rate render, plus the two knobs
// combat feel depends on: a global time scale and hit-stop.
//
// Hit-stop is the brief freeze on a landed blow. It is the single cheapest
// thing you can do to make a swing feel like it connected with something.

export class Loop {
  constructor({ step = 1 / 60, maxSteps = 5, onFixed, onRender } = {}) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.onFixed = onFixed;
    this.onRender = onRender;

    this.accumulator = 0;
    this.timeScale = 1;
    this.elapsed = 0;          // scaled game time
    this.realElapsed = 0;      // unscaled, for UI animation
    this.frame = 0;
    this.running = false;
    this.paused = false;

    this._hitStop = 0;
    this._hitStopScale = 0;
    this._last = 0;
    this._rafId = 0;
    this._tick = this._tick.bind(this);

    // Rolling frame-time average, for the perf overlay and adaptive quality.
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._rafId);
  }

  /** Freeze (or heavily slow) the simulation for `duration` real seconds. */
  hitStop(duration = 0.07, scale = 0.02) {
    // Keep the strongest active stop rather than letting a weak one cut a strong one short.
    if (duration * (1 - scale) >= this._hitStop * (1 - this._hitStopScale)) {
      this._hitStop = duration;
      this._hitStopScale = scale;
    }
  }

  _tick(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(this._tick);

    // Clamp: a backgrounded tab or a long GC pause must not deliver a 3s dt.
    let realDt = (now - this._last) / 1000;
    this._last = now;
    if (realDt > 0.25) realDt = 0.25;
    if (realDt <= 0) return;

    this.realElapsed += realDt;
    this._fpsAccum += realDt; this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0; this._fpsFrames = 0;
    }

    let scale = this.paused ? 0 : this.timeScale;
    if (this._hitStop > 0) {
      this._hitStop -= realDt;
      scale *= this._hitStopScale;
      if (this._hitStop <= 0) { this._hitStop = 0; this._hitStopScale = 0; }
    }

    const dt = realDt * scale;
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      this.onFixed?.(this.step, this.elapsed);
      this.elapsed += this.step;
      this.accumulator -= this.step;
      steps++;
    }
    // If we blew the budget, drop the backlog instead of falling further behind.
    if (steps === this.maxSteps) this.accumulator = 0;

    this.frame++;
    this.onRender?.(realDt, this.accumulator / this.step, dt);
  }
}
