// Entry point. Boots the engine, then hands off to the game.

import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { PostFX } from './render/composer.js';
import { tickMaterials } from './render/materials.js';
import { Loop } from './core/loop.js';
import { Input } from './core/input.js';
import { settings } from './core/settings.js';
import { bus } from './core/events.js';

export const engine = {
  renderer: null, post: null, input: null, loop: null, ui: null, canvas: null, game: null,
};

function setBootStatus(text, pct) {
  const s = document.getElementById('boot-status');
  const f = document.getElementById('boot-fill');
  if (s && text != null) s.textContent = text;
  if (f && pct != null) f.style.width = `${Math.round(pct * 100)}%`;
}

function assertWebGL2() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) {
    throw new Error('This game needs WebGL 2, which this browser or device did not provide. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
  }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return String(name);
}

export async function boot() {
  setBootStatus('Checking your hardware…', 0.05);
  const gpu = assertWebGL2();
  console.info('[emberwake] GPU:', gpu);

  const canvas = document.getElementById('viewport');
  engine.canvas = canvas;
  engine.ui = document.getElementById('ui');

  setBootStatus('Lighting the sky…', 0.15);
  const renderer = new Renderer(canvas);
  engine.renderer = renderer;

  setBootStatus('Grinding lenses…', 0.28);
  const post = new PostFX(renderer);
  post.applyQuality(renderer.quality);
  engine.post = post;

  const input = new Input(window);
  input.sensitivity = 0.0022 * settings.get('sensitivity');
  input.invertY = settings.get('invertY');
  engine.input = input;

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.resize(w, h);
    post.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  bus.on('settings:changed', ({ key }) => {
    if (key === 'quality' || key === '*') {
      renderer.applyQuality(settings.get('quality'));
      post.applyQuality(renderer.quality);
      resize();
    }
    if (key === 'fov' || key === '*') renderer.setFov(settings.get('fov'));
    if (key === 'sensitivity' || key === '*') input.sensitivity = 0.0022 * settings.get('sensitivity');
    if (key === 'invertY' || key === '*') input.invertY = settings.get('invertY');
    if (key === 'largeText' || key === '*') document.body.classList.toggle('large-text', settings.get('largeText'));
  });
  document.body.classList.toggle('large-text', settings.get('largeText'));

  setBootStatus('Shaping the vale…', 0.45);
  await nextFrame();

  const { Game } = await import('./game/game.js');
  const game = await Game.create(engine);
  engine.game = game;

  setBootStatus('Waking the ash…', 0.86);
  await nextFrame();

  const { mountUI } = await import('./ui/index.js');
  engine.uiRoot = mountUI(engine, game);

  setBootStatus('Ready', 1);

  const loop = new Loop({
    step: 1 / 60,
    onFixed: (dt) => game.fixedUpdate(dt),
    onRender: (realDt, alpha, dt) => {
      input.update(realDt);
      game.update(realDt, alpha, dt);
      tickMaterials(loop.elapsed);
      renderer.tick(loop.elapsed);
      post.tick(realDt, loop.realElapsed);
      engine.uiRoot?.update(realDt);
      post.render();
    },
  });
  engine.loop = loop;
  game.loop = loop;
  loop.start();

  // A console handle for debugging and for the headless test harness. Exposing
  // resolveHit lets a test drive a hit without having to pose a weapon first.
  const { resolveHit } = await import('./combat/damage.js');
  const { BONE_INDEX } = await import('./anim/skeleton.js');
  window.__BI = BONE_INDEX;   // bone lookup, for the animation probes in tools/
  window.emberwake = { engine, game, THREE, bus, settings, resolveHit };

  await nextFrame();
  document.getElementById('boot')?.classList.add('boot--done');
  document.body.classList.add('booted');
  bus.emit('boot:done');
  return game;
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
