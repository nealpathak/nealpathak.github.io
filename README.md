# SLIPSTREAM

A 3D canyon time trial that rebuilds itself every day, running entirely on GitHub Pages.

**Play: https://nealpathak.github.io**

![Slipstream — threading a gate past a rock spire at 223 km/h](docs/screenshot.png)

Fly a skimmer down a procedurally generated canyon. The hook is the **slipstream**:
flying close to rock charges your boost, so speed has to be bought with risk. Thread
every gate, race the ghost of your own best run, and try to beat it before the course
reseeds at midnight UTC.

## The daily course

The course is generated from a hash of the UTC date, so everyone flying on a given day
gets exactly the same canyon, gates, weather and light. Your best time and a replay
ghost are stored in `localStorage` per day.

- `/` — today's course
- `/?seed=anything` — a shareable named course
- **Random course** on the title screen for a throwaway run

## Controls

| | Desktop | Touch |
|---|---|---|
| Steer | `A`/`D` or `←`/`→` | drag anywhere |
| Pitch | `W`/`S` or `↑`/`↓` | drag anywhere |
| Airbrake | `Space` / `Shift` | second finger |
| Restart | `R` | — |

The airbrake tightens your turn radius. Braking into a bend to hug the inside wall is
the fastest line, and the one most likely to end in rock.

## How it is built

No dependencies, no build step, no CDN, no assets. Everything is plain ES modules and a
hand-written WebGL2 renderer, which is what makes it deployable as static files.

```
index.html          page shell, HUD and overlays
src/core/           math, WebGL helpers, input, seeded RNG, storage
src/world/          noise, the analytic canyon, chunked terrain streaming
src/game/           flight model, run state, ghost record/replay
src/render/         shaders, renderer, palettes, procedural meshes
src/audio/          synthesised engine, wind and cues
```

A few things worth knowing if you want to poke at it:

- **The canyon is a function, not a mesh.** `Course.height(x, z)` is the single source of
  truth for both the render geometry and collision, so nothing can drift out of sync.
  Terrain streams as 64 m chunks whose vertex rows follow the canyon centreline, which is
  what makes neighbouring chunks seamless.
- **Physics runs on a fixed 1/120 s step**, so a run is identical at 60 Hz and 144 Hz and
  ghosts stay comparable.
- **Flat shading comes from screen-space derivatives** rather than stored normals — the
  faceting is deliberate and the vertex format stays at 16 bytes.
- `window.__slipstream` is a live debug handle to the running game.

## Local development

```sh
npx http-server -p 8123 .    # any static server works
open http://127.0.0.1:8123
```

Requires WebGL2 (every current browser).

## Licence

MIT — see [LICENSE](LICENSE).
