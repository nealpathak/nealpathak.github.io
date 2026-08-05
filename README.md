# A Living World

A small planet that grows a little every day.

**[nealpathak.github.io](https://nealpathak.github.io)**

There's nothing to play. A sun and a moon go round, the sea moves, and the
creatures that live there walk about their business. Drag to turn it, scroll to
zoom. The chronicle in the corner records everything that has happened to the
world so far.

It started on 5 August 2026 as bare rock and water, and it gets one change
every day. Milestone days are kept frozen under `archive/` and are still
runnable — open one from the chronicle panel and you're looking at the world
exactly as it was, not a screenshot of it.

## How it works

No build step and no dependencies to install — it's plain ES modules with
three.js vendored into the repo. Open `index.html` through any static server:

```bash
python -m http.server 8080 --bind 127.0.0.1
```

The world is deterministic. Every random decision comes from a seeded generator,
so the continents are the same for everyone, on every visit. What persists
between days lives in `world/state.json`; what changed lives in
`world/chronicle.json` and in the git history.

`window.world` in the browser console exposes the scene, the terrain function,
and a `step(dt)` you can use to fast-forward time.

## Layout

| Path | What's in it |
| --- | --- |
| `src/core/` | Seeded randomness, noise and the terrain function, the clock |
| `src/world/` | Planet, ocean, sky, flora |
| `src/life/` | Creatures |
| `src/ui/` | Camera, HUD, chronicle panel |
| `world/` | The save file and the history |
| `archive/` | Frozen milestone worlds you can still visit |
| `docs/ROADMAP.md` | Where it's going |

Built with [three.js](https://threejs.org) (MIT).
