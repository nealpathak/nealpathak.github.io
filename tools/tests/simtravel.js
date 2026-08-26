// Crossing between zones.
//
// The one thing that can go wrong here and not show up anywhere else is state
// that belongs to the old zone surviving into the new one: an actor still
// holding the old collision world, a shrine relit by id in a zone that does not
// have it, a boss counted as felled everywhere. So this walks the round trip
// and checks what came with the player and what did not.
(() => {
  const { game: g, engine } = window.emberwake;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { engine.input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };

  const out = { errors: [] };
  const bad = (m) => out.errors.push(m);

  out.startZone = g.zone.id;
  if (g.zone.id !== 'ashfen') bad(`expected to start in ashfen, got ${g.zone.id}`);

  // Kindle a shrine, take some cinders and a level, so there is state to lose.
  const shrine = g.zone.shrines[0];
  g.progression.restAt(shrine);
  g.player.cinders = 4000;
  g.progression.levelUp('vigour');
  const beforeLevel = g.player.stats.level;
  const beforeCinders = g.player.cinders;
  const beforeAllies = g.allies.length;
  out.gatesInAshfen = g.zone.gates.map((x) => x.id);
  if (!g.zone.gates.length) bad('ashfen has no waygate');

  // Cross.
  const ok = g.travelTo('choir', { arrive: 'gate:choir:mouth' });
  if (!ok) bad('travelTo("choir") refused');
  step(30);
  out.zone = g.zone.id;
  out.name = g.zone.name;
  if (g.zone.id !== 'choir') bad(`did not arrive: zone is ${g.zone.id}`);

  // The player kept what is theirs.
  if (g.player.stats.level !== beforeLevel) bad('level did not survive the crossing');
  if (g.player.cinders !== beforeCinders) bad('cinders did not survive the crossing');
  if (g.allies.length !== beforeAllies) bad(`party size changed: ${beforeAllies} -> ${g.allies.length}`);

  // Everything in the field points at the new world.
  for (const a of g.actors) {
    if (a.world !== g.world) bad(`${a.name} still holds the old world`);
    if (a.world.collision !== g.zone.collision) bad(`${a.name} has a stale collision world`);
  }
  out.actors = g.actors.length;
  out.enemies = g.enemies.length;
  if (!g.enemies.length) bad('the choir spawned no enemies');
  if (!g.boss) bad('the choir spawned no boss');
  out.boss = g.boss?.name;

  // The player is standing on ground, not inside it or above it.
  const groundY = g.zone.terrain.heightAt(g.player.position.x, g.player.position.z);
  out.arrival = [+g.player.position.x.toFixed(1), +g.player.position.y.toFixed(2), +g.player.position.z.toFixed(1)];
  if (Math.abs(g.player.position.y - groundY) > 1.2) bad(`arrived off the ground by ${(g.player.position.y - groundY).toFixed(2)}m`);

  // No shrine from the other zone is alight here.
  out.litHere = g.zone.shrines.filter((s) => s.built.flame.visible).map((s) => s.id);
  if (out.litHere.length) bad(`a choir shrine is lit that should not be: ${out.litHere}`);

  // Wade: the nave should actually be wet, and the aisles dry.
  const probe = (x, z) => {
    g.player.setPosition(x, g.zone.terrain.heightAt(x, z), z);
    step(10);
    return +g.player.submersion.toFixed(2);
  };
  out.wet = { nave: probe(0, 6), aisleW: probe(-21, 8), aisleE: probe(21, -2), chancel: probe(0, -46), causeway: probe(0, 60) };
  if (out.wet.nave < 0.4) bad(`the nave is not flooded: ${out.wet.nave}m`);
  if (out.wet.aisleW > 0.05 || out.wet.aisleE > 0.05) bad(`an aisle is under water: ${JSON.stringify(out.wet)}`);
  if (out.wet.chancel > 0.05) bad(`the chancel is under water: ${out.wet.chancel}m`);
  if (out.wet.causeway > 0.05) bad(`the causeway is under water: ${out.wet.causeway}m`);

  // Aquatic enemies hold the waterline instead of chasing onto dry stone.
  const lurker = g.enemies.find((e) => e.archetype.id === 'tideLurker');
  if (!lurker) bad('no tide lurker spawned');
  else {
    lurker.setPosition(0, g.zone.terrain.heightAt(0, 6), 6);
    g.player.setPosition(-21, g.zone.terrain.heightAt(-21, 8), 8);
    lurker.aggro = true; lurker.target = g.player;
    step(60 * 8);
    out.lurker = { sub: +lurker.submersion.toFixed(2), at: [+lurker.position.x.toFixed(1), +lurker.position.z.toFixed(1)] };
    if (lurker.alive && lurker.submersion <= 0.02) bad(`a lurker walked out of the water to ${out.lurker.at}`);
  }

  // Cross back, and land at the gate we came in by rather than the zone start.
  g.travelTo('ashfen', { arrive: 'gate:ashfen:descent' });
  step(30);
  out.backZone = g.zone.id;
  if (g.zone.id !== 'ashfen') bad('did not get back to ashfen');
  const gate = g.zone.gates[0];
  const d = Math.hypot(g.player.position.x - gate.position.x, g.player.position.z - gate.position.z);
  out.arrivedNearGate = +d.toFixed(2);
  if (d > 5) bad(`came back ${d.toFixed(1)}m from the gate, not at it`);
  // The shrine we lit before leaving is still lit.
  if (!g.zone.shrines[0].built.flame.visible) bad('the shrine we kindled went out while we were away');

  // A save taken in the far zone must reopen there, with the same shrine lit.
  g.travelTo('choir', { arrive: 'gate:choir:mouth' });
  step(20);
  g.progression.restAt(g.zone.shrines[0]);
  const snap = g.progression.snapshot();
  out.savedZone = snap.zone;
  out.savedLit = snap.litShrines.slice().sort();
  if (snap.zone !== 'choir') bad(`snapshot recorded the wrong zone: ${snap.zone}`);
  if (snap.litShrines.length !== 2) bad(`snapshot lost a lit shrine: ${snap.litShrines}`);

  g.travelTo('ashfen', { arrive: 'gate:ashfen:descent' });
  step(20);
  g.progression.restore(snap);
  step(20);
  out.restoredZone = g.zone.id;
  if (g.zone.id !== 'choir') bad(`restore did not reopen in the saved zone: ${g.zone.id}`);
  if (!g.zone.shrines[0].built.flame.visible) bad('restore did not relight the choir shrine');
  if (g.progression.lastShrine?.id !== snap.shrine) {
    bad(`restore lost the last shrine: ${g.progression.lastShrine?.id} != ${snap.shrine}`);
  }

  // And dying here with the last ember here respawns here, not in Ashfen.
  g.progression.respawn();
  step(20);
  out.respawnZone = g.zone.id;
  if (g.zone.id !== 'choir') bad(`respawn moved us out of the choir: ${g.zone.id}`);

  return out;
})()
