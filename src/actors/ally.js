// Allies: summoned Wisps and travelling companions.
//
// The design rule from Dragon Age is that a party member should be useful
// without being the reason you won. So allies deal real but modest damage,
// pull aggro off you when you are hurt, and obey standing orders rather than
// needing to be driven.

import * as THREE from 'three';
import { Actor } from './actor.js';
import { equipWeapon } from './weapons.js';
import { MeleeHitbox } from '../combat/hitbox.js';
import { resolveHit } from '../combat/damage.js';
import { bus } from '../core/events.js';
import { clamp, randRange } from '../core/math.js';
import { makeRng } from '../core/rng.js';
import { TACTICS, BOND_RANKS } from '../game/covenant.js';
import { COMPANIONS } from '../data/companions.js';

export const AS = {
  FOLLOW: 'follow', ENGAGE: 'engage', STRAFE: 'strafe', ATTACK: 'attack',
  CAST: 'cast', RETREAT: 'retreat', HIT: 'hit', DEAD: 'dead', IDLE: 'idle',
};

export class Ally extends Actor {
  constructor({ world, game, look, scale = 1, stats, affinity = 'none', name = 'Ally', ...rest }) {
    super({ world, look, scale, stats, affinity, faction: 'player', name, ...rest });
    this.game = game;
    this.state = AS.FOLLOW;
    this.stateTime = 0;
    this.rng = makeRng((name.length * 7919 + 17) >>> 0);

    this.tactics = TACTICS.balanced;
    this.leader = game.player;
    this.target = null;
    this.bond = 0;
    this.bondRadius = 9;

    this.hitbox = new MeleeHitbox(this);
    this.attackCooldown = 1;
    this.castCooldown = 3;
    this.moves = [];
    this.power = 34;

    this.turnRate = 7;
    this.walkSpeed = 1.6;
    this.runSpeed = 4.4;

    this._toLeader = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._strafe = new THREE.Vector3();
    this._side = this.rng() < 0.5 ? -1 : 1;
  }

  setTactics(t) { this.tactics = t ?? TACTICS.balanced; }

  get bondRank() {
    let rank = BOND_RANKS[0];
    for (const r of BOND_RANKS) if (this.bond >= r.at) rank = r;
    return rank;
  }

  get lines() { return COMPANIONS[this.companionId]?.lines ?? null; }
  get shortName() { return COMPANIONS[this.companionId]?.short ?? this.name; }

  /** Say one of this companion's lines, if it has one for the occasion. */
  speak(key) {
    const line = this.lines?.[key];
    if (!line || this._lastLine === key) return;
    this._lastLine = key;
    bus.emit('ui:speech', { who: this.shortName, text: line });
    // Allow the same line again later; it is the immediate repeat that grates.
    setTimeout(() => { if (this._lastLine === key) this._lastLine = null; }, 45000);
  }

  bondWith(other, amount) {
    const before = this.bondRank.id;
    this.bond += amount;
    const after = this.bondRank;
    if (after.id !== before) {
      bus.emit('covenant:allyBond', { ally: this, rank: after });
      bus.emit('ui:toast', { text: `${this.name} — bond rank ${after.label}`, kind: 'good', duration: 3.5 });
      if (after.id === 'B') this.speak('bondB');
      if (after.id === 'A') this.speak('bondA');
    }
    void other;
  }

  setState(next, opts = {}) {
    if (this.state === next && !opts.force) return;
    this.state = next;
    this.stateTime = 0;
    const c = this.character;
    switch (next) {
      case AS.FOLLOW:
      case AS.ENGAGE:
      case AS.RETREAT:
      case AS.IDLE:
        c.useLocomotion(false);
        break;
      case AS.STRAFE:
        c.useLocomotion(true);
        break;
      case AS.ATTACK:
        c.playFull(opts.clip ?? 'attackLight1', { fade: 0.08 });
        break;
      case AS.CAST:
        c.playFull('cast', { fade: 0.1 });
        break;
      case AS.HIT:
        c.playFull('hitLight');
        break;
      case AS.DEAD:
        c.playFull('death');
        break;
      default: break;
    }
  }

