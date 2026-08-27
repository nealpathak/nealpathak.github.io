(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const out = {};

  out.startingAllies = g.allies.map(a => a.name);

  // Recruit Seryn and bind a wisp so the full party is in the field.
  g.recruit('seryn');
  const target = g.enemies.find(e => e.bindable && e.alive);
  target.health = target.maxHealth * 0.1;
  const r = Math.random; Math.random = () => 0;
  g.covenant.attemptBind(target);
  Math.random = r;
  step(4);
  out.party = g.allies.map(a => ({ name: a.name, hp: Math.round(a.health), power: a.power, moves: a.moves.length }));

  // Line the party up against a live husk and let them fight it out.
  const foe = g.enemies.find(e => e.alive && e.archetype.id === 'husk');
  const yaw = Math.atan2(foe.position.x - g.player.position.x, foe.position.z - g.player.position.z);
  g.player.setPosition(foe.position.x - Math.sin(yaw) * 6, foe.position.y, foe.position.z - Math.cos(yaw) * 6);
  g.player.yaw = g.player.targetYaw = yaw;
  for (const a of g.allies) { a.setPosition(g.player.position.x + (Math.random() - 0.5) * 2, g.player.position.y, g.player.position.z + (Math.random() - 0.5) * 2); a.target = null; }
  foe.provoke(g.player);
  const foeHp = foe.health;
  const allyStates = new Set();
  let allyAttacked = 0;
  const hookedHits = [];
  for (const a of g.allies) {
    const orig = a.hitbox.test.bind(a.hitbox);
    a.hitbox.test = (l) => { const res = orig(l); if (res) hookedHits.push(a.name); return res; };
  }
  for (let i = 0; i < 900; i++) {
    step(1);
    for (const a of g.allies) { allyStates.add(a.state); if (a.state === 'attack' || a.state === 'cast') allyAttacked++; }
  }
  out.fight = {
    foeHpBefore: Math.round(foeHp), foeHpAfter: Math.round(foe.health), foeAlive: foe.alive,
    allyActionFrames: allyAttacked,
    allyStatesSeen: [...allyStates],
    allyMeleeConnects: hookedHits.length,
    foeTarget: foe.target === g.player ? 'player' : (foe.target?.name ?? null),
    allyHp: g.allies.map(a => `${a.name}:${Math.round(a.health)}`),
    playerHp: Math.round(g.player.health),
  };

  // Bonds should accrue while the party fights together.
  out.bonds = { mote: g.allies.find(a => a.companionId === 'mote')?.bond ?? 0,
                wisp: g.covenant.active?.bond ?? 0,
                tactics: g.covenant.tactics };
  g.covenant.setTactics('guardian');
  out.tacticsApplied = g.allies.map(a => a.tactics.id);
  g.loop.start();
  return out;
})()
