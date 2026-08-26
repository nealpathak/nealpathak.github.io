(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const out = {};

  // --- resting at a shrine ---
  const shrine = g.zone.shrines[0];
  const yaw = 0;
  g.player.setPosition(shrine.position.x + 1.2, shrine.position.y, shrine.position.z);
  step(4);
  out.promptFound = g.player.interactTarget?.type ?? null;
  g.player.health = 100;
  g.player.flask.charges = 1;
  g.progression.restAt(shrine);
  out.rest = {
    hp: g.player.health, flask: g.player.flask.charges,
    lit: shrine.built.flame.visible, lastShrine: g.progression.lastShrine === shrine,
  };

  // --- levelling ---
  g.player.cinders = 5000;
  const beforeHp = g.player.maxHealth;
  const cost = g.progression.levelCost();
  const ok = g.progression.levelUp('vigour');
  out.level = {
    applied: ok, cost, level: g.player.stats.level,
    vigour: g.player.stats.vigour,
    maxHpBefore: beforeHp, maxHpAfter: g.player.maxHealth,
    cindersLeft: g.player.cinders,
    canLevelBroke: (g.player.cinders = 0, g.progression.canLevel('vigour')),
  };

  // --- dying drops cinders where you fell ---
  g.player.cinders = 777;
  const deathSpot = g.player.position.clone();
  g.player.health = 0;
  g.player.onDeath();
  step(2);
  out.death = {
    mode: g.mode, cinders: g.player.cinders,
    stain: g.progression.bloodstain
      ? { amount: g.progression.bloodstain.cinders,
          nearDeathSpot: +g.progression.bloodstain.position.distanceTo(deathSpot).toFixed(2) }
      : null,
  };

  // Run the death sequence out to respawn.
  step(340);
  out.afterDeath = {
    mode: g.mode, alive: g.player.alive,
    hp: Math.round(g.player.health), flask: g.player.flask.charges,
    atShrine: +g.player.position.distanceTo(shrine.position).toFixed(2),
    enemiesAlive: g.enemies.filter(e => e.alive).length,
  };

  // --- recovering the stain ---
  const stain = g.progression.bloodstain;
  g.player.setPosition(stain.position.x, g.zone.terrain.heightAt(stain.position.x, stain.position.z), stain.position.z);
  step(4);
  out.stainPrompt = g.player.interactTarget?.type ?? null;
  g.progression.recoverBloodstain();
  out.recovered = { cinders: g.player.cinders, stainGone: !g.progression.bloodstain };

  // --- binding a wisp ---
  const wisp = g.enemies.find(e => e.bindable && e.alive);
  out.bindTarget = wisp ? wisp.name : null;
  if (wisp) {
    out.chanceFull = +g.covenant.bindChance(wisp, 1).toFixed(3);
    wisp.health = wisp.maxHealth * 0.15;
    out.chanceWeak = +g.covenant.bindChance(wisp, 1).toFixed(3);
    out.sigilsBefore = g.inventory.count('emberSigil');
    // Force the roll to succeed so the binding path itself is what is tested.
    const r = Math.random;
    Math.random = () => 0;
    g.covenant.attemptBind(wisp);
    Math.random = r;
    out.bind = {
      wisps: g.covenant.wisps.length,
      name: g.covenant.wisps[0]?.name ?? null,
      level: g.covenant.wisps[0]?.level ?? null,
      active: g.covenant.active?.name ?? null,
      sigilsAfter: g.inventory.count('emberSigil'),
      targetDead: !wisp.alive,
    };
    const w = g.covenant.wisps[0];
    w.gainXp(3000);
    out.wispGrowth = { level: w.level, moves: w.moves.length, id: w.id, name: w.name };
  }

  // --- save round-trip ---
  g.progression.save();
  const snap = g.progression.snapshot();
  out.save = {
    cinders: snap.cinders, level: snap.stats.level,
    wisps: snap.covenant.wisps.length, lit: snap.litShrines.length,
    equipped: snap.inventory.equipped.weapon,
  };
  g.loop.start();
  return out;
})()