  /** Pick a target consistent with the standing orders. */
  _pickTarget() {
    const leader = this.leader;
    const t = this.tactics;
    let best = null, bestScore = Infinity;
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const dLeader = e.position.distanceTo(leader.position);
      const dSelf = e.position.distanceTo(this.position);
      if (dLeader > t.engageRange && dSelf > t.engageRange) continue;
      if (t.id === 'passive' && !e.aggro) continue;
      // Guardians prefer whatever is closest to the player; everyone else
      // prefers whatever they can reach soonest.
      const score = t.defend ? dLeader : dSelf * 0.7 + dLeader * 0.3;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  think(dt) {
    if (!this.alive) return;
    this.stateTime += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.castCooldown > 0) this.castCooldown -= dt;

    const leader = this.leader;
    this._toLeader.subVectors(leader.position, this.position);
    const leaderDist = this._toLeader.length();

    // Teleport back if left behind — better than a companion stuck on terrain.
    if (leaderDist > 40) {
      this.setPosition(
        leader.position.x - Math.sin(leader.yaw) * 2,
        leader.position.y,
        leader.position.z - Math.cos(leader.yaw) * 2,
      );
      return;
    }

    if (!this.target?.alive) this.target = this._pickTarget();
    const hurt = this.healthFraction < 0.3;

    if (this.state === AS.ATTACK || this.state === AS.CAST || this.state === AS.HIT) {
      this.requestMove(0, 0, 0);
      if (this.character.base.finished) this.setState(this.target ? AS.STRAFE : AS.FOLLOW, { force: true });
      return;
    }

    if (!this.target || (hurt && this.tactics.id !== 'aggressive')) {
      this._follow(leaderDist);
      return;
    }

    this._toTarget.subVectors(this.target.position, this.position);
    const dist = this._toTarget.length();
    const reach = 1.9 * this.scale;

    // Ranged allies keep their distance and cast; melee allies close.
    const ranged = this.moves.some((m) => m.kind === 'projectile');
    const want = ranged ? 7.5 : reach * 0.9;

    if (ranged && this.castCooldown <= 0 && dist < 18 && this._lineOfSight(this.target)) {
      this._cast();
      return;
    }
    if (!ranged && dist <= reach && this.attackCooldown <= 0) {
      this._attack();
      return;
    }

    if (dist > want * 1.25) {
      this.faceTowards(this.target.position.x, this.target.position.z);
      this.requestMove(this._toTarget.x, this._toTarget.z, this.runSpeed);
      if (this.state !== AS.ENGAGE) this.setState(AS.ENGAGE);
    } else if (dist < want * 0.7) {
      this.faceTowards(this.target.position.x, this.target.position.z);
      this.requestMove(-this._toTarget.x, -this._toTarget.z, this.walkSpeed * 1.2);
      if (this.state !== AS.RETREAT) this.setState(AS.RETREAT);
    } else {
      this.faceTowards(this.target.position.x, this.target.position.z);
      this._strafe.set(-this._toTarget.z, 0, this._toTarget.x).normalize().multiplyScalar(this._side);
      this.requestMove(this._strafe.x, this._strafe.z, this.walkSpeed);
      if (this.state !== AS.STRAFE) this.setState(AS.STRAFE);
      if (this.stateTime > randRange(this.rng, 1.2, 2.6)) { this._side *= -1; this.stateTime = 0; }
    }
  }

  _follow(leaderDist) {
    const follow = this.tactics.followDistance;
    if (leaderDist > follow * 1.4) {
      this.faceTowards(this.leader.position.x, this.leader.position.z);
      this.requestMove(this._toLeader.x, this._toLeader.z, leaderDist > follow * 3 ? this.runSpeed : this.walkSpeed * 1.5);
      if (this.state !== AS.FOLLOW) this.setState(AS.FOLLOW);
    } else {
      this.requestMove(0, 0, 0);
      this.targetYaw = this.leader.yaw;
      if (this.state !== AS.IDLE) this.setState(AS.IDLE);
    }
  }

  _lineOfSight(target) {
    const col = this.world?.collision;
    if (!col) return true;
    _from.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _dir.set(target.position.x, target.position.y + target.eyeHeight, target.position.z).sub(_from);
    const d = _dir.length();
    _dir.divideScalar(d);
    return col.raycast(_from, _dir, d - 0.3) >= d - 0.4;
  }

  _attack() {
    this.attackCooldown = randRange(this.rng, 1.1, 2.0);
    this.faceTowards(this.target.position.x, this.target.position.z, true);
    const clip = this.rng() < 0.5 ? 'attackLight1' : 'attackLight2';
    this.setState(AS.ATTACK, { force: true, clip });
  }

  _cast() {
    const usable = this.moves.filter((m) => m.kind === 'projectile');
    if (!usable.length) return;
    this.pendingMove = usable[(this.rng() * usable.length) | 0];
    this.castCooldown = this.pendingMove.cooldown ?? 3;
    this.faceTowards(this.target.position.x, this.target.position.z, true);
    this.setState(AS.CAST, { force: true });
  }

  onAnimEvent(e) {
    switch (e.name) {
      case 'hitStart': {
        const src = this.weaponObject ?? this.character.skeleton.get('handR');
        const ud = this.weaponObject?.userData;
        this.hitbox.open(src, ud?.hitFrom ?? [0, 0.05, 0], ud?.hitTo ?? [0, -0.28, 0.1],
          (ud?.radius ?? 0.26) * this.scale, {
            damage: this.power * this._bondDamageBonus(),
            poiseDamage: this.power * 0.32,
            affinity: this.affinity,
          });
        bus.emit('sfx:swoosh', { actor: this, pitch: 1.1 });
        break;
      }
      case 'hitEnd':
        this.hitbox.close();
        break;
      case 'castRelease':
        this._releaseProjectile();
        break;
      default: break;
    }
  }

  _bondDamageBonus() {
    return 1 + (this.bondRank.bonus?.damage ?? 0);
  }

