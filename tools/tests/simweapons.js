(() => {
  // Same bot, same fight, one weapon at a time. Classes should feel different
  // in the numbers — greatswords slow and staggering, spears fast and poor at
  // breaking poise — but every one of them has to be viable.
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};

  const held = new Set();
  const queue = [];
  const press = (a) => { if (!held.has(a)) { held.add(a); input._press(a); } };
  const release = (a) => { if (held.has(a)) { held.delete(a); input._release(a); } };
  const releaseAll = () => { for (const a of [...held]) release(a); };
  const tap = (a) => { press(a); queue.push(() => release(a)); };

  const p = g.player;
  let rollCd = 0, atkCd = 0;
  let wantMove = { x: 0, y: 0 };

  const threat = () => {
    for (const e of g.enemies) {
      if (!e.alive || !e.aggro || e.currentAttack?.projectile) continue;
      const d = e.position.distanceTo(p.position);
      if (d > Math.min(e.preferredRange ?? 2, 3.2) + 1.4) continue;
      if (e.state === 'attack' || (e.state === 'windup' && e.stateTime > 0.14)) return { e, d };
    }
    return null;
  };
  const nearest = () => {
    let best = null, bd = 30;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(p.position);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  function tick() {
    while (queue.length) queue.shift()();
    if (!p.alive) { releaseAll(); return; }
    rollCd = Math.max(0, rollCd - STEP);
    atkCd = Math.max(0, atkCd - STEP);
    const target = nearest();
    const t = threat();
    if (target) {
      const yaw = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
      g.camera.yaw = yaw + Math.PI;
      if (!g.lockOn.target) g.lockOn.set(target);
    }
    if (t && rollCd <= 0 && p.stamina > 12) {
      releaseAll(); input.move.x = 0; input.move.y = -1; tap('dodge'); rollCd = 0.75; return;
    }
    if (!target) { releaseAll(); input.move.x = 0; input.move.y = 0; return; }
    const dist = target.position.distanceTo(p.position);
    const reach = (p.weapon?.userData?.reach ?? 1.2) + 0.9;
    if (dist > reach) { input.move.x = 0; input.move.y = 1; }
    // Back off to a fixed personal space, not a fraction of reach: scaling it
    // with the weapon walks a spear user straight inside their own point.
    else if (dist < Math.max(1.15, reach * 0.38)) { input.move.x = 0; input.move.y = -1; }
    else { input.move.x = 0.6; input.move.y = 0; }
    const cost = p.moveset.cost.light;
    if (!t && dist <= reach && p.stamina > cost + 22 && atkCd <= 0
        && ['recover', 'hit', 'stagger', 'strafe', 'approach', 'guard'].includes(target.state)) {
      tap('lightAttack'); atkCd = 0.4;
    }
  }

  const origUpdate = input.update.bind(input);
  input.update = (dt) => { origUpdate(dt); input.move.x = wantMove.x; input.move.y = wantMove.y; };
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      tick(); wantMove = { x: input.move.x, y: input.move.y };
      input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP);
    }
  };

  const weapons = ['longsword', 'emberbrand', 'valeGreatsword', 'choirSpear', 'kindleStaff'];
  const out = { weapons: [] };

  for (const id of weapons) {
    for (const e of [...g.enemies]) g.removeActor(e);
    g.enemies.length = 0;
    for (const a of [...g.allies]) g._removeAlly(a);
    g.inventory.equip('weapon', id);
    p.health = p.maxHealth; p.stamina = p.maxStamina; p.flask.charges = p.flask.max;
    p.setPosition(0, g.zone.terrain.heightAt(0, 40), 40);
    p.setState('idle', { force: true });
    g.lockOn.clear();

    let dealt = 0, taken = 0, staggers = 0, swings = 0;
    const off = [
      window.emberwake.bus.on('combat:hit', ({ defender, attacker, report }) => {
        if (attacker === p) { dealt += report.damage; if (report.staggered) staggers++; }
        if (defender === p) taken += report.damage;
      }),
      window.emberwake.bus.on('player:swing', () => swings++),
    ];

    const made = g.spawnEncounter([['husk', 2, 1]], 0, 46);
    step(6);
    for (const e of made) e.provoke(p);
    let frames = 0;
    while (frames < 60 * 70 && p.alive && g.enemies.some((e) => e.alive)) { step(10); frames += 10; }
    for (const o of off) o();

    const ms = p.moveset;
    out.weapons.push({
      weapon: id,
      class: p.weapon?.userData?.class ?? '?',
      cleared: !g.enemies.some((e) => e.alive),
      seconds: +(frames / 60).toFixed(1),
      hpLeft: p.alive ? Math.round((p.health / p.maxHealth) * 100) + '%' : '0%',
      swings,
      dealt: Math.round(dealt),
      taken: Math.round(taken),
      perSwing: swings ? Math.round(dealt / swings) : 0,
      staggers,
      chainSpeed: ms.speed,
      lightCost: ms.cost.light,
      poiseMult: ms.poise,
      reach: p.weapon?.userData?.reach ?? null,
    });
    if (!p.alive) p.respawn(new (window.emberwake.THREE.Vector3)(0, g.zone.terrain.heightAt(0, 40), 40), 0);
  }
  g.inventory.equip('weapon', 'longsword');
  g.loop.start();
  return out;
})()
