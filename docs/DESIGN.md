# Emberwake — Design Document

A third-person action RPG that runs in a browser tab. No install, no build step,
no plugins: open the page and you are playing.

## Pitch

The sun did not set. It **fell** — and shattered into embers scattered across the
Vale. The Ashbound are sworn to carry those embers back to the Kindle before the
last light gutters out. You are the newest and probably the last of them.

## Influences, and what we take from each

| Source | What we take |
|---|---|
| **Dark Souls** | Stamina economy, committed attacks, i-frame dodge, lock-on, poise/stagger, parry→riposte, checkpoint shrines that respawn the world, currency you drop on death and must recover |
| **Dragon Age** | A party that fights beside you, tactics presets you configure, companions with voice and opinions |
| **Fire Emblem** | An affinity triangle with real teeth, support bonds that grow from fighting side by side and unlock paired attacks, class identity |
| **Pokémon** | Bind defeated spirits into your covenant; they level, learn moves, and evolve; a bestiary worth completing |
| **Shadow of the Colossus / Journey** | Silhouette-first art direction, atmosphere over polygon count |

## Pillars

1. **Every swing is a decision.** Attacks commit. Stamina is scarce. The dodge is
   generous but not free. You should lose fights because you got greedy.
2. **You are never alone, but you are always responsible.** Companions and Wisps
   fight with you and can be commanded, but they will not win the fight for you.
3. **Collect, grow, specialise.** Six affinities, a triangle that matters, Wisps
   that evolve, weapons that scale off different stats.
4. **Readable at a glance.** Wind-ups telegraph. Colour codes affinity. The HUD
   never lies about how much stamina you have.

## The affinity wheel

```
        Ember
       ↗      ↘
   Tide        Bloom
       ↖      ↙
        (cycle: Ember → Bloom → Tide → Ember)

   Radiance ⇄ Void   (mutually super-effective, mutually fragile)
```

* Advantaged hit: **×1.35 damage, ×1.5 poise damage**
* Disadvantaged hit: **×0.7 damage, ×0.6 poise damage**
* Radiance/Void against each other: **×1.5 / ×1.5** — glass cannons both ways

## Core loop

Leave an **Emberwake** shrine → explore → fight → earn **Cinders** → weaken and
**bind** elite spirits → return to a shrine to level, respawn the world, and
restore your flask → push deeper → boss.

Die and you drop your Cinders where you fell. Get back to them without dying
again and they are yours. Die on the way and they are gone.

## Systems

### Stats
`Vigour` (HP), `Endurance` (stamina, equip load), `Strength`, `Finesse`,
`Resolve` (poise, status resist), `Attunement` (Wisp power, bind chance).
Weapons scale off different stats with letter grades, Souls-style.

### Stamina
Sprinting, rolling, attacking and blocking all cost. Regeneration pauses briefly
after spending and stops entirely while blocking. Running out mid-guard breaks
your guard and staggers you.

### Poise & stagger
Every actor has poise. Hits deal poise damage; break it and the actor is
staggered and open to a **critical**. Poise regenerates. Heavy weapons deal more
poise damage; light weapons deal more of it per second.

### Bonds (Fire Emblem support)
Fighting within bond radius of an ally accrues support. Ranks C → B → A grant
passive bonuses and unlock a **Paired Strike** you can call.

### Binding (Pokémon)
Elite spirits can be bound with an **Ember Sigil** once below a health
threshold. Chance scales with missing HP, Attunement, sigil quality, and
status. Bound Wisps join your covenant, gain levels, and evolve at thresholds.

## What is built

**Zones.** Two, joined by a waygate the Warden of Ashfen stands in front of.

*Ashfen Approach*: a shaped valley with authored ridges, a walkable road, a
ruin on a shelf, a fen you can wade into, and two Ember shrines.

*The Sunken Choir*: a cathedral in a sinkhole, flooded to the height of the pew
backs. One long nave under standing vault ribs, dry aisles down either side,
the drowned bell at the crossing, and the chancel beyond it.

