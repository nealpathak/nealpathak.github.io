# Slipstream — development log

This project ships a change every day. This file is the handover between days:
what exists, why it is built that way, and what is worth doing next.

## How to work on it

```sh
node tools/check-course.mjs      # canyon flyability across 30 daily seeds
node tools/check-balance.mjs     # full-run simulation, risk/reward balance
npx http-server -p 8123 .        # then, in another shell:
node tools/check-browser.mjs     # headless Chromium: shader errors + screenshots
```

`check-course` and `check-balance` are pure Node and run in about a second — use them
after any change to `src/world/` or `src/game/`. `check-browser` needs Playwright and
catches the class of bug the Node tests structurally cannot: shader compile failures,
GL state mistakes and DOM wiring.

**Ground rules learned the hard way:**

- `Course.height(x, z)` backs both the mesh and collision. Change it and re-run
  `check-course` before anything else — a course that generates beautifully can still be
  unflyable.
- Physics is a fixed 1/120 s step. Do not make ship behaviour depend on frame time, or
  ghosts recorded on one machine stop being comparable to runs on another.
- Terrain chunk vertex rows follow the canyon centreline. Any change to chunk extents has
  to keep neighbouring chunks sharing their boundary row exactly, or seams appear.
- Palettes are authored *before* tone mapping. The post pass applies an ACES-ish curve,
  gamma, an S-curve and a saturation lift, so authored colours land noticeably brighter
  than they look in the array.

---

## Day 1 — 2026-08-29 — first playable

Built the whole thing from an empty repository: engine, world, flight model, renderer,
HUD, audio and the daily-seed loop.

**Design.** A canyon time trial where speed is bought with risk. Flying within ~12 m of
rock charges a slipstream boost worth up to 1.8× base speed; flying safely down the middle
of the corridor charges nothing. The course reseeds from the UTC date, so the game itself
refreshes daily and a personal best means something for exactly one day.

**Why no dependencies.** GitHub Pages serves static files and nothing else. A hand-written
WebGL2 renderer with zero npm packages and zero CDN requests means there is no build step
to break, no version drift, and nothing external that can fail to load.

**Measurements taken during the build:**

- Canyon flyability across 30 daily seeds: narrowest free lateral span 15 m over 33,000
  sampled slices, no slice under 12 m, worst gate aperture clearance 5.3 m.
- Risk/reward gradient (holding a fixed altitude above the canyon floor for a full run):

  | altitude | avg charge | avg speed | crashes |
  |---|---|---|---|
  | 25 m | 0.01 | 218 km/h | 1 |
  | 12 m | 0.58 | 309 km/h | 5 |
  | 6 m  | 0.88 | 356 km/h | 5 |
  | 4 m  | 0.85 | 330 km/h | 11 |

  The optimum sits around 6–8 m and over-committing at 4 m costs more in crashes than it
  gains in boost, which is the shape the mechanic wanted.
- A bot that dives toward the floor between gates beats a centre-line bot on 12/12 daily
  courses by a mean of 3.5 s.
- 77,440 triangles visible across 11 streamed chunks, 687 KB of GPU buffers, 576 m of
  view distance.

**Bugs found and fixed while building:**

- `normalize()` called with one argument instead of two — caught only by the headless
  browser run, since nothing in Node touches the renderer.
- Terrain detail noise sampled on XZ only, so it was constant up a vertical cliff face and
  smeared into vertical stripes. Now sampled on a plane that includes Y.
- Shadowed rock — pillars especially — crushed to near-black. Added a fill light from
  opposite the sun so hazards stay readable.
- Gate flare clipped to white and filled the screen when passing through a ring.
- Adaptive resolution only ever went down, so one startup hitch permanently softened the
  image. It now has a warm-up period and recovers.
- The original slipstream band (13 m, decaying at 0.55/s) meant average charge across a
  whole run was ~0.02: the core mechanic effectively never fired. Widened to 18 m with a
  net-positive threshold near 12 m.

**Known rough edges, roughly in the order I would fix them:**

1. **Verdigris and the paler palettes still wash out** near the sun. Palette authoring
   needs a proper contrast check per palette rather than one global curve.
2. **Cliff faces read as soft rather than rocky.** The ridged noise runs at one low
   frequency; a second higher-frequency octave (or triplanar detail) would help, but it
   costs chunk generation time — currently 1.6 ms per chunk.
3. **No leaderboard.** Times are local-only. A shareable result string (seed + time +
   checksum) would let people compare without any backend.
4. **The ship model is very plain** and the engine trail is a shader term rather than
   real geometry or particles.
5. **No replay of the day's best line as an attract mode** on the title screen.
6. **Gate approach variety is limited** — gates alternate lateral bias but never require a
   roll or a vertical squeeze through a slot.
7. **No tutorial.** The slipstream mechanic is explained in one line of text and nothing
   in-game teaches it. A first-run coaching prompt when charge stays at zero would help.
