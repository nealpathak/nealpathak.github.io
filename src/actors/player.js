// The player.
//
// A state machine over the Actor base. States own their transitions, which
// keeps the rules of "what can interrupt what" — the actual design of a
// souls-like — in one readable place rather than scattered through if-chains.

import * as THREE from 'three';
import { Actor } from './actor.js';
import { equipWeapon } from './weapons.js';
import { MeleeHitbox, WeaponTrail } from '../combat/hitbox.js';
import { isBackstab, resolveHit } from '../combat/damage.js';
import { attackRating, loadBand } from '../combat/stats.js';
import { movesetFor, clip } from '../anim/library.js';
import { bus } from '../core/events.js';
import { clamp, damp, shortestAngle } from '../core/math.js';
import { settings } from '../core/settings.js';

/**
 * States in which the base animation layer belongs to locomotion. Anything not
 * in this set has played a one-shot onto that layer and must not have it taken
 * back — doing so silently cancels every attack, roll and reaction.
 */
export const LOCOMOTION_STATES = new Set(['idle', 'move', 'sprint']);

export const PS = {
  IDLE: 'idle', MOVE: 'move', SPRINT: 'sprint', ROLL: 'roll', BACKSTEP: 'backstep',
  ATTACK: 'attack', GUARD: 'guard', PARRY: 'parry', RIPOSTE: 'riposte',
  HIT: 'hit', STAGGER: 'stagger', DEAD: 'dead', DRINK: 'drink',
  CAST: 'cast', BIND: 'bind', INTERACT: 'interact', REST: 'rest', FALL: 'fall',
};

// Stamina costs that are not weapon-specific. Attack costs come from the
// weapon's moveset, so a greatsword swing empties a bar a longsword's does not.
const COST = {
  roll: 22, backstep: 15, sprintPerSecond: 12,
  parry: 14, riposte: 0, guardMin: 4, cast: 0, bind: 8,
};

export class Player extends Actor {
  constructor(opts) {
    super({ ...opts, faction: 'player', name: opts.name ?? 'Ashbound' });

    this.state = PS.IDLE;
    this.stateTime = 0;
    this.lockedOn = null;

    this.weapon = null;
    this.offhand = null;
    this.weaponStats = null;
    this.armourPoise = 0;
    this.equipLoadCurrent = 0;

    this.hitbox = new MeleeHitbox(this);
    this.trail = new WeaponTrail({ segments: 14, color: 0xffcf95 });

    this.chain = { type: null, index: 0, queued: null, window: 0 };
    this.canCombo = false;
    this.rollDirection = new THREE.Vector3(0, 0, 1);
    this.rollSpeed = 7.2;

    this.flask = { charges: 5, max: 5, healPercent: 0.62 };
    this.cinders = 0;
    this.lastRestShrine = null;

    this.interactTarget = null;
    this.pendingRiposte = null;

    this._camForward = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._sprintHeld = 0;
    this._guardHeld = false;
    this._wantsSprint = false;
    this.eyeHeight = 1.5 * this.scale;
  }

  // --- equipment ------------------------------------------------------------

  equip(weaponName, weaponData) {
    if (this.weapon) { this.weapon.parent?.remove(this.weapon); }
    this.weapon = equipWeapon(this.character, weaponName, weaponData?.visual ?? {});
    this.weaponStats = weaponData ?? DEFAULT_WEAPON;
    this.character.weapon = this.weapon;
    if (this.weapon && !this.trailAttached) {
      this.trailAttached = true;
    }
    this._recomputeLoad();
    bus.emit('player:equipped', { player: this, slot: 'weapon', name: weaponName });
    return this.weapon;
  }

  equipOffhand(name, data) {
    if (this.offhand) this.offhand.parent?.remove(this.offhand);
    this.offhand = name ? equipWeapon(this.character, name, data?.visual ?? {}) : null;
    this.offhandStats = data ?? null;
    this.guardAbsorption = this.offhand ? (this.offhand.userData.block ?? 0.7) : 0.38;
    this.guardStability = data?.stability ?? (this.offhand ? 0.62 : 0.34);
    this._recomputeLoad();
    return this.offhand;
  }

