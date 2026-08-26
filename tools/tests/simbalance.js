(() => {
  // A bot that plays the game through the real input layer, so what it
  // exercises is what a person would. It is deliberately "competent, not
  // expert": it rolls when it sees a wind-up, attacks in the recovery window,
  // heals when hurt and has room, and does not frame-perfect anything.
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};

  const held = new Set();
  const press = (a) => { if (!held.has(a)) { held.add(a); input._press(a); } };
  const release = (a) => { if (held.has(a)) { held.delete(a); input._release(a); } };
  const releaseAll = () => { for (const a of [...held]) release(a); };
  const tap = (a) => { press(a); setTimeout(() => {}, 0); queue.push(() => release(a)); };
  const queue = [];

  const stats = {
    frames: 0, damageDealt: 0, damageTaken: 0, deaths: 0, kills: 0,
    rolls: 0, attacks: 0, heals: 0, blocked: 0, parries: 0, staggersLanded: 0,
  };
  window.emberwake.bus.on('combat:hit', ({ defender, attacker, report }) => {
    if (attacker === g.player) { stats.damageDealt += report.damage; if (report.staggered) stats.staggersLanded++; }
    if (defender === g.player) { stats.damageTaken += report.damage; if (report.blocked) stats.blocked++; }
  });
  window.emberwake.bus.on('combat:parried', ({ defender }) => { if (defender === g.player) stats.parries++; });
  window.emberwake.bus.on('enemy:died', () => stats.kills++);
  window.emberwake.bus.on('player:died', () => stats.deaths++);

  const p = g.player;
  const nearestEnemy = (range = 30) => {
    let best = null, bestD = range;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(p.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  // Anything close enough that its swing could reach us. A real player punishes
  // one enemy while another is still winding up, so this only counts threats
  // inside actual striking distance rather than anything vaguely nearby —
  // otherwise the bot freezes the moment there are three enemies on screen.
  const threat = () => {
    let worst = null;
    for (const e of g.enemies) {
      if (!e.alive || !e.aggro) continue;
      const d = e.position.distanceTo(p.position);
      // A caster winding up at eight metres is not something you roll out of.
      // Only melee attacks count here; projectiles are handled separately.
      if (e.currentAttack?.projectile) continue;
      const reach = Math.min(e.preferredRange ?? 2, 3.2) + 1.4;
      if (d > reach) continue;
      const imminent = e.state === 'attack' || (e.state === 'windup' && e.stateTime > 0.14);
      if (!imminent) continue;
      if (!worst || d < worst.d) worst = { e, d, imminent: true };
    }
    return worst;
  };

  // A projectile close enough and closing fast enough to be worth dodging.
  const incoming = () => {
    for (const pr of g.fx.projectiles) {
      if (pr.owner === p || pr.owner?.faction === 'player') continue;
      const d = pr.mesh.position.distanceTo(p.position);
      if (d > 4.5) continue;
      const toward = pr.velocity.clone().normalize().dot(
        p.position.clone().sub(pr.mesh.position).normalize(),
      );
      if (toward > 0.72) return { d };
    }
    return null;
  };

  let rollCooldown = 0;
  let attackCooldown = 0;
  let healCooldown = 0;

  function botTick() {
    while (queue.length) queue.shift()();
    if (!p.alive) { releaseAll(); return; }
    rollCooldown = Math.max(0, rollCooldown - STEP);
    attackCooldown = Math.max(0, attackCooldown - STEP);
    healCooldown = Math.max(0, healCooldown - STEP);

    const target = nearestEnemy();
    const t = threat();

    // Aim the camera at whatever we are dealing with; movement is camera-relative.
    if (target) {
      const yaw = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
      g.camera.yaw = yaw + Math.PI;
      if (!g.lockOn.target) g.lockOn.set(target);
    }

    // 1. Heal when hurt and nothing is mid-swing. A real player drinks in a
    // gap, not only when the field is clear.
    if (p.healthFraction < 0.4 && p.flask.charges > 0 && !t && healCooldown <= 0) {
      releaseAll(); tap('heal'); stats.heals++; healCooldown = 1.6; return;
    }

    // 2. Roll out of an incoming melee swing, or sideways out of a bolt.
    const bolt = incoming();
    if ((t?.imminent || bolt) && rollCooldown <= 0 && p.stamina > 12) {
      releaseAll();
      if (bolt) { input.move.x = 1; input.move.y = 0; }   // sidestep the line
      else { input.move.x = 0; input.move.y = -1; }
      tap('dodge');
      rollCooldown = 0.75; stats.rolls++;
      return;
    }

    if (!target) { releaseAll(); input.move.x = 0; input.move.y = 0; return; }

    const dist = target.position.distanceTo(p.position);

    // 3. Close, or back off if too close for the swing to land well.
    if (dist > 2.1) { input.move.x = 0; input.move.y = 1; }
    else if (dist < 1.2) { input.move.x = 0; input.move.y = -1; }
    else { input.move.x = 0.6; input.move.y = 0; }   // circle

    // 4. Attack in the enemy's recovery, with stamina in reserve for a roll.
    // Swing in the enemy's recovery, keeping roughly one roll in reserve.
    const safeToSwing = !t && dist <= 2.3 && p.stamina > 30
      && (target.state === 'recover' || target.state === 'hit' || target.state === 'stagger'
          || target.state === 'strafe' || target.state === 'approach' || target.state === 'guard');
    if (safeToSwing && attackCooldown <= 0) {
      tap(target.state === 'stagger' ? 'heavyAttack' : 'lightAttack');
      attackCooldown = 0.4; stats.attacks++;
    }
  }

  // The input layer recomputes move from held keys each update, so re-assert
  // the bot's analog stick after it runs.
  const origUpdate = input.update.bind(input);
  let wantMove = { x: 0, y: 0 };
  input.update = (dt) => {
    origUpdate(dt);
    input.move.x = wantMove.x; input.move.y = wantMove.y;
  };

  const step = (n) => {
    for (let i = 0; i < n; i++) {
      botTick();
      wantMove = { x: input.move.x, y: input.move.y };
      input.update(STEP);
      g.fixedUpdate(STEP);
      g.update(STEP, 0, STEP);
      stats.frames++;
    }
  };

  const out = { encounters: [] };

  // --- encounter by encounter, from a rested start ---
  const encounters = [
    { name: '1 husk', spawn: [['husk', 1, 1]] },
    { name: '2 husks', spawn: [['husk', 2, 1]] },
    { name: '3 houndlings', spawn: [['houndling', 3, 1]] },
    { name: 'husk + shield warden', spawn: [['husk', 1, 2], ['shieldHusk', 1, 2]] },
    { name: 'priest + 2 husks', spawn: [['emberPriest', 1, 2], ['husk', 2, 2]] },
  ];

  const { ENEMIES } = window.__enemyData ?? {};
  for (const enc of encounters) {
    // Clear the field, then place exactly this encounter in front of a rested player.
    for (const e of [...g.enemies]) g.removeActor(e);
    g.enemies.length = 0;
    for (const a of [...g.allies]) g._removeAlly(a);   // solo, so the numbers are about the player
    p.health = p.maxHealth; p.stamina = p.maxStamina; p.flask.charges = p.flask.max;
    p.setPosition(0, g.zone.terrain.heightAt(0, 40), 40);
    p.setState('idle', { force: true });
    g.lockOn.clear();

    const before = { ...stats };
    const made = g.spawnEncounter(enc.spawn, 0, 46);
    step(6);
    for (const e of made) e.provoke(p);

    let frames = 0;
    while (frames < 60 * 150 && p.alive && g.enemies.some((e) => e.alive)) { step(10); frames += 10; }

    out.encounters.push({
      name: enc.name,
      survived: p.alive,
      seconds: +(frames / 60).toFixed(1),
      hpLeft: p.alive ? Math.round((p.health / p.maxHealth) * 100) + '%' : '0%',
      flasksUsed: p.flask.max - p.flask.charges,
      dealt: Math.round(stats.damageDealt - before.damageDealt),
      taken: Math.round(stats.damageTaken - before.damageTaken),
      rolls: stats.rolls - before.rolls,
      attacks: stats.attacks - before.attacks,
      cleared: !g.enemies.some((e) => e.alive),
      dps: +((stats.damageDealt - before.damageDealt) / Math.max(1, frames / 60)).toFixed(1),
      incoming: +((stats.damageTaken - before.damageTaken) / Math.max(1, frames / 60)).toFixed(1),
    });
    if (!p.alive) { p.respawn(new (window.emberwake.THREE.Vector3)(0, g.zone.terrain.heightAt(0, 40), 40), 0); }
  }

  // --- the boss, solo, at the level a player would plausibly arrive at ---
  for (const e of [...g.enemies]) g.removeActor(e);
  g.enemies.length = 0;
  for (const a of [...g.allies]) g._removeAlly(a);
  g.bossDefeated = false;
  g.boss = null;
  g._spawnBoss();
  const boss = g.boss;
  if (boss) {
    // Four levels in Vigour and a sharper weapon: roughly where the zone leaves you.
    for (let i = 0; i < 4; i++) { p.cinders = 99999; g.progression.levelUp('vigour'); }
    for (let i = 0; i < 3; i++) { p.cinders = 99999; g.progression.levelUp('strength'); }
    p.cinders = 0;
    p.health = p.maxHealth; p.stamina = p.maxStamina; p.flask.charges = p.flask.max;
    const c = boss.arena.centre;
    p.setPosition(c.x + 8, g.zone.terrain.heightAt(c.x + 8, c.z), c.z);
    p.setState('idle', { force: true });
    g.lockOn.clear();
    const before = { ...stats };
    step(10);
    boss.engage(p);

    let frames = 0;
    while (frames < 60 * 300 && p.alive && boss.alive) { step(10); frames += 10; }
    out.boss = {
      name: boss.name,
      killed: !boss.alive,
      survived: p.alive,
      seconds: +(frames / 60).toFixed(1),
      bossHpLeft: Math.round((boss.health / boss.maxHealth) * 100) + '%',
      playerHpLeft: p.alive ? Math.round((p.health / p.maxHealth) * 100) + '%' : '0%',
      phaseReached: boss.phase,
      flasksUsed: p.flask.max - p.flask.charges,
      dealt: Math.round(stats.damageDealt - before.damageDealt),
      taken: Math.round(stats.damageTaken - before.damageTaken),
      rolls: stats.rolls - before.rolls,
      attacks: stats.attacks - before.attacks,
      playerLevel: p.stats.level,
    };
  }

  out.totals = stats;
  g.loop.start();
  return out;
})()
