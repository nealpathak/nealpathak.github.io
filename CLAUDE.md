# A Living World — working notes

This repository is a single 3D world, published at the root of
`nealpathak.github.io`. It gets **one meaningful change per day**, forever. The
visitor is an observer: they watch, they don't play.

You are almost certainly reading this at the start of a fresh session with no
memory of the previous days. Everything you need is in this repo. Start here,
then read `world/state.json`, `world/chronicle.json`, and `docs/ROADMAP.md`.

---

## Hard rules

These are not preferences. Breaking one is a bug.

1. **The world is public and must never ship broken.** Verify in a browser
   before every commit. A blank canvas on the live site is the worst possible
   outcome — worse than shipping nothing.
2. **Kid-friendly and safe for work**, always. Nature, weather, creatures,
   seasons, building. No violence beyond the gentlest ecology (a creature may
   grow old; nothing is gory). No text a child shouldn't read.
3. **No build step.** No bundler, no transpiler, no `node_modules` in the
   served path. Plain ES modules and an importmap. Anyone can read the source
   by viewing it. This constraint is load-bearing — do not "improve" it away.
4. **It must run on a phone.** Target 60fps. Instance anything numerous. Cap
   pixel ratio at 2. Keep an eye on `renderer.info` after any change that adds
   geometry.
5. **The world is continuous, not regenerated.** All randomness flows from the
   seeded PRNG in `src/core/rng.js`. Never call `Math.random()`. The continents
   a visitor saw yesterday must be there tomorrow.
6. **Every update leaves a chronicle entry.** Growth nobody can perceive is not
   growth.

---

## The daily ritual

1. Read `world/state.json`, `world/chronicle.json`, `docs/ROADMAP.md`.
2. Pick **one** thing. Prefer the top unchecked item on the roadmap; deviate if
   there's a good reason, and if you do, reorder the roadmap to match.
   Ambition should scale with what the world can already support — a day that
   only adds better lighting is a fine day.
3. Implement it. New system → new file under `src/world/`, `src/life/`, or
   `src/systems/`, plus two lines in `src/main.js` (create it, step it).
4. Update `world/state.json`: bump `day`, set `updated`, add to `systems`,
   adjust `life` counts. Bump `version` for anything structural.
5. Append an entry to `world/chronicle.json` (chronological order — append to
   the end; the UI sorts it newest-first). Write it in plain, warm language,
   the way you'd narrate a nature documentary. Not a changelog.
6. Verify (below).
7. Commit and push to `main`. GitHub Pages serves it within a minute or two.

### Verifying

```bash
python -m http.server 8080 --bind 127.0.0.1
```

There's a `.claude/launch.json` for this. Then, in the browser:

- The world renders, is lit, and drifts on its own.
- **Reload twice — the continents must be identical.** The fastest check is to
  hash the geometry via the console handle described below. This is the single
  most likely thing to break silently.
- Watch a full sun cycle (~4 minutes) for popping or discontinuity.
- Creatures stay on the ground and out of the sea.
- Console is clean; no 404s.
- Resize to a 375px-wide viewport: the planet still fits and stays interactive.

`window.world` is a deliberate, shipped inspection handle — `state`, `scene`,
`camera`, `renderer`, `terrain`, `clock`, `sky`, plus `step(dt)` and `render()`.
Use it to fast-forward time without waiting:

```js
for (let i = 0; i < 3600; i++) world.step(1/60);   // one minute of world time
world.render();
```

---

## How it's put together

```
index.html          canvas, importmap, HUD markup
styles.css
world/state.json    the save file — the world boots from this
world/chronicle.json  dated history, shown in the UI
vendor/three/       pinned three.js r185.1 (two files, must stay together)
src/
  core/    rng, noise + terrain, clock, state loading
  world/   planet, ocean, sky, flora
  life/    wanderers
  ui/      camera rig, hud, chronicle panel
  main.js  bootstrap + the single step() that drives everything
```

### The things worth knowing before you change anything

**Terrain is a pure function.** `makeTerrain()` in `src/core/noise.js` returns
`heightAt(unitVector)` — elevation relative to sea level, positive on land. The
planet mesh, tree placement, and creature footing all call it. Never bake
height into the mesh alone, or everything else will float.

**`IcosahedronGeometry(r, detail)` has `20*(detail+1)²` faces**, not `20*4^detail`.
`subdivisions: 40` in state.json is ~34k faces. Getting this wrong once already
produced a 980-triangle planet with staircase coastlines.

**Elevation bands in `src/world/planet.js` are tuned to the current terrain
distribution** (median land ≈0.19, p90 ≈0.60, peaks ≈1.40). If you change
`landHeight` or `seaLevel` in state.json, re-survey the distribution and retune
the bands, or the palette collapses to one colour.

**Creatures walk via a tangent frame.** Each holds a unit position `p` and a
unit heading `t` perpendicular to it; moving forward applies one rigid rotation
to both, so they stay orthonormal to machine precision. Reuse
`stepForward`/`turn` in `src/life/wanderers.js` for any new creature rather
than inventing another movement scheme.

**Each system draws randomness from its own named stream** (`streamFor(seed,
'flora')`). This is why adding a system doesn't move everything else. Give new
systems a new name; never reuse an existing one.

**The camera fits the planet to the narrower field of view.** Portrait phones
have a much tighter horizontal FOV; fitting to the vertical axis crops the
world badly.

---

## Voice

The site says very little, and what it says is calm and concrete. "Land pushed
up out of the water," not "Procedural terrain generation initialised." The
chronicle is the world's diary, not a release note.
