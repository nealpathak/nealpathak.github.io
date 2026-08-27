// @env EW_TOUCH=1 EW_VIEW=844x390 EW_Q=?autostart=1&touch=1
// The on-screen controls.
//
// A phone visitor is the most likely visitor a personal site has, so the touch
// path is exercised the same way the keyboard path is: through the real input
// layer, driving the real player. This fakes pointer events at the coordinates
// the controls actually occupy and checks the game moves.
(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };

  const out = { errors: [] };
  const bad = (m) => out.errors.push(m);

  const ui = window.emberwake.ui;
  out.mounted = !!ui?.touch;
  if (!ui?.touch) { bad('touch controls were not mounted'); return out; }
  out.touchEnabled = input.touchEnabled;
  if (!input.touchEnabled) bad('the input layer was not told about touch');

  const send = (type, x, y, id = 1) => {
    window.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  };

  for (const e of g.enemies) { e.aggro = false; e.think = () => {}; }
  const t = g.zone.terrain;
  g.player.setPosition(0, t.heightAt(0, 40), 40);
  step(20);

  // --- the floating stick ---------------------------------------------------
  const before = g.player.position.clone();
  const cx = Math.round(window.innerWidth * 0.22), cy = Math.round(window.innerHeight * 0.7);
  send('pointerdown', cx, cy);
  step(2);
  out.stickLive = !!input._stick;
  if (!input._stick) bad('a touch in the left half did not raise the stick');
  // Push it well past the ring: full tilt, and the ring should follow.
  send('pointermove', cx, cy - 200);
  step(60);
  out.move = [+input.move.x.toFixed(2), +input.move.y.toFixed(2)];
  if (input.move.y < 0.9) bad(`full forward tilt gave move.y ${input.move.y}`);
  const travelled = g.player.position.distanceTo(before);
  out.travelled = +travelled.toFixed(2);
  if (travelled < 1.5) bad(`the stick moved the player only ${travelled.toFixed(2)}m in a second`);
  send('pointerup', cx, cy - 200);
  step(4);
  if (input._stick) bad('lifting the thumb did not drop the stick');
  if (Math.abs(input.move.x) + Math.abs(input.move.y) > 0.01) bad('the stick did not recentre');

  // --- the camera drag ------------------------------------------------------
  const yaw0 = g.camera.yaw;
  const rx = Math.round(window.innerWidth * 0.72), ry = Math.round(window.innerHeight * 0.35);
  send('pointerdown', rx, ry, 2);
  send('pointermove', rx - 180, ry, 2);
  step(4);
  send('pointerup', rx - 180, ry, 2);
  // Camera yaw wraps at +/-pi, so compare the shortest way round.
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  out.yawDelta = +wrap(g.camera.yaw - yaw0).toFixed(3);
  if (Math.abs(out.yawDelta) < 0.15) bad(`dragging the right half turned the camera by ${out.yawDelta}rad`);

  // --- the buttons ----------------------------------------------------------
  const hit = (action, type) => {
    const node = document.querySelector(`.touch-btn[data-action="${action}"]`);
    if (!node) { bad(`no on-screen button for ${action}`); return; }
    const r = node.getBoundingClientRect();
    node.dispatchEvent(new PointerEvent(type, {
      pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    }));
  };
  out.buttons = [...document.querySelectorAll('.touch-btn')].map((n) => n.dataset.action);
  // Every button must sit inside the viewport, or it cannot be pressed at all.
  out.offscreen = [...document.querySelectorAll('.touch-btn')].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight;
  }).map((n) => n.dataset.action);
  if (out.offscreen.length) bad(`buttons off the screen: ${out.offscreen}`);

  // Attack.
  g.player.setState('idle', { force: true });
  step(10);
  hit('lightAttack', 'pointerdown');
  step(2);
  hit('lightAttack', 'pointerup');
  step(6);
  out.attackState = g.player.state;
  if (g.player.state !== 'attack') bad(`the attack button left the player in "${g.player.state}"`);
  step(90);

  // Guard is a hold: pressed and not released.
  g.player.setState('idle', { force: true });
  step(10);
  hit('guard', 'pointerdown');
  step(10);
  out.guardState = g.player.state;
  if (g.player.state !== 'guard') bad(`holding guard left the player in "${g.player.state}"`);
  hit('guard', 'pointerup');
  step(10);
  if (g.player.state === 'guard') bad('releasing guard did not drop the guard');

  // Dodge: a tap is a roll.
  g.player.setState('idle', { force: true });
  g.player.stamina = g.player.maxStamina;
  step(10);
  hit('dodge', 'pointerdown');
  step(3);
  hit('dodge', 'pointerup');
  step(8);
  out.dodgeState = g.player.state;
  if (g.player.state !== 'roll' && g.player.state !== 'backstep') {
    bad(`a dodge tap left the player in "${g.player.state}"`);
  }

  // A button press must not also steer the camera.
  step(60);
  const yaw1 = g.camera.yaw;
  hit('lightAttack', 'pointerdown');
  send('pointermove', 40, 40, 9);
  step(4);
  hit('lightAttack', 'pointerup');
  if (Math.abs(g.camera.yaw - yaw1) > 0.01) bad('a button press dragged the camera with it');

  g.loop.start();
  return out;
})()