  _releaseProjectile() {
    const move = this.pendingMove;
    if (!move || !this.target?.alive) return;
    const hand = this.character.skeleton.get('handL');
    hand.updateWorldMatrix(true, false);
    const from = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const to = new THREE.Vector3(
      this.target.position.x,
      this.target.position.y + this.target.height * 0.55,
      this.target.position.z,
    );
    this.game.fx.spawnProjectile({
      from, to, owner: this, speed: 18, radius: 0.24,
      colour: this.projectileColour ?? 0x9ff0ff,
      spec: {
        damage: this.power * (move.power ?? 1) * this._bondDamageBonus(),
        poiseDamage: this.power * 0.25,
        affinity: move.affinity ?? this.affinity,
        status: move.status ?? null,
        statusAmount: move.statusAmount ?? 0,
      },
    });
    this.pendingMove = null;
  }

  onFlinch(report) {
    this.character.flash(0xffffff, 0.06);
    if (this.healthFraction < 0.3) this.speak('lowHealth');
    if (report.damage > this.maxHealth * 0.12) this.setState(AS.HIT, { force: true });
    // Being hit picks a fight, whatever the standing orders say.
    if (report.attack?.source?.alive) this.target = report.attack.source;
  }

  onStagger() { this.setState(AS.HIT, { force: true }); }

  onDeath() {
    if (!this.alive) return;
    this.alive = false;
    this.hitbox.close();
    this.setState(AS.DEAD, { force: true });
    bus.emit('ally:down', { ally: this });
    bus.emit('ui:toast', { text: `${this.name} has fallen.`, kind: 'bad', duration: 4 });
  }

  /** Allies recover on their own after a while rather than staying dead. */
  reviveAfter(dt) {
    this._downTime = (this._downTime ?? 0) + dt;
    if (this._downTime < 24) return;
    this._downTime = 0;
    this.alive = true;
    this.health = this.maxHealth * 0.5;
    this.setState(AS.FOLLOW, { force: true });
    bus.emit('ui:toast', { text: `${this.name} rejoins you.`, kind: 'good', duration: 3 });
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    if (!this.alive) { this.requestMove(0, 0, 0); this.reviveAfter(dt); }
    this.integrate(dt, { acceleration: 22, deceleration: 18 });
    this.turn(dt, this.state === AS.ATTACK ? 0.2 : 1);
  }

  update(dt) {
    super.update(dt);
    this.hitbox.sample();
    if (this.target?.alive && this.alive) {
      this.character.setLookAt(
        _look.set(this.target.position.x, this.target.position.y + this.target.eyeHeight, this.target.position.z), 0.6,
      );
    } else this.character.setLookAt(null);
  }
}

/** Build the actor for a bound Wisp. */
export function summonWisp(game, boundWisp) {
  const def = boundWisp.def;
  const ally = new Ally({
    world: game.world,
    game,
    scale: def.scale ?? 0.75,
    radius: 0.3,
    affinity: def.affinity,
    name: boundWisp.name,
    stats: {
      level: boundWisp.level, vigour: 8, endurance: 12, strength: 8,
      finesse: 12, resolve: 8, attunement: 14,
    },
    look: {
      helm: 'none', pauldrons: 'none', fauld: false, cape: true, build: 0.72,
      rimStrength: 0.9, metalness: 0.1, eyeGlow: 1,
      capeColor: def.colour,
      palette: {
        flesh: def.colour, cloth: shade(def.colour, 0.45), cloth2: def.colour,
        leather: shade(def.colour, 0.35), metal: shade(def.colour, 0.7),
        metalDark: shade(def.colour, 0.3), accent: def.colour, eye: 0xffffff,
      },
    },
  });
  ally.maxHealth = boundWisp.maxHealth;
  ally.health = ally.maxHealth;
  ally.power = boundWisp.power;
  ally.bond = boundWisp.bond;
  ally.projectileColour = def.colour;
  ally.moves = boundWisp.moves.map((id) => def.moves.find((m) => m.id === id)).filter(Boolean);
  ally.wisp = boundWisp;
  boundWisp.actor = ally;

  // A wisp is a light source as much as a fighter.
  const glow = new THREE.PointLight(def.colour, 4.5, 9, 2);
  glow.position.y = 1.0 * (def.scale ?? 0.75);
  ally.object.add(glow);
  ally.glow = glow;
  return ally;
}

/** Build a named companion. */
export function makeCompanion(game, def) {
  const ally = new Ally({
    world: game.world,
    game,
    scale: def.scale ?? 1,
    affinity: def.affinity ?? 'none',
    name: def.name,
    stats: def.stats,
    look: def.look,
  });
  ally.companionId = def.id;
  ally.power = def.power ?? 46;
  ally.bondRadius = def.bondRadius ?? 9;
  if (def.weapon) ally.weaponObject = equipWeapon(ally.character, def.weapon, def.weaponVisual ?? {});
  if (def.offhand) equipWeapon(ally.character, def.offhand, def.offhandVisual ?? {});
  if (def.moves) ally.moves = def.moves;
  ally.refreshDerived({ keepRatios: false });
  return ally;
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();
export { resolveHit, clamp };
