(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };
  const out = { shrines: g.zone.shrines.map(s => ({ id: s.id, name: s.name, at: [Math.round(s.position.x), Math.round(s.position.z)] })) };

  // Each shrine must be reachable, stand on solid ground, and be interactable.
  out.checks = g.zone.shrines.map((s) => {
    g.player.setPosition(s.position.x + 1.3, g.zone.terrain.heightAt(s.position.x + 1.3, s.position.z), s.position.z);
    step(20);
    const prompt = g.player.interactTarget?.type ?? null;
    const slope = +g.zone.terrain.slopeAt(s.position.x, s.position.z).toFixed(2);
    g.progression.restAt(s);
    return {
      id: s.id, prompt, slope,
      grounded: g.player.grounded,
      lit: s.built.flame.visible,
      respawnedTo: (() => {
        g.player.health = 0; g.player.onDeath(); step(340);
        return +g.player.position.distanceTo(s.position).toFixed(1);
      })(),
    };
  });

  // Companions should speak when the party rests.
  const said = [];
  window.emberwake.bus.on('ui:speech', (p) => said.push(`${p.who}: ${p.text}`));
  g.recruit('seryn');
  step(4);
  for (const a of g.allies) a._lastLine = null;
  g.progression.restAt(g.zone.shrines[0]);
  step(4);
  out.restLines = said;

  const seryn = g.allies.find(a => a.companionId === 'seryn');
  seryn._lastLine = null;
  seryn.bondWith(g.player, 800);
  step(2);
  out.bondLines = said.slice(out.restLines.length);
  g.loop.start();
  return out;
})()
