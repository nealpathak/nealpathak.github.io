(() => {
  const { game: g, engine } = window.emberwake;
  const input = engine.input;
  const T = window.emberwake.THREE;
  const STEP = 1 / 60;
  g.loop.stop(); g.engine.post.render = () => {};
  const step = (n) => { for (let i = 0; i < n; i++) { input.update(STEP); g.fixedUpdate(STEP); g.update(STEP, 0, STEP); } };

  // Nothing should interrupt the walk.
  for (const e of g.enemies) { e.alive = false; e.think = () => {}; }
  const out = { legs: [], stuck: [], sunk: [], flew: [] };

  // The authored road, start to the boss arena.
  const route = [
    [2, 96], [0, 74], [-8, 54], [-20, 30], [-22, 8], [-12, -10], [0, -28], [6, -44], [6, -52],
  ];
  g.player.setPosition(route[0][0], g.zone.terrain.heightAt(route[0][0], route[0][1]), route[0][1]);
  step(20);

  const walkTo = (tx, tz, budgetFrames) => {
    let frames = 0;
    let lastProgress = Infinity;
    let stalled = 0;
    while (frames < budgetFrames) {
      const dx = tx - g.player.position.x, dz = tz - g.player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.6) break;
      // Steer by writing the analog stick directly, in camera space.
      const yaw = Math.atan2(dx, dz);
      g.camera.yaw = yaw + Math.PI;
      input.move.x = 0; input.move.y = 1;
      input.update = ((orig) => function (dt) { orig.call(this, dt); this.move.x = 0; this.move.y = 1; })(input.update);
      step(1);
      frames++;
      if (dist > lastProgress - 0.002) stalled++; else stalled = 0;
      lastProgress = Math.min(lastProgress, dist);
      if (stalled > 180) return { frames, dist, stalled: true };
      const ground = g.zone.terrain.heightAt(g.player.position.x, g.player.position.z);
      if (g.player.position.y < ground - 1.2) return { frames, dist, sunk: true, y: +g.player.position.y.toFixed(2), ground: +ground.toFixed(2) };
      if (g.player.position.y > ground + 8) return { frames, dist, flew: true, y: +g.player.position.y.toFixed(2) };
    }
    return { frames, dist: +Math.hypot(tx - g.player.position.x, tz - g.player.position.z).toFixed(2) };
  };

  for (let i = 1; i < route.length; i++) {
    const [tx, tz] = route[i];
    const r = walkTo(tx, tz, 900);
    out.legs.push({ to: [tx, tz], frames: r.frames, dist: r.dist, ...(r.stalled ? { STUCK: true } : {}), ...(r.sunk ? { SUNK: r } : {}), ...(r.flew ? { FLEW: r } : {}) });
    if (r.stalled) out.stuck.push(i);
    if (r.sunk) out.sunk.push(i);
    if (r.flew) out.flew.push(i);
  }

  out.arrived = {
    pos: g.player.position.toArray().map(v => +v.toFixed(1)),
    grounded: g.player.grounded,
    inArena: g.boss ? +g.player.position.distanceTo(g.boss.arena.centre).toFixed(1) : null,
  };

  // The heightfield edge must not be walkable off.
  const half = g.zone.terrain.size / 2;
  g.player.setPosition(0, g.zone.terrain.heightAt(0, half - 6), half - 6);
  step(10);
  const before = g.player.position.z;
  const r2 = walkTo(0, half + 40, 600);
  out.boundary = { from: +before.toFixed(1), to: +g.player.position.z.toFixed(1), limit: +half.toFixed(1), heldIn: g.player.position.z < half };
  void r2; void T;
  g.loop.start();
  return out;
})()
