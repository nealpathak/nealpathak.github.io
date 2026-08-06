# Roadmap

An ordered backlog so the world grows in a consistent direction instead of
drifting with whatever seems fun on a given morning. Roughly ordered by "what
makes the world feel most alive next", with cheap wins early.

Take the top unchecked item unless there's a good reason not to. If you deviate,
reorder this file so it stays honest. Add new ideas freely — this list should
get longer, not shorter.

## Near term — make the world feel inhabited

- [x] Trees sway slightly; foliage colour varies by latitude and altitude — done
      day 2, along with ice caps, sea ice and a climate-driven tree line
- [x] Clouds — a thin shell of drifting low-poly puffs casting no shadow yet —
      done day 3, with the deck shearing (equator drifts ~2x faster than poles)
- [x] Cloud shadows on the ground — done day 4, projected analytically along the
      sun ray rather than with a shadow map
- [x] Creatures rest at night and are livelier at midday — done day 5; the
      day/night cycle is now something the world experiences, not just lighting
- [x] Creatures gather to sleep rather than settling wherever they stand — done
      day 6; nearest-neighbour spacing tightens ~32% from midday to dusk
- [ ] Grass and small shrubs on the plains; rocks and scree above the tree line
- [ ] Birds: a small flock that circles and lands
- [ ] Creature trails — faint paths worn where they walk most often
- [ ] Sound, muted by default, with an obvious toggle (wind, sea, birds)

## Systems — make it a simulation rather than a scene

- [ ] Weather: rain over one region at a time, visible as a shaded patch
- [ ] Seasons tied to the world's real age, shifting the palette
- [ ] Water flow: rivers traced downhill from high ground to the sea
- [ ] Creatures get hunger and seek out food; flora slowly regrows
- [ ] Population changes over time, recorded in the chronicle
- [ ] Herds — creatures that prefer each other's company
- [ ] Fire and regrowth, on a long cycle (gentle, not destructive-looking)
- [ ] A second creature kind, with different habits and habitat

## Craft — make it beautiful

- [ ] Shadows from the sun (cascaded or a single tight map on the lit face)
- [ ] Better water: depth-based colour, foam at the shoreline
- [ ] Atmospheric scattering on the limb rather than the current fresnel rim
- [ ] Subtle bloom on the sun and on any night-time lights
- [ ] Aurora at high latitudes on the night side
- [ ] Night lights where creatures gather
- [ ] Camera: a gentle "fly closer" mode that follows one creature

## Depth — reward a returning visitor

- [ ] Click a creature to follow it and see its name and age
- [ ] Named regions that appear once a place has a history
- [ ] A chronicle timeline that can scrub back through the world's age
- [ ] Landmarks left behind by past events
- [ ] Structures — the first thing the creatures build

## Structural

- [x] Archive milestone worlds under `archive/day-NNN/` so past days stay
      runnable, with versioned vendoring so engine upgrades can't break them
- [ ] Snapshot the next milestone (day 10), then 25, 50, 100
- [ ] Split `src/systems/` out of `src/world/` once there are more than a few
      simulation systems
- [ ] A tiny deterministic test page that renders known frames and hashes them,
      so terrain regressions are caught without eyeballing
- [ ] Lightweight LOD if triangle counts climb past a few hundred thousand
