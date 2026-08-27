(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop();
  g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const tap = (a, f = 4) => { input._press(a); step(f); input._release(a); };

  // Isolate one enemy: everything else is removed from the fight entirely.
  const dummy = g.enemies[0];
  for (const e of g.enemies) if (e !== dummy) { e.alive = false; e.think = () => {}; e.hitbox.close(); }
  const place = (dist) => {
    const yaw = Math.atan2(dummy.position.x - g.player.position.x, dummy.position.z - g.player.position.z);
    g.player.setPosition(dummy.position.x - Math.sin(yaw) * dist, dummy.position.y, dummy.position.z - Math.cos(yaw) * dist);
    g.player.yaw = g.player.targetYaw = yaw;
    g.player.velocity.set(0, 0, 0);
  };
  const passive = () => { dummy.think = function () { this.requestMove(0, 0, 0); this.aggro = false; }; };
  passive();
  dummy.alive = true;
  g.lockOn.set(dummy);
  const out = {};

  // --- reach: how far away can a light attack still connect? ---
  out.reach = [];
  for (const d of [1.2, 1.6, 2.0, 2.4, 2.8]) {
    dummy.health = dummy.maxHealth;
    place(d);
    tap('lightAttack'); step(70);
    out.reach.push({ dist: d, hit: dummy.health < dummy.maxHealth, dmg: Math.round(dummy.maxHealth - dummy.health) });
    g.player.chain.index = 0;
  }

  // --- heavy ---
  dummy.health = dummy.maxHealth; dummy.poise = dummy.maxPoise;
  place(1.7);
  tap('heavyAttack'); step(100);
  out.heavy = { dmg: Math.round(dummy.maxHealth - dummy.health), enemyState: dummy.state, poise: Math.round(dummy.poise) };

  // --- combo chain: three swings inside the combo window ---
  dummy.health = dummy.maxHealth;
  place(1.6);
  const clips = [];
  for (let i = 0; i < 3; i++) {
    tap('lightAttack', 3);
    step(26);
    clips.push(g.player.character.base.cur.motion?.name ?? null);
  }
  step(60);
  out.combo = { clips, dmg: Math.round(dummy.maxHealth - dummy.health), stamina: Math.round(g.player.stamina) };

  // --- roll from idle ---
  g.player.setState('idle', { force: true });
  g.player.stamina = g.player.maxStamina;
  step(10);
  const rollFrom = g.player.position.clone();
  input._press('moveF'); step(6);
  input._press('dodge'); step(3); input._release('dodge');
  let iframes = 0, sawRoll = false;
  for (let i = 0; i < 60; i++) { step(1); if (g.player.invulnerable > 0) iframes++; if (g.player.state === 'roll') sawRoll = true; }
  input._release('moveF'); step(20);
  out.roll = {
    entered: sawRoll,
    distance: +rollFrom.distanceTo(g.player.position).toFixed(2),
    iframeFrames: iframes,
    staminaSpent: Math.round(g.player.maxStamina - g.player.stamina),
  };

  // --- guard soaks a hit; parry opens a window ---
  place(1.6);
  g.player.setState('idle', { force: true });
  g.player.health = g.player.maxHealth;
  g.player.stamina = g.player.maxStamina;
  input._press('guard'); step(20);
  const guardState = g.player.state;
  // Have the dummy swing at us.
  dummy.think = function () { this.requestMove(0, 0, 0); this.aggro = true; this.target = g.player; };
  step(160);
  input._release('guard');
  out.guard = {
    entered: guardState, hpLost: Math.round(g.player.maxHealth - g.player.health),
    staminaLeft: Math.round(g.player.stamina), guarding: g.player.isGuarding,
  };

  passive();
  g.player.setState('idle', { force: true });
  g.player.health = g.player.maxHealth;
  step(10);
  tap('parry', 3);
  let parryFrames = 0;
  for (let i = 0; i < 50; i++) { step(1); if (g.player.parryWindow > 0) parryFrames++; }
  out.parry = { windowFrames: parryFrames, state: g.player.state };

  // --- killing blow and the cinders it pays ---
  const cindersBefore = g.player.cinders;
  dummy.health = 40;
  place(1.5);
  g.player.setState('idle', { force: true });
  tap('lightAttack'); step(90);
  out.kill = {
    alive: dummy.alive, state: dummy.state,
    cindersGained: g.player.cinders - cindersBefore,
  };

  g.loop.start();
  return out;
})()
