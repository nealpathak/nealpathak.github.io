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

**Zone.** Ashfen Approach: a shaped valley with authored ridges, a fen basin,
a walkable road, a ruin on a shelf, and the Wayside Ember shrine.

**Enemies.** Ashen Husk, Warden of the Gate (shield), Fen Houndling (pack),
Priest of the Kindle (ranged), Fen Wisp (bindable), and the boss, The Warden of
Ashfen — two phases, hyper-armour, an arena it will not leave.

**Player.** Three-hit light chain, two heavies, a running thrust, roll and
backstep with i-frames, guard with stability and guard-break, parry into
riposte, backstabs, a flask, and fall damage.

**Party.** Mote and Seryn as companions; bound Wisps summoned into the field.
Four standing orders, bonds that accrue from fighting together.

**Wisps.** Seven definitions with affinities, move lists learned by level, and
two evolution lines.

**Systems.** Six stats on soft-cap curves, equip load bands, three status
effects, an affinity triangle, cinders as both XP and currency, the death loop,
and a save.

## Still open

- The Sunken Choir and Cinderreach zones
- A hub with vendors, and quests with dialogue trees
- Companion dialogue beyond the one-line barks
- Touch controls

## Non-goals

Photoreal rendering. Downloadable assets of any kind. Multiplayer. A build
pipeline — everything here is hand-written ES modules served as static files.