  _recomputeLoad() {
    let load = this.armourWeight ?? 12;
    load += this.weaponStats?.weight ?? 5;
    load += this.offhandStats?.weight ?? (this.offhand ? 5 : 0);
    this.equipLoadCurrent = load;
    this.load = loadBand(load, this.stats.equipLoad);
    this.staminaRegenMultiplier = this.load.staminaRegen;
    this.moveSpeedMultiplier = this.load.moveSpeed;
    bus.emit('player:load', { player: this, band: this.load, current: load, max: this.stats.equipLoad });
  }

  get attackRating() {
    const base = this.weaponStats ? attackRating(this.weaponStats, this.stats) : 40;
    return base * (this.damageMultiplier ?? 1);
  }

  /** The moveset for whatever is currently in hand. */
  get moveset() {
    return movesetFor(this.weapon?.userData?.class ?? 'sword');
  }

  // --- state machine --------------------------------------------------------

  setState(next, opts = {}) {
    if (this.state === next && !opts.force) return;
    this._exitState(this.state, next);
    this.state = next;
    this.stateTime = 0;
    this._enterState(next, opts);
    bus.emit('player:state', { player: this, state: next });
  }

  _exitState(state) {
    if (state === PS.GUARD) this.isGuarding = false;
    if (state === PS.ATTACK) { this.hitbox.close(); this.canCombo = false; }
    if (state === PS.PARRY) this.parryWindow = 0;
  }

  _enterState(state, opts) {
    const c = this.character;
    switch (state) {
      case PS.IDLE:
      case PS.MOVE:
      case PS.SPRINT:
        c.useLocomotion(!!this.lockedOn);
        c.releaseUpper(0.16);
        break;
      case PS.ROLL: {
        this.spendStamina(COST.roll);
        this.invulnerable = 0;   // set by the clip's iframesOn event
        c.playFull('roll', { speed: this.load.rollSpeed });
        break;
      }
      case PS.BACKSTEP:
        this.spendStamina(COST.backstep);
        c.playFull('backstep', { speed: 1.05 });
        break;
      case PS.ATTACK:
        c.playFull(opts.clip, { speed: opts.speed ?? 1, fade: opts.fade ?? 0.07 });
        break;
      case PS.GUARD:
        this.isGuarding = true;
        c.playFull('guard', { fade: 0.14 });
        break;
      case PS.PARRY:
        this.spendStamina(COST.parry);
        c.playFull('parry');
        break;
      case PS.RIPOSTE:
        c.playFull('riposte');
        this.invulnerable = 1.05;
        break;
      case PS.HIT:
        c.playFull(opts.heavy ? 'hitHeavy' : 'hitLight');
        break;
      case PS.STAGGER:
        c.playFull('stagger');
        break;
      case PS.DEAD:
        c.playFull('death');
        this.alive = false;
        break;
      case PS.DRINK:
        c.playFull('drink');
        break;
      case PS.CAST:
        c.playFull('cast');
        break;
      case PS.BIND:
        this.spendStamina(COST.bind);
        c.playFull('bindThrow');
        break;
      case PS.INTERACT:
        c.playFull('interact');
        break;
      case PS.REST:
        c.playFull('rest', { fade: 0.4 });
        break;
      case PS.FALL:
        c.playFull('fall', { fade: 0.18, loop: true });
        break;
      default: break;
    }
  }

  /** True while the player is committed and cannot start a new action. */
  get busy() {
    return this.state === PS.ROLL || this.state === PS.BACKSTEP || this.state === PS.ATTACK
      || this.state === PS.PARRY || this.state === PS.RIPOSTE || this.state === PS.HIT
      || this.state === PS.STAGGER || this.state === PS.DEAD || this.state === PS.DRINK
      || this.state === PS.CAST || this.state === PS.BIND || this.state === PS.INTERACT
      || this.state === PS.REST;
  }

