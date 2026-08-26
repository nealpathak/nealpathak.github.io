# Emberwake

A third-person action RPG that runs in a browser tab. No install, no plugins,
no build step — the repository *is* the game.

**Play:** https://nealpathak.github.io/

## What it is

The sun did not set. It fell, and shattered into embers scattered across the
Vale. You are Ashbound, sworn to carry them back to the Kindle.

Emberwake takes the parts of four genres that actually combine:

* **Souls-like melee** — stamina you can run out of, attacks you commit to,
  a dodge with real invincibility frames, poise and stagger, parry into riposte,
  and shrines that heal you but wake every enemy back up.
* **A party that fights with you** — companions with their own tactics, and
  support bonds that grow from standing in the same fight.
* **An affinity triangle with teeth** — Ember beats Bloom beats Tide beats
  Ember; Radiance and Void tear each other apart.
* **Spirits worth collecting** — weaken an elite spirit, bind it to your
  covenant, and it levels and evolves alongside you.

## Running it locally

Any static file server works. There is nothing to compile.

```sh
python3 -m http.server 4174
# then open http://localhost:4174
```

## Controls

| | |
|---|---|
| Move | `W` `A` `S` `D` |
| Camera | mouse (click the page to capture the pointer) |
| Dodge / sprint | `Space` — tap to roll, hold to sprint |
| Light attack | left mouse |
| Heavy attack | `Shift` + left mouse |
| Guard | right mouse (hold) |
| Parry | `Shift` + right mouse, or `F` |
| Lock on | `Q` — `Tab` cycles targets |
| Heal | `R` |
| Interact | `E` |
| Bind a spirit | `G` |
| Wisp skill | `V` |
| Party command | `C` |
| Menus | `I` inventory · `P` covenant · `M` map · `Esc` pause |

A gamepad works too and is picked up automatically.

## Repository layout

```
index.html          the whole game entry point
src/core/           loop, input, math, RNG, events, settings, save
src/render/         renderer, post FX, procedural textures, materials, sky/fog
src/anim/           skeleton, keyframe clips, layered animator
src/world/          terrain, collision, props, foliage, zones
src/actors/         player, enemies, companions, spirits
src/combat/         stats, damage, hitboxes, status
src/game/           game state, camera, progression, inventory, dialogue
src/ui/             HUD and menus (DOM, not WebGL)
src/audio/          procedural sound and adaptive music
vendor/three/       Three.js, MIT, vendored so there is no CDN dependency
docs/DESIGN.md      the design document
tools/              parse check and a headless screenshot harness
```

## Development

```sh
tools/check.sh              # parse-check every module
tools/shot.sh out.png 2000  # headless render, console errors, perf numbers
```

## Licence

Game code is MIT. Three.js is vendored under `vendor/three/` with its own MIT
licence.
