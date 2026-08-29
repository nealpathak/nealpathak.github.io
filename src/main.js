// Bootstrap and the game loop.

import { Renderer } from './render/renderer.js';
import { Course } from './world/course.js';
import { Ship } from './game/ship.js';
import { Run, State, formatTime } from './game/run.js';
import { GhostRecorder, GhostPlayer } from './game/ghost.js';
import { Input } from './core/input.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { todayKey, dayNumber, seedForKey, hashString } from './core/rng.js';
import { getRecord, saveRecord, encodeFloats, decodeFloats } from './core/storage.js';

const FIXED = 1 / 120;      // physics step; fixed so runs are comparable
const MAX_FRAME = 0.25;     // never simulate more than this after a stall

const el = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.canvas = el('view');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.hud = new Hud();
    this.mode = 'title';
    this.acc = 0;
    this.last = 0;
    this.fpsAvg = 60;
    this.autoQuality = true;
    // Ignore the first couple of seconds: startup frames are never typical.
    this.warmup = 2.5;
    this.maxScale = this.renderer.resolutionScale;

    this.loadCourse(resolveCourse());
    this.bindUi();
    addEventListener('resize', () => this.renderer.resize());
    this.last = performance.now();
    // Debug handle: lets a headless test install an autopilot and lets future
    // sessions poke at live state from the console.
    globalThis.__slipstream = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  loadCourse(sel) {
    this.sel = sel;
    this.course = new Course(sel.seed, sel.key);
    this.renderer.setCourse(this.course);
    this.ship = new Ship(this.course);
    this.run = new Run(this.course, this.ship);
    this.recorder = null;

    const rec = getRecord(sel.key);
    this.best = rec ? rec.best : null;
    this.ghost = new GhostPlayer(rec && rec.ghost ? decodeFloats(rec.ghost) : null);

    this.hud.buildProgress(this.course);
    this.hud.setCourseLabel(sel.label, this.best);
    el('title-course').textContent = sel.label;
    el('title-palette').textContent = this.renderer.palette.name;
    el('title-best').textContent = this.best != null ? formatTime(this.best) : '—';
    el('title-ghost').style.display = this.ghost.data ? '' : 'none';
    this.renderer.terrain.prewarm(0);
  }

  bindUi() {
    el('btn-start').addEventListener('click', () => this.startRun());
    el('btn-retry').addEventListener('click', () => this.startRun());
    el('btn-menu').addEventListener('click', () => this.toTitle());
    el('btn-free').addEventListener('click', () => {
      this.loadCourse(freeCourse());
      this.toTitle();
    });
    el('btn-daily').addEventListener('click', () => {
      this.loadCourse(dailyCourse());
      this.toTitle();
    });
    const mute = el('btn-mute');
    mute.addEventListener('click', () => {
      const m = !this.audio.muted;
      this.audio.setMuted(m);
      mute.textContent = m ? '♪ off' : '♪ on';
      mute.setAttribute('aria-pressed', String(m));
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.mode !== 'title') this.startRun();
      if (e.code === 'Escape') this.toTitle();
      if (e.code === 'Enter' && this.mode !== 'flying') this.startRun();
    });
  }

  toTitle() {
    this.mode = 'title';
    this.ship.reset();
    this.run.reset();
    document.body.dataset.mode = 'title';
    el('title-best').textContent = this.best != null ? formatTime(this.best) : '—';
  }

  startRun() {
    this.audio.start();
    for (const g of this.course.gates) { delete g.hitAt; delete g.missAt; }
    this.ship.reset();
    this.run.reset();
    this.run.start();
    this.recorder = new GhostRecorder();
    this.ghost._cursor = 0;
    this.mode = 'flying';
    document.body.dataset.mode = 'flying';
    this.hud.buildProgress(this.course);
    this.hud.showToast('GO', 'go');
  }

  finishRun() {
    this.mode = 'results';
    document.body.dataset.mode = 'results';
    const t = this.run.finalTime;
    const improved = this.best == null || t < this.best;
    const prev = this.best;

    if (improved) {
      const blob = encodeFloats(this.recorder.toArray());
      saveRecord(this.sel.key, t, blob);
      this.best = t;
      this.ghost = new GhostPlayer(this.recorder.toArray());
      this.audio.record();
    } else {
      this.audio.finish();
    }

    el('res-time').textContent = formatTime(t);
    el('res-title').textContent = improved ? 'NEW BEST' : 'RUN COMPLETE';
    el('res-title').className = improved ? 'best' : '';
    el('res-gates').textContent = `${this.run.passed}/${this.course.gates.length}`;
    el('res-penalty').textContent = this.run.penalty > 0 ? `+${this.run.penalty.toFixed(1)}s` : 'none';
    el('res-crashes').textContent = String(this.ship.crashCount);
    el('res-clean').textContent = this.run.missed === 0 && this.ship.crashCount === 0 ? 'CLEAN RUN' : '';
    const d = el('res-delta');
    if (prev != null) {
      const diff = t - prev;
      d.textContent = `${diff < 0 ? '−' : '+'}${Math.abs(diff).toFixed(2)}s vs PB`;
      d.className = diff < 0 ? 'ahead' : 'behind';
    } else {
      d.textContent = 'first completion';
      d.className = '';
    }
    this.hud.setCourseLabel(this.sel.label, this.best);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, MAX_FRAME);

    this.input.update();
    if (this.input.takePress() && this.mode === 'title') this.startRun();

    if (this.mode === 'flying') {
      this.acc += dt;
      let guard = 0;
      while (this.acc >= FIXED && guard++ < 240) {
        this.ship.update(FIXED, this.input);
        this.run.update(FIXED);
        if (this.recorder) this.recorder.sample(this.run.time, this.ship);
        this.acc -= FIXED;
        if (this.run.state === State.FINISHED) break;
      }
      this.handleEvents();
      if (this.run.state === State.FINISHED) this.finishRun();
    } else {
      // Idle drift on the title and results screens keeps the scene alive.
      this.acc = 0;
      this.ship.update(Math.min(dt, FIXED * 4), { steer: 0, pitch: 0, brake: 0 });
    }

    const ghostPose = this.mode === 'flying' ? this.ghost.at(this.run.time) : null;
    let ghostDelta = null;
    if (this.mode === 'flying' && this.ghost.data) {
      const tg = this.ghost.timeAtZ(this.ship.z);
      if (tg != null) ghostDelta = this.run.time - tg;
    }

    this.renderer.render({ ship: this.ship, run: this.run, ghostPose }, dt);
    this.hud.update(this.run, this.ship, ghostDelta, now);
    this.audio.update(this.ship, this.mode === 'flying');
    this.adaptQuality(dt);
  }

  handleEvents() {
    for (const e of this.run.drain()) {
      if (e.type === 'gate') {
        this.audio.gate();
        this.hud.markGate(e.gate.i, true);
        // Threading the very centre is worth calling out.
        if (e.dist < 3.5) this.hud.showToast('PERFECT', 'perfect');
      } else if (e.type === 'miss') {
        this.audio.miss();
        this.hud.markGate(e.gate.i, false);
        this.hud.showToast('GATE MISSED  +2.0s', 'bad');
      }
    }
    if (this.ship.crashed) this.audio.crash();
  }

  // If the frame rate sags, trade internal resolution for smoothness -- and
  // give it back once the frame rate recovers, so one early hitch (shader
  // compilation, the first chunk build) doesn't permanently soften the image.
  adaptQuality(dt) {
    if (!this.autoQuality) return;
    if (this.warmup > 0) { this.warmup -= dt; return; }
    this.fpsAvg = this.fpsAvg * 0.94 + (1 / Math.max(dt, 1e-3)) * 0.06;
    const scale = this.renderer.resolutionScale;
    if (this.fpsAvg < 45 && scale > 0.45) {
      this.renderer.setResolutionScale(scale - 0.06);
      this.fpsAvg = 60;
    } else if (this.fpsAvg > 88 && scale < this.maxScale) {
      this.renderer.setResolutionScale(Math.min(this.maxScale, scale + 0.04));
      this.fpsAvg = 60;
    }
  }
}

// --- course selection --------------------------------------------------
function dailyCourse() {
  const key = todayKey();
  return { key, seed: seedForKey(key), label: `DAILY · DAY ${dayNumber(key)}`, daily: true };
}

function freeCourse() {
  const s = Math.floor(Math.random() * 0xffffffff);
  const key = `free-${s.toString(36)}`;
  return { key, seed: s, label: `FREE RUN · ${s.toString(36).toUpperCase()}`, daily: false };
}

// ?seed=anything pins a shareable course.
function resolveCourse() {
  const q = new URLSearchParams(location.search).get('seed');
  if (q) {
    const key = `seed-${q}`;
    return { key, seed: hashString(q), label: `SEED · ${q.toUpperCase().slice(0, 16)}`, daily: false };
  }
  return dailyCourse();
}

function boot() {
  try {
    new Game();
  } catch (err) {
    console.error(err);
    const f = el('fatal');
    f.style.display = 'flex';
    el('fatal-msg').textContent = String(err && err.message ? err.message : err);
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