  get canAct() {
    return this.alive && !this.busy;
  }

  // --- input ----------------------------------------------------------------

  /**
   * Read input and drive the state machine. Called from fixedUpdate with the
   * camera basis, so movement is always relative to where the player is looking.
   */
  handleInput(input, camera, dt) {
    if (!this.alive) return;

    camera.basis(this._camForward, this._camRight);
    const mx = input.move.x, my = input.move.y;
    const magnitude = Math.min(1, Math.hypot(mx, my));
    this._moveDir.set(0, 0, 0)
      .addScaledVector(this._camForward, my)
      .addScaledVector(this._camRight, mx);
    if (this._moveDir.lengthSq() > 1e-6) this._moveDir.normalize();

    // --- actions that can interrupt ---
    if (this.state === PS.REST) {
      if (input.consume('menu', 0.3) || input.consume('interact', 0.3)) this.setState(PS.IDLE);
      return;
    }

    // Buffered dodge: fires the moment the current action allows it.
    const dodgeReady = this.canAct || (this.state === PS.ATTACK && this.canCombo);
    if (dodgeReady && input.buffered('dodge', 0.28) && !input.held('dodge')) {
      if (input.consumeTap('dodge', 0.24, 0.28)) {
        this._tryEvade(magnitude);
        return;
      }
    }
    // Holding the dodge button sprints, once held past the tap threshold.
    this._wantsSprint = input.held('dodge') && input.heldFor('dodge') > 0.20 && magnitude > 0.1;

    if (this.canAct || (this.state === PS.ATTACK && this.canCombo)) {
      if (input.consume('lightAttack', 0.26)) { this._tryAttack('light'); return; }
      if (input.consume('heavyAttack', 0.26)) { this._tryAttack('heavy'); return; }
    }
    if (this.canAct) {
      if (input.consume('parry', 0.2)) { this._tryParry(); return; }
      if (input.consume('heal', 0.25)) { this._tryDrink(); return; }
      if (input.consume('skill', 0.25)) { this._tryCast(); return; }
      if (input.consume('bind', 0.25)) { this._tryBind(); return; }
      if (input.consume('interact', 0.3) && this.interactTarget) { this._tryInteract(); return; }
    }

    // Guard is a hold, and can be entered from any non-committed state.
    const wantGuard = input.held('guard') && this.stamina > 1;
    if (this.canAct || this.state === PS.GUARD) {
      if (wantGuard && this.state !== PS.GUARD) this.setState(PS.GUARD);
      else if (!wantGuard && this.state === PS.GUARD) this.setState(PS.IDLE);
    }

    this._driveMovement(magnitude, dt);
  }

