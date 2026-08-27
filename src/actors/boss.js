// Bosses.
//
// A boss is an Enemy with three additions that matter: phases that change the
// move set partway through, hyper-armour so it cannot be stun-locked, and an
// arena it will not leave. Everything else — telegraphed wind-ups, committed
// attacks — is the same contract the rank and file already honour, because a
// boss that plays by different rules is a boss you cannot learn.

import * as THREE from 'three';
import { Enemy, ES } from './enemy.js';
import { bus } from '../core/events.js';
import { clamp01, randRange } from '../core/math.js';
import { makeGlowMaterial } from '../render/materials.js';

export class Boss extends Enemy {
  constructor(opts) {
    super(opts);
    this.isBoss = true;
    this.phases = this.archetype.phases ?? [];
    this.phase = 0;
    this.arena = null;
    this.engaged = false;
    this.backstabImmune = true;
    this.parryable = this.archetype.parryable ?? false;
    this._phaseTransition = 0;
    this._auraLight = null;
  }

  setArena(centre, radius) {
    this.arena = { centre: centre.clone(), radius };
    this.leashRange = radius + 6;
    return this;
  }

  engage(player) {
    if (this.engaged) return;
    this.engaged = true;
    this.provoke(player);
    bus.emit('boss:engaged', { actor: this });
    bus.emit('ui:announce', { text: this.name, kind: 'area', duration: 3.6 });
  }

  get currentPhase() { return this.phases[this.phase] ?? null; }

  _checkPhase() {
    const next = this.phases[this.phase + 1];
    if (!next) return;
    if (this.healthFraction > next.at) return;
    this.phase++;
    this._phaseTransition = next.transitionTime ?? 1.6;
    this.attacks = next.attacks ?? this.attacks;
    if (next.affinity) this.affinity = next.affinity;
    if (next.aggression != null) this.aggression = next.aggression;
    if (next.speedScale) {
      this.runSpeed = (this.archetype.runSpeed ?? 3) * next.speedScale;
      this.turnRate = (this.archetype.turnRate ?? 4) * next.speedScale;
    }
    // A visible tell: the boss lights up in its new affinity.
    this._applyAura(next.auraColour ?? 0xff7a3c);
    this.invulnerable = this._phaseTransition;
    this.hitbox.close();
    this.setState(ES.ALERT, { force: true });
    this.poise = this.maxPoise;
    bus.emit('boss:phase', { actor: this, phase: this.phase, def: next });
    bus.emit('ui:announce', { text: next.title ?? 'It is not finished', kind: 'area', duration: 2.8 });
  }

  _applyAura(colour) {
    if (!this._auraLight) {
      this._auraLight = new THREE.PointLight(colour, 0, 12, 2);
      this._auraLight.position.y = this.height * 0.6;
      this.object.add(this._auraLight);
      // Back faces only: an additive sphere drawn front-and-back is a solid
      // disc pasted over the boss. Drawing just the far side leaves a halo
      // around the silhouette instead.
      const shellMat = makeGlowMaterial(colour, { opacity: 0.16 });
      shellMat.side = THREE.BackSide;
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.15 * this.scale, 3), shellMat,
      );
      shell.position.y = this.height * 0.5;
      shell.name = 'aura';
      this.object.add(shell);
      this._auraShell = shell;
    }
    this._auraLight.color.set(colour);
    this._auraShell.material.color.set(colour);
    this._auraTarget = 6;
  }

  think(dt, player) {
    if (!this.alive) return;
    if (this._phaseTransition > 0) {
      this._phaseTransition -= dt;
      this.requestMove(0, 0, 0);
      this.faceTowards(player.position.x, player.position.z);
      this.stateTime += dt;
      return;
    }
    if (!this.engaged) {
      // A boss ignores you until you enter its arena.
      if (this.arena && player.position.distanceTo(this.arena.centre) < this.arena.radius) {
        this.engage(player);
      } else {
        this.requestMove(0, 0, 0);
        return;
      }
    }
    super.think(dt, player);
    this._checkPhase();

    // Never leave the arena: walk back rather than following the player out.
    if (this.arena) {
      const d = this.position.distanceTo(this.arena.centre);
      if (d > this.arena.radius * 0.95) {
        const dx = this.arena.centre.x - this.position.x;
        const dz = this.arena.centre.z - this.position.z;
        this.requestMove(dx, dz, this.runSpeed);
      }
    }
  }

  _disengage() {
    // Bosses do not leash away; they wait, healing, until you come back.
    this.setState(ES.ALERT, { force: true });
    this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.08);
  }

  onFlinch(report) {
    // Hyper-armour by default: only a poise break interrupts a boss.
    this.character.flash(0xffffff, 0.05);
    if (!this.aggro && report.attack?.source) this.engage(report.attack.source);
  }

  onDeath(report) {
    if (!this.alive) return;
    super.onDeath(report);
    bus.emit('boss:ended', { actor: this });
    bus.emit('ui:announce', { text: 'Ember Restored', kind: 'victory', duration: 5 });
  }

  update(dt) {
    super.update(dt);
    if (this._auraLight) {
      const want = this.alive ? (this._auraTarget ?? 0) : 0;
      this._auraLight.intensity += (want - this._auraLight.intensity) * Math.min(1, dt * 2);
      if (this._auraShell) {
        const k = 1 + Math.sin(this.stateTime * 3.1) * 0.05;
        this._auraShell.scale.setScalar(k);
        this._auraShell.material.opacity = 0.17 * clamp01(this._auraLight.intensity / 6);
      }
    }
  }
}

export { randRange };
