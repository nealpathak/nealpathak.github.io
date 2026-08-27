(() => {
  const { game: g, engine } = window.emberwake;
  const info = engine.renderer.gl.info;
  info.autoReset = false;
  info.reset();
  const t0 = performance.now();
  engine.post.render();
  const single = { calls: info.render.calls, tris: info.render.triangles, ms: +(performance.now() - t0).toFixed(1) };
  info.autoReset = true;
  return {
    frame: single,
    programs: info.programs.length,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    sceneObjects: (() => { let n = 0; engine.renderer.scene.traverse(() => n++); return n; })(),
    actors: g.actors.length,
    foliage: g.zone.foliage?.instanceCount ?? 0,
    colliders: g.zone.collision.colliders.length,
  };
})()
