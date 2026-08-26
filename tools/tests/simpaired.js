(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const tap = (a, f = 4) => { input._press(a); step(f); input._release(a); };
  const out = {};

  g.recruit('seryn');
  step(6);
  const seryn = g.allies.find(a => a.companionId === 'seryn');
  out.beforeBond = { rank: seryn.bondRank.id, ready: g.covenant.pairedReady };

  seryn.bond = 800;                     // rank A
  out.afterBond = { rank: seryn.bondRank.id, partners: g.covenant.pairedPartners().length, ready: g.covenant.pairedReady };

  const foe = g.enemies.find(e => e.alive && e.archetype.id === 'husk');
  const yaw = Math.atan2(foe.position.x - g.player.position.x, foe.position.z - g.player.position.z);
  g.player.setPosition(foe.position.x - Math.sin(yaw) * 1.6, foe.position.y, foe.position.z - Math.cos(yaw) * 1.6);
  g.player.yaw = g.player.targetYaw = yaw;
  seryn.setPosition(g.player.position.x + 1.4, g.player.position.y, g.player.position.z);
  g.lockOn.set(foe);
  foe.think = function () { this.requestMove(0, 0, 0); };
  step(6);

  // Ordinary swing, for a baseline.
  foe.health = foe.maxHealth;
  tap('lightAttack'); step(80);
  out.plainSwing = Math.round(foe.maxHealth - foe.health);

  // Call the strike, then swing.
  foe.health = foe.maxHealth;
  g.player.setState('idle', { force: true });
  step(6);
  tap('command', 3); step(4);
  out.called = { pending: !!g._pairedPending, cooldown: Math.round(g.covenant.pairedCooldown) };
  tap('lightAttack'); step(100);
  out.pairedSwing = Math.round(foe.maxHealth - foe.health);
  out.partnerState = seryn.state;

  // Cooldown blocks a second call, and C falls back to cycling orders.
  const tacticsBefore = g.covenant.tactics;
  tap('command', 3); step(4);
  out.secondCall = { pending: !!g._pairedPending, tacticsChanged: g.covenant.tactics !== tacticsBefore };
  g.loop.start();
  return out;
})()
