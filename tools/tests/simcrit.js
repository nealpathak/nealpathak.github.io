(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const tap = (a, f = 4) => { input._press(a); step(f); input._release(a); };
  const out = {};

  const foe = g.enemies.find(e => e.alive && e.archetype.id === 'husk');
  for (const e of g.enemies) if (e !== foe) { e.alive = false; e.think = () => {}; }
  // behind=true puts the player at the foe's back, facing its spine.
  const place = (behind) => {
    const s = behind ? -1 : 1;
    g.player.setPosition(
      foe.position.x + Math.sin(foe.yaw) * 1.2 * s, foe.position.y,
      foe.position.z + Math.cos(foe.yaw) * 1.2 * s);
    g.player.yaw = g.player.targetYaw = foe.yaw + (behind ? 0 : Math.PI);
    g.player.velocity.set(0, 0, 0);
    g.player.setState('idle', { force: true });
  };

  // --- backstab on an unaware enemy ---
  foe.aggro = false; foe.target = null; foe.think = function () { this.requestMove(0, 0, 0); };
  foe.health = foe.maxHealth;
  place(true);
  step(4);
  tap('interact', 3);
  step(6);
  out.backstab = { state: g.player.state, entered: g.player.state === 'riposte',
    dot: (() => { const dx = g.player.position.x - foe.position.x, dz = g.player.position.z - foe.position.z;
      const d = Math.hypot(dx, dz); return +(((dx * Math.sin(foe.yaw) + dz * Math.cos(foe.yaw)) / d)).toFixed(2); })(),
    dist: +g.player.position.distanceTo(foe.position).toFixed(2),
    interactTarget: g.player.interactTarget?.type ?? null };
  step(90);
  out.backstabDamage = Math.round(foe.maxHealth - foe.health);

  // --- parry then riposte ---
  const { resolveHit } = window.emberwake;
  foe.health = foe.maxHealth;
  foe.aggro = true; foe.target = g.player;
  place(false);
  step(4);
  tap('parry', 3);
  let parried = null;
  for (let i = 0; i < 40 && !parried; i++) {
    step(1);
    if (g.player.parryWindow > 0) {
      parried = resolveHit(g.player, {
        source: foe, damage: 40, poiseDamage: 10, affinity: 'ember',
        point: g.player.position.clone(),
      });
    }
  }
  out.parry = {
    result: parried?.result ?? null,
    window: !!g._riposteWindow,
    foeState: foe.state,
    hp: Math.round(g.player.health),
  };
  step(4);
  if (g._riposteWindow) {
    tap('interact', 3);
    step(6);
    out.riposteEntered = g.player.state === 'riposte';
    step(120);
    out.riposteDamage = Math.round(foe.maxHealth - foe.health);
  }
  g.loop.start();
  return out;
})()
