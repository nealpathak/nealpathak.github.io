(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const out = {};

  out.noWisp = g.skills.cast();

  // Bind a wisp so there is something to command.
  const t = g.enemies.find(e => e.bindable && e.alive);
  t.health = t.maxHealth * 0.1;
  const r = Math.random; Math.random = () => 0;
  g.covenant.attemptBind(t);
  Math.random = r;
  step(4);
  const w = g.covenant.active;
  w.gainXp(4000);          // learn the whole move list
  g.summonActiveWisp();
  step(10);
  out.wisp = { name: w.name, level: w.level, moves: w.moves.length, summoned: !!w.actor };
  out.available = g.skills.available().map(m => `${m.name}:${m.kind}`);

  // Put a live enemy in range and fire each move in turn.
  const foe = g.enemies.find(e => e.alive && e.archetype.id === 'husk');
  const yaw = Math.atan2(foe.position.x - g.player.position.x, foe.position.z - g.player.position.z);
  g.player.setPosition(foe.position.x - Math.sin(yaw) * 5, foe.position.y, foe.position.z - Math.cos(yaw) * 5);
  g.player.yaw = g.player.targetYaw = yaw;
  w.actor.setPosition(g.player.position.x + 1, g.player.position.y, g.player.position.z);
  g.lockOn.set(foe);
  g.player.focus = g.player.maxFocus;
  step(4);

  out.casts = [];
  for (let i = 0; i < g.skills.available().length; i++) {
    g.skills.selected = i;
    const move = g.skills.available()[i];
    const hpBefore = foe.health;
    const focusBefore = g.player.focus;
    const refused = g.skills.cast();
    step(120);
    out.casts.push({
      move: move.name, kind: move.kind, refused,
      foeDamage: Math.round(hpBefore - foe.health),
      focusSpent: Math.round(focusBefore - g.player.focus),
      onCooldown: +(g.skills.cooldowns.get(move.id) ?? 0).toFixed(1),
    });
  }

  out.focusEmpty = (g.player.focus = 0, g.skills.cast());
  out.bond = g.covenant.active.bond;

  // Party orders cycle on C.
  const before = g.covenant.tactics;
  g._cycleTactics();
  out.tactics = { before, after: g.covenant.tactics, allies: g.allies.map(a => a.tactics.id) };
  g.loop.start();
  return out;
})()
