// UI root: owns the title screen, the HUD, the pause menu and the death screen,
// and routes between them off game mode changes.

import { HUD } from './hud.js';
import { TitleScreen } from './title.js';
import { PauseMenu } from './pause.js';
import { RestMenu } from './rest.js';
import { Coach } from './coach.js';
import { Compass } from './compass.js';
import { TouchControls, wantsTouch } from './touch.js';
import { bus } from '../core/events.js';
import { MODE } from '../game/game.js';

export function mountUI(engine, game) {
  const root = engine.ui;
  root.innerHTML = '';

  const hud = new HUD(root, game);
  const title = new TitleScreen(root, engine, game);
  const pause = new PauseMenu(root, engine, game);
  const rest = new RestMenu(root, game);
  const coach = new Coach(root, game);
  const compass = new Compass(root, game);
  const touch = wantsTouch() ? new TouchControls(root, engine, game) : null;
  if (touch) document.documentElement.classList.add('is-touch');

  hud.setVisible(false);
  compass.setVisible(false);

  bus.on('game:started', () => {
    hud.setVisible(true); compass.setVisible(true); title.hide();
    touch?.setVisible(true);
  });
  bus.on('game:paused', () => touch?.setVisible(false));
  bus.on('game:resumed', () => touch?.setVisible(true));
  bus.on('ui:announce', ({ text, kind, duration }) => hud.announce(text, kind, duration));
  bus.on('game:paused', () => pause.show());
  bus.on('game:resumed', () => pause.hide());

  // Escape toggles pause. Handled here rather than in the player so it works
  // regardless of what state the player is in.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (rest.visible) { rest.close(); return; }
      if (game.mode === MODE.PLAYING) game.pause();
      else if (game.mode === MODE.PAUSED) game.resume();
      return;
    }
    // Gear and the covenant are readable anywhere, not only at a shrine. Only
    // levelling is gated, because that is what makes resting a decision.
    if (game.mode !== MODE.PLAYING) return;
    if (e.code === 'KeyI') { rest.open(null, 'gear'); }
    else if (e.code === 'KeyP') { rest.open(null, 'covenant'); }
  });

  // Losing pointer lock mid-fight should pause, not leave the player helpless.
  // On touch there was never a lock to lose, and pausing on the change event
  // would pause the game the instant it started.
  document.addEventListener('pointerlockchange', () => {
    if (touch) return;
    if (!document.pointerLockElement && game.mode === MODE.PLAYING && !rest.visible) game.pause();
  });

  // Clicking the canvas resumes from pause or starts the game. On touch the
  // canvas is also the camera, so only a tap that did not drag counts.
  engine.canvas.addEventListener('click', () => {
    if (rest.visible) return;
    if (game.mode === MODE.PAUSED) game.resume();
    else if (game.mode === MODE.TITLE) title.begin();
  });

  // Autostart is honoured here, after the listeners above exist, so the title
  // card actually hides.
  if (game.wantsAutostart) queueMicrotask(() => game.start());

  return {
    hud, title, pause, rest, coach, compass, touch,
    update(dt) {
      if (hud.visible) { hud.update(dt); coach.update(dt); compass.update(); }
      title.update(dt);
    },
  };
}
