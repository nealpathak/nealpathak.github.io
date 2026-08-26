(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const boss = g.boss;
  if (!boss) return { error: 'no boss' };
  const out = { name: boss.name, hp: boss.maxHealth, phases: boss.phases.length, scale: boss.scale };

  // Outside the arena the boss should not care about you.
  const far = boss.arena.centre.clone();
  g.player.setPosition(far.x + 30, g.zone.terrain.heightAt(far.x + 30, far.z), far.z);
  step(60);
  out.dormant = { engaged: boss.engaged, state: boss.state, aggro: boss.aggro };

  // Step into the arena.
  g.player.setPosition(far.x + 10, g.zone.terrain.heightAt(far.x + 10, far.z), far.z);
  step(30);
  out.engaged = { engaged: boss.engaged, aggro: boss.aggro, state: boss.state };

  // Phase transition at half health.
  boss.health = boss.maxHealth * 0.45;
  step(20);
  out.phase = {
    index: boss.phase, affinity: boss.affinity,
    attacks: boss.attacks.length, invuln: +boss.invulnerable.toFixed(2),
    aura: !!boss._auraLight,
  };
  step(140);

  // Hyper-armour: chip it and it should not flinch out of a wind-up.
  boss.setState('windup', { force: true, clip: 'attackHeavy1' });
  boss.currentAttackBefore = boss.state;
  const T = window.emberwake.THREE;
  const { resolveHit } = { resolveHit: null };
  boss.onFlinch({ damage: 40, attack: { source: g.player } });
  out.hyperArmour = { stateAfterChip: boss.state };

  // Poise break should still stagger it.
  boss.poise = 1;
  boss.onStagger({ attack: { source: g.player } });
  out.poiseBreak = { state: boss.state };

  // Arena leash: drag it to the edge and it should come home.
  boss.setPosition(far.x + boss.arena.radius + 8, g.zone.terrain.heightAt(far.x + boss.arena.radius + 8, far.z), far.z);
  const before = boss.position.distanceTo(boss.arena.centre);
  step(240);
  out.leash = { before: +before.toFixed(1), after: +boss.position.distanceTo(boss.arena.centre).toFixed(1), radius: boss.arena.radius };

  // Kill it: bar should clear, cinders should pay, and a rest must not respawn it.
  const cinders = g.player.cinders;
  boss.health = 0;
  boss.onDeath({ damage: 1 });
  step(10);
  out.death = { alive: boss.alive, defeated: g.bossDefeated, cindersGained: g.player.cinders - cinders };
  g.spawnEnemies();
  out.afterRest = { bossPresent: g.enemies.some(e => e.isBoss) };
  g.loop.start();
  return out;
})()