  _driveMovement(magnitude, dt) {
    const moving = magnitude > 0.08;

    switch (this.state) {
      case PS.IDLE:
      case PS.MOVE:
      case PS.SPRINT: {
        if (!moving) {
          this.requestMove(0, 0, 0);
          if (this.state !== PS.IDLE) this.setState(PS.IDLE);
          break;
        }
        const sprinting = this._wantsSprint && this.stamina > 2 && !this.lockedOn;
        const base = sprinting ? this.sprintSpeed
          : this.lockedOn ? this.runSpeed * 0.82
            : magnitude < 0.55 ? this.walkSpeed : this.runSpeed;
        const speed = base * this.moveSpeedMultiplier * magnitude / Math.max(magnitude, 0.001) * Math.min(1, magnitude / 0.9 + 0.15);
        this.requestMove(this._moveDir.x, this._moveDir.z, speed);
        if (sprinting) {
          this.spendStamina(COST.sprintPerSecond * dt);
          if (this.stamina <= 0) this._wantsSprint = false;
          if (this.state !== PS.SPRINT) this.setState(PS.SPRINT);
        } else if (this.state !== PS.MOVE) this.setState(PS.MOVE);

        // Facing: away from lock-on, the character turns to where it is going.
        if (!this.lockedOn) {
          this.targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
        }
        break;
      }

      case PS.GUARD: {
        const speed = moving ? this.walkSpeed * 0.9 * this.moveSpeedMultiplier : 0;
        this.requestMove(this._moveDir.x, this._moveDir.z, speed);
        if (!this.lockedOn && moving) this.targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
        break;
      }

      case PS.ROLL:
      case PS.BACKSTEP: {
        // Root motion: a fixed velocity along the committed direction, tapering
        // out so the player lands rather than skids.
        const p = this.character.base.progress;
        const curve = this.state === PS.ROLL
          ? Math.max(0, 1 - Math.pow(p / 0.72, 2.2))
          : Math.max(0, 1 - Math.pow(p / 0.45, 1.6));
        const speed = this.rollSpeed * this.load.rollDistance * curve;
        this.requestMove(this.rollDirection.x, this.rollDirection.z, speed);
        break;
      }

      case PS.ATTACK: {
        // Attacks slide forward briefly at the start of the active window.
        const p = this.character.base.progress;
        const lunge = this._attackLunge * Math.max(0, 1 - Math.abs(p - 0.32) / 0.28);
        if (lunge > 0.01) {
          this.requestMove(Math.sin(this.yaw), Math.cos(this.yaw), lunge);
        } else this.requestMove(0, 0, 0);
        break;
      }

      default:
        this.requestMove(0, 0, 0);
        break;
    }

    // Locked on: always face the target, whatever we are doing.
    if (this.lockedOn?.alive) {
      this.faceTowards(this.lockedOn.position.x, this.lockedOn.position.z);
    }
  }

  // --- actions --------------------------------------------------------------

  _tryEvade(magnitude) {
    if (!this.canSpend(COST.roll)) { bus.emit('player:noStamina'); return; }
    const moving = magnitude > 0.15;
    if (moving) {
      this.rollDirection.copy(this._moveDir);
      this.targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
      this.yaw = this.targetYaw;   // rolls commit instantly to their direction
      this.setState(PS.ROLL, { force: true });
    } else if (this.lockedOn) {
      this.rollDirection.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.setState(PS.BACKSTEP, { force: true });
    } else {
      this.rollDirection.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.setState(PS.ROLL, { force: true });
    }
  }

  _tryAttack(type) {
    const ms = this.moveset;
    const cost = type === 'heavy' ? ms.cost.heavy : ms.cost.light;
    const running = this.state === PS.SPRINT;
    if (!this.canSpend(cost)) { bus.emit('player:noStamina'); return; }

    let name;
    let lunge;
    if (running && type === 'light') {
      name = ms.running;
      lunge = ms.lunge.heavy * 2.2;
    } else {
      const chain = ms[type] ?? ms.light;
      const continuing = this.state === PS.ATTACK && this.chain.type === type && this.canCombo;
      const index = continuing ? (this.chain.index + 1) % chain.length : 0;
      this.chain.type = type;
      this.chain.index = index;
      name = chain[index];
      lunge = ms.lunge[type] ?? ms.lunge.light;
    }

    this.spendStamina(running ? Math.round(cost * 1.35) : cost);
    this._attackLunge = lunge;
    this._attackType = running ? 'running' : type;
    this.canCombo = false;
    // Turn to face where we are aiming before committing.
    if (!this.lockedOn && this._moveDir.lengthSq() > 0.01) {
      this.targetYaw = Math.atan2(this._moveDir.x, this._moveDir.z);
      this.yaw = damp(this.yaw, this.targetYaw, 30, 1 / 60);
    }
    this.setState(PS.ATTACK, {
      clip: name, force: true,
      speed: (this.weaponStats?.speed ?? 1) * ms.speed,
    });
  }

  _tryParry() {
    if (!this.canSpend(COST.parry)) { bus.emit('player:noStamina'); return; }
    this.setState(PS.PARRY, { force: true });
  }

