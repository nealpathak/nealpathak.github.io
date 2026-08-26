// UI root: owns the title screen, the HUD, the pause menu and the death screen,
// and routes between them off game mode changes.

import { HUD } from './hud.js';
import { TitleScreen } from './title.js';
import { PauseMenu } from './pause.js';
import { RestMenu } from './rest.js';
import { bus } from '../core/events.js';
import { MODE } from '../game/game.js';

export function mountUI(engine, game) {
  const root = engine.ui;
  root.innerHTML = '';

  const hud = new HUD(root, game);
  const title = new TitleScreen(root, engine, game);
  const pause = new PauseMenu(root, engine, game);
  const rest = new RestMenu(root, game);

  hud.setVisible(false);

  bus.on('game:started', () => { hud.setVisible(true); title.hide(); });
  bus.on('ui:announce', ({ text, kind, duration }) => hud.announce(text, kind, duration));
  bus.on('game:paused', () => pause.show());
  bus.on('game:resumed', () => pause.hide());

  // Escape toggles pause. Handled here rather than in the player so it works
  // regardless of what state the player is in.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (rest.visible) { rest.close(); return; }
    if (game.mode === MODE.PLAYING) game.pause();
    else if (game.mode === MODE.PAUSED) game.resume();
  });

  // Losing pointer lock mid-fight should pause, not leave the player helpless.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.mode === MODE.PLAYING && !rest.visible) game.pause();
  });

  // Clicking the canvas resumes from pause or starts the game.
  engine.canvas.addEventListener('click', () => {
    if (rest.visible) return;
    if (game.mode === MODE.PAUSED) game.resume();
    else if (game.mode === MODE.TITLE) title.begin();
  });

  // Autostart is honoured here, after the listeners above exist, so the title
  // card actually hides.
  if (game.wantsAutostart) queueMicrotask(() => game.start());

  return {
    hud, title, pause, rest,
    update(dt) {
      if (hud.visible) hud.update(dt);
      title.update(dt);
    },
  };
}
