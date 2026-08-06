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
6. **The chronicle is the universe's diary, not a changelog.** Entries record
   things that happened *in the world* — land rose, a river found the sea, the
   herds moved north. Engineering work never appears there. See below.

---

## Two kinds of change

Keep these strictly separate. Mixing them is how the chronicle turns into a
release note and stops being worth reading.

**World updates** — anything a visitor could notice by looking: new life, new
weather, better light, a shifted season. These bump `day`, get a chronicle
entry, and are what the daily ritual below is for. One per day.

**Infrastructure** — archiving, refactors, build and tooling, docs, performance
work with no visible effect. These do **not** bump `day` and do **not** get a
chronicle entry. Commit them separately, with a plain commit message. They can
happen any time and don't consume the day's world update.

If you're unsure which a change is, ask: would a visitor who can't see the code
notice? If no, it's infrastructure.

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
python .claude/devserver.py 8080
```

There's a `.claude/launch.json` for this. Use it rather than
`python -m http.server`: it sends `no-store`, and a browser reusing cached ES
modules has already caused a day's verification to silently measure the
*previous* day's code and report success. If you ever see a change that should
be obvious having no effect at all, suspect a stale module before you suspect
your logic.

Then, in the browser:

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

## Archiving milestones

Past worlds are kept runnable, not just recoverable, under `archive/day-NNN/`.
Git alone would preserve the code, but nobody can visit a git commit from a
phone — and watching the world change is the entire point of the site.

**Snapshot on milestones**: days 1, 10, 25, 50, 100, 200, 365, then every 100.
Not every day — consecutive days look nearly identical, so daily snapshots would
be clutter that costs repo size and buys nothing.

To take one (this is infrastructure — no day bump, no chronicle entry):

```bash
DAY=010                       # zero-padded to three digits
mkdir -p archive/day-$DAY
git archive HEAD | tar -x -C archive/day-$DAY
cd archive/day-$DAY && rm -rf vendor .claude docs archive CLAUDE.md README.md .gitignore .nojekyll
```

Then, in the snapshot's `index.html`:

- point the importmap at `../../vendor/three-rNNN/three.module.min.js`
- add `<link rel="stylesheet" href="../banner.css" />`
- add `<script src="../banner.js" defer></script>`
- suffix the `<title>` with the day

Finally add an entry to `archive/index.json` (day, date, title, path). The
chronicle panel reads that file, so nothing else needs editing.

**Vendored three.js is versioned by directory** (`vendor/three-r185/`). When
upgrading, add `vendor/three-rNNN/` alongside rather than replacing — every
archived world keeps pointing at the version it was built and tested against,
so an engine upgrade can never silently break the past.

The one part of a snapshot allowed to change afterwards is the shared banner
chrome (`archive/banner.*`), which gives a visitor a way back to the present.
The world inside stays exactly as it shipped.

## How it's put together

```
index.html          canvas, importmap, HUD markup
styles.css
world/state.json    the save file — the world boots from this
world/chronicle.json  dated history, shown in the UI
archive/day-NNN/    frozen milestone worlds, still runnable
archive/index.json  manifest the chronicle panel reads
vendor/three-r185/  pinned three.js r185.1 (two files, must stay together)
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