  _tryDrink() {
    if (this.flask.charges <= 0) { bus.emit('player:noFlask'); return; }
    this.flask.charges--;
    bus.emit('player:flask', { player: this, flask: this.flask });
    this.setState(PS.DRINK, { force: true });
  }

  _tryCast() {
    // The Wisp does the work; the player's animation is the command gesture.
    // If the cast is refused (no Wisp, no focus, on cooldown) there is no
    // point playing the animation at all.
    const refused = this.game?.skills?.cast?.();
    if (refused) return;
    bus.emit('player:skill', { player: this });
    this.setState(PS.CAST, { force: true });
  }

  _tryBind() {
    bus.emit('player:bindAttempt', { player: this, target: this.lockedOn });
    this.setState(PS.BIND, { force: true });
  }

  _tryInteract() {
    const target = this.interactTarget;
    this.setState(PS.INTERACT, { force: true });
    this._pendingInteract = target;
  }

  // --- animation events -----------------------------------------------------

  onAnimEvent(e) {
    switch (e.name) {
      case 'iframesOn':
        this.invulnerable = this.state === PS.ROLL ? 0.42 * (1 / Math.max(0.4, this.load.rollSpeed)) : 0.24;
        break;
      case 'iframesOff':
        this.invulnerable = Math.min(this.invulnerable, 0.02);
        break;
      case 'recoverable':
        this.canCombo = true;
        break;
      case 'hitStart':
        this._openHitbox(e.data);
        break;
      case 'hitEnd':
        this.hitbox.close();
        break;
      case 'combo':
        this.canCombo = true;
        break;
      case 'parryOpen':
        this.parryWindow = 0.24;
        break;
      case 'parryClose':
        this.parryWindow = 0;
        break;
      case 'criticalHit':
        this._applyRiposte();
        break;
      case 'healApply':
        this.heal(Math.round(this.maxHealth * this.flask.healPercent));
        break;
      case 'castRelease':
        bus.emit('player:castRelease', { player: this });
        break;
      case 'sigilRelease':
        bus.emit('player:sigilRelease', { player: this, target: this.lockedOn });
        break;
      case 'interactApply':
        if (this._pendingInteract) {
          bus.emit('player:interact', { player: this, target: this._pendingInteract });
          this._pendingInteract = null;
        }
        break;
      case 'footstep':
        bus.emit('sfx:footstep', { actor: this, ...e.data, speed: this._speed });
        break;
      case 'swoosh':
        bus.emit('sfx:swoosh', { actor: this, ...e.data });
        break;
      default: break;
    }
  }

  _openHitbox(data = {}) {
    const w = this.weapon;
    if (!w) return;
    const ud = w.userData;
    const stats = this.weaponStats ?? DEFAULT_WEAPON;
    const heavy = !!data.heavy || this._attackType === 'heavy';
    const rating = this.attackRating;
    const ms = this.moveset;
    this.hitbox.open(w, ud.hitFrom, ud.hitTo, ud.radius * this.scale, {
      damage: rating * (heavy ? 1.62 : 1.0) * (data.arc === 'thrust' ? 1.24 : 1),
      poiseDamage: (stats.poiseDamage ?? rating * 0.32) * (heavy ? 1.9 : 1) * ms.poise,
      staminaDamage: rating * (heavy ? 0.85 : 0.5),
      affinity: stats.affinity ?? 'none',
      status: stats.status ?? null,
      statusAmount: stats.statusAmount ?? 0,
      knockback: heavy ? 3.2 : 1.4,
    });
    this.trail.begin(stats.trailColor ?? 0xffe0b0);
    bus.emit('player:swing', { player: this, heavy, arc: data.arc });
  }

  _applyRiposte() {
    const t = this.pendingRiposte;
    this.pendingRiposte = null;
    if (!t?.alive) return;
    const stats = this.weaponStats ?? DEFAULT_WEAPON;
    const spec = {
      source: this,
      damage: this.attackRating * 1.1,
      poiseDamage: 1e6,
      affinity: stats.affinity ?? 'none',
      critical: true,
      point: t.position.clone().setY(t.position.y + t.height * 0.55),
      direction: new THREE.Vector3().subVectors(t.position, this.position).setY(0).normalize(),
    };
    resolveHit(t, spec);
  }