**Enemies.** Ashen Husk, Warden of the Gate (shield), Fen Houndling (pack),
Priest of the Kindle (ranged), Fen Wisp (bindable), Drowned Chorister, Tide
Lurker (aquatic — it holds the waterline and will not follow you onto the
aisles), Choir Wisp (bindable), and two bosses: The Warden of Ashfen and The
Precentor, both two-phase, hyper-armoured, and tied to an arena.

**Player.** Three-hit light chain, two heavies, a running thrust, roll and
backstep with i-frames, guard with stability and guard-break, parry into
riposte, backstabs, a flask, and fall damage.

**Party.** Mote and Seryn as companions; bound Wisps summoned into the field.
Four standing orders, bonds that accrue from fighting together.

**Wisps.** Eight definitions with affinities, move lists learned by level, and
three evolution lines.

**Systems.** Six stats on soft-cap curves, equip load bands, three status
effects, an affinity triangle, cinders as both XP and currency, the death loop,
and a save.

## Weapon classes

Each class has its own chain, playback speed, lunge, stamina cost and poise
multiplier, so the choice changes how you fight rather than only how fast
things die. Measured against the same pair of husks, with the same bot:

| Class | Time | Damage per swing | Staggers | Damage taken |
|---|---|---|---|---|
| Sword | 9s | 93 | 5 | none to light |
| Greatsword | 10s | 242 | 6 | the most — slow means exposed |
| Spear | 15s | 71 | 3 | none — reach keeps you out of it |
| Staff | 21s | 51 | 0 | light, but it is a catalyst; bring a spirit |

## Water

Water is one plane per zone with three layers on it. The big shape is analytic
swell in the vertex shader, so its derivatives give the surface normal exactly.
Fine chop is a tiled ripple normal map scrolled by animating the texture offset,
which needs no shader surgery at all. Everything else — colour, opacity,
roughness, the foam line and the waterline itself — reads off a depth map baked
once from the terrain underneath.

That depth map is *signed*. The plane is square and a pond is not; an unsigned
map cannot tell water from the bank it is drawn over, and lays a translucent
wash of pond across the surrounding grass.

Water is not decoration. Submersion is measured every tick and drags on
movement, down to a bit over a third of your speed at chest height. Wading is
the tax the Choir charges for every metre of its nave, and the dry aisles down
either side are the reason the zone has a shape at all.

Getting a pond to hold water needs the `pool` shaper rather than a basin: a
basin over noisy ground is not a pond, because the noise breaches the rim
somewhere and the water runs out of the level. `pool` authors a flat bed and a
lip all the way round, keeps enough noise for hummocks, and clamps so that
neither can be breached. Its `aspect` argument squeezes the x axis, which is
how one shaper floods a round fen and a nave 34 across by 88 down.

## Crossing between zones

There is no streaming and no second zone held in memory: the old one is torn
down and the new one built in its place. What survives a crossing is everything
that belongs to the player rather than to the ground they were standing on —
stats, inventory, covenant, cinders, kindled shrines and the party. What does
not is the bloodstain, which belongs to the ground it was dropped on, exactly
as a second death forfeits it.

Kindled shrines are tracked by id across every zone rather than by walking the
zone that happens to be loaded, because the other one is not there to walk. Die
in one zone with your last ember in another and you wake at the ember.

## Known limitations

`attackRunning` is named a thrust but does not behave like one: measured
mid-swing the weapon ends up pointing up and back rather than forward. A short
sword survives that; a two-metre polearm built on it did eight damage a swing.
The spear is built on the sweeping clips instead until there is a thrust
animation that measurably drives the head forward.

## Still open

- The Cinderreach zone
- A hub with vendors, and quests with dialogue trees
- Companion dialogue beyond the one-line barks
- A thrust animation that actually thrusts
- Touch controls

## Non-goals

Photoreal rendering. Downloadable assets of any kind. Multiplayer. A build
pipeline — everything here is hand-written ES modules served as static files.
