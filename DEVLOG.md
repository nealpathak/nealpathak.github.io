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

---

## Day 1, second pass — 2026-08-29 — rock that reads as rock, and a game that teaches itself

Three things were wrong with the first playable, and all three were things a
player would notice before anything on the backlog.

**The cliffs read as dunes, not rock.** The relief ran at one low frequency, so
every face was a smooth gradient. Added a short-wavelength ridged term at 0.058
(≈17m and 8m octaves — the finest relief a 2m vertex grid can actually carry),
gated on `climb` so the flyable corridor floor stays smooth and collisions stay
fair. In the shader: a second strata frequency for seams inside the broad beds,
and a slope-driven darkening that fakes the occlusion between crags. That last
one does more work than anything else — a pure lambert term leaves faceted rock
looking painted on.

Cost went from 1.64 ms to 2.03 ms per chunk (+24%). Corridor, gates and balance
all unchanged: narrowest free span still 15 m over 33,000 slices, worst gate
aperture still 5.3 m, wall-hugging bot still wins 12/12 by a mean of 3.5 s.

**Nothing taught the slipstream.** The entire game rests on "fly close to rock
to go faster", and a player who never happens to fly low just has a slow, dull
run and leaves. Added `src/ui/coach.js`, which watches what the player is
actually doing: if charge stays under 0.15 for nine seconds it prompts once, and
the first time charge passes 0.6 it says so and never mentions it again
(persisted, so it does not nag a returning player). Also wired `audio.boostReady()`
— it had been written on day 1 and never called — and added a warm edge glow in
the post pass driven by charge and proximity, so the mechanic is felt at the
edges of the frame rather than only shown on a HUD bar.

**The ghost was nearly invisible.** It rendered correctly the whole time — I
confirmed the pose was in frustum at NDC (0.00, −0.06) — but a translucent hull
at alpha 0.38 disappears against pale rock, which makes the only opponent in
the game useless. Added a fresnel rim term to the ship shader (`uRim`, 0 for the
player) so the silhouette edges glow. It now reads on every palette.

**Bugs found and fixed:**

- The coach's `if (learned && praised) return;` sat *above* the message
  countdown, so the final message never got cleared and stuck on screen for the
  rest of the session. Countdown now runs before any early-out.
- The praise could fire off an incidental skim in the first seconds off the
  launch pad. Gated on 3.5 s elapsed.
- Adding `__flags` to the stored blob broke `tools/check-browser.mjs`, which had
  assumed every top-level key was a course record. Hardened.

**Also added:** `tools/check-palettes.mjs`, which freezes the simulation and
re-renders the identical stretch of canyon under all six palettes. Palette work
was previously unverifiable — one seed at a time, different geometry each time —
which is why the pale palettes stayed bad. With the board it took one pass to
see that the real problem was shared across all six and was about rock, not
colour.

**Backlog, re-ordered after this pass:**

1. **No leaderboard.** Times are local-only. A shareable result string (seed +
   time + checksum) would let people compare with no backend.
2. **Gate variety is thin** — gates alternate lateral bias but never demand a
   roll or a vertical squeeze through a slot.
3. **The ship model is very plain**, and the engine trail is a shader term
   rather than geometry or particles.
4. **No attract mode** — the title screen could fly the day's best ghost line.
5. **Palettes are monochromatic.** Each is one hue; a second accent (a mineral
   seam, a differently-lit talus) would add depth.
6. **Floor detail is flat** compared to the walls now, since crag relief is
   deliberately gated off inside the corridor. Some non-colliding visual detail
   (a texture-space term, not geometry) would close the gap.