  /** Attempt a critical: riposte a staggered enemy, or backstab an unaware one. */
  tryCritical(candidates) {
    if (!this.canAct) return false;
    for (const t of candidates) {
      if (!t.alive || t.faction === this.faction) continue;
      const d = Math.hypot(t.position.x - this.position.x, t.position.z - this.position.z);
      if (d > 1.7) continue;
      // Riposte a staggered enemy, or backstab one that has not seen you.
      const staggered = t.state === 'stagger' || t.staggered;
      const unaware = !t.aggro;
      if (staggered || ((unaware || t.target !== this) && isBackstab(this, t))) {
        this.pendingRiposte = t;
        t.beCriticallyHit?.(this);
        this.faceTowards(t.position.x, t.position.z, true);
        // Step to a fixed distance so the animation lines up on the target.
        const back = staggered ? 1.05 : 0.95;
        this.position.set(
          t.position.x - Math.sin(this.yaw) * back, this.position.y,
          t.position.z - Math.cos(this.yaw) * back,
        );
        this.setState(PS.RIPOSTE, { force: true });
        return true;
      }
    }
    return false;
  }

  // --- reactions ------------------------------------------------------------

  onFlinch(report) {
    if (this.state === PS.ROLL || this.state === PS.RIPOSTE) return;
    if (report.damage > this.maxHealth * 0.10 || this.state === PS.ATTACK) {
      this.setState(PS.HIT, { force: true, heavy: report.damage > this.maxHealth * 0.16 });
    }
    this.character.flash(0xffffff, 0.08);
    bus.emit('player:damaged', { player: this, report });
  }

  /**
   * A successful parry cuts its own recovery short. The parry clip is long on
   * purpose — whiffing one should hurt — but landing one has to leave you free
   * to riposte before the window closes, or the reward never arrives.
   */
  onParrySuccess() {
    if (this.state !== PS.PARRY) return;
    const cur = this.character.base.cur;
    if (cur.motion) cur.time = Math.max(cur.time, (cur.motion.duration ?? 0.6) * 0.86);
    this.canCombo = true;
  }

  onBlock(report) {
    this.character.playUpper('guardImpact', { fade: 0.03 });
    this.character.releaseUpper(0.28);
    bus.emit('player:blocked', { player: this, report });
  }

  onStagger() {
    this.setState(PS.STAGGER, { force: true });
    this.character.flash(0xffc27a, 0.14);
  }

  onDeath() {
    if (!this.alive) return;
    this.setState(PS.DEAD, { force: true });
    bus.emit('player:died', { player: this });
  }

  onLand(fallTime, impactSpeed) {
    if (impactSpeed > 6) {
      bus.emit('player:landed', { player: this, hard: impactSpeed > 12, impactSpeed });
      if (impactSpeed > 16) {
        // Fall damage past a generous threshold, scaling hard after that.
        const dmg = Math.round(this.maxHealth * clamp((impactSpeed - 16) / 14, 0, 1.2) * 0.6);
        if (dmg > 0) {
          this.health = Math.max(0, this.health - dmg);
          this.setState(PS.HIT, { force: true, heavy: true });
          if (this.health <= 0) this.onDeath();
        }
      }
    }
  }

  respawn(position, yaw = 0) {
    this.alive = true;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.focus = this.maxFocus;
    this.poise = this.maxPoise;
    this.invulnerable = 1.2;
    this.velocity.set(0, 0, 0);
    this.status.clear();
    this.setPosition(position.x, position.y, position.z);
    this.yaw = this.targetYaw = yaw;
    this.lockedOn = null;
    this.setState(PS.IDLE, { force: true });
  }

  // --- ticks ----------------------------------------------------------------

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.stateTime += dt;

    const c = this.character;
    switch (this.state) {
      case PS.ROLL:
      case PS.BACKSTEP:
      case PS.ATTACK:
      case PS.PARRY:
      case PS.RIPOSTE:
      case PS.HIT:
      case PS.STAGGER:
      case PS.DRINK:
      case PS.CAST:
      case PS.BIND:
      case PS.INTERACT:
        if (c.base.finished) this.setState(this.isGuardHeld ? PS.GUARD : PS.IDLE, { force: true });
        break;
      case PS.DEAD:
        break;
      default: break;
    }

    if (!this.grounded && this.fallTime > 0.28 && this.state !== PS.FALL
        && this.state !== PS.DEAD && this.state !== PS.ROLL) {
      this.setState(PS.FALL, { force: true });
    } else if (this.grounded && this.state === PS.FALL) {
      this.character.playFull('land', { fade: 0.06 });
      this.setState(PS.IDLE, { force: true });
    }

    this.integrate(dt, {
      acceleration: this.state === PS.ROLL || this.state === PS.BACKSTEP ? 60 : 26,
      deceleration: this.state === PS.ROLL ? 12 : 22,
    });

    // Turning is slower while committed, which is what stops attacks from
    // tracking a rolling enemy the whole way through the swing.
    const turnMult = this.state === PS.ATTACK ? 0.22
      : this.state === PS.ROLL || this.state === PS.BACKSTEP ? 0.1
        : this.state === PS.GUARD ? 0.8 : 1;
    this.turn(dt, turnMult);

    if (this.guardBroken) {
      this.guardBroken = false;
      this.setState(PS.STAGGER, { force: true });
    }
  }

  update(dt) {
    super.update(dt);

    // Sweep the weapon hitbox at render rate, so fast swings are sampled often.
    this.hitbox.sample();
    if (this.hitbox.active && this.weapon) {
      // The ribbon traces the outer part of the blade only. Tracing the full
      // hitbox draws a sheet the width of the whole sword, which reads as a
      // sail rather than a cut.
      _trailA.lerpVectors(this.hitbox.from, this.hitbox.to, 0.52);
      _trailB.lerpVectors(this.hitbox.from, this.hitbox.to, 1.0);
      this.trail.push(_trailA, _trailB);
    } else {
      this.trail.fade(dt);
    }

    // Only swap the base layer's motion while it actually belongs to
    // locomotion. Doing this unconditionally overwrites the attack, roll or
    // stagger clip one frame after it starts.
    if (LOCOMOTION_STATES.has(this.state)) {
      this.character.useLocomotion(!!this.lockedOn && this.state !== PS.SPRINT);
    }

    if (this.lockedOn?.alive) {
      // Feed the strafe blend in the character's own frame.
      const fwd = Math.sin(this.yaw), side = Math.cos(this.yaw);
      const vx = this.velocity.x, vz = this.velocity.z;
      const along = (vx * fwd + vz * side) / Math.max(1, this.runSpeed);
      const across = (vx * side - vz * fwd) / Math.max(1, this.runSpeed);
      this.character.setStrafe(clamp(-across * 1.6, -1, 1), clamp(along * 1.6, -1, 1));
      this.character.setLookAt(
        _lookTmp.set(this.lockedOn.position.x, this.lockedOn.position.y + this.lockedOn.eyeHeight, this.lockedOn.position.z),
        0.7,
      );
    } else {
      this.character.setLookAt(null);
    }
  }
}

const _lookTmp = new THREE.Vector3();
const _trailA = new THREE.Vector3();
const _trailB = new THREE.Vector3();

export const DEFAULT_WEAPON = {
  id: 'longsword',
  name: 'Ashbound Longsword',
  damage: 62,
  poiseDamage: 22,
  weight: 6,
  speed: 1,
  affinity: 'none',
  scaling: { strength: 'C', finesse: 'C' },
  trailColor: 0xffe0b0,
  stability: 0.5,
};
