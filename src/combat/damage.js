// Damage resolution. One function decides every hit in the game, so blocking,
// affinity, poise and criticals stay consistent between the player, allies and
// enemies.

import { affinityMatchup } from './affinity.js';
import { clamp } from '../core/math.js';
import { bus } from '../core/events.js';

/**
 * @typedef {object} Attack
 * @property {object} source          the attacking actor
 * @property {number} damage          attack rating before defences
 * @property {number} poiseDamage
 * @property {string} affinity
 * @property {number} [staminaDamage] drained from a blocking defender
 * @property {number} [knockback]
 * @property {boolean} [critical]     backstab or riposte
 * @property {boolean} [unblockable]
 * @property {string} [status]        applies a build-up
 * @property {number} [statusAmount]
 * @property {THREE.Vector3} [point]  where it landed, for VFX
 * @property {THREE.Vector3} [direction]
 */

export const HIT_RESULT = {
  HIT: 'hit', BLOCKED: 'blocked', PARRIED: 'parried',
  DODGED: 'dodged', IMMUNE: 'immune', KILLED: 'killed', GUARD_BROKEN: 'guardBroken',
};

/**
 * Apply an attack to a defender. Mutates the defender and returns a report the
 * caller can use for VFX, sound and UI.
 */
export function resolveHit(defender, attack) {
  if (!defender || !defender.alive) return { result: HIT_RESULT.IMMUNE, damage: 0 };

  // Invulnerability: dodge i-frames, spawn protection, cutscenes.
  if (defender.invulnerable > 0 && !attack.critical) {
    bus.emit('combat:dodged', { defender, attack });
    return { result: HIT_RESULT.DODGED, damage: 0 };
  }

  // Parry window beats everything except unblockables.
  if (defender.parryWindow > 0 && !attack.unblockable && attack.source?.parryable !== false) {
    defender.parryWindow = 0;
    const report = { result: HIT_RESULT.PARRIED, damage: 0, attack };
    bus.emit('combat:parried', { defender, attacker: attack.source, attack });
    return report;
  }

  const match = affinityMatchup(attack.affinity, defender.affinity);
  let damage = attack.damage * match.damage;
  let poise = (attack.poiseDamage ?? attack.damage * 0.35) * match.poise;
  let result = HIT_RESULT.HIT;
  let blocked = false;

  // Blocking: reduce damage by the guard's absorption, spend stamina, and if
  // the stamina runs out the guard breaks and the hit lands in full.
  if (defender.isGuarding && !attack.unblockable && defender.facingAttack(attack)) {
    const absorb = clamp(defender.guardAbsorption ?? 0.65, 0, 0.98);
    const stability = defender.guardStability ?? 0.5;
    const staminaCost = (attack.staminaDamage ?? attack.damage * 0.55) * (1 - stability * 0.6);
    if (defender.stamina >= staminaCost) {
      defender.stamina -= staminaCost;
      damage *= (1 - absorb);
      poise *= 0.25;
      blocked = true;
      result = HIT_RESULT.BLOCKED;
    } else {
      defender.stamina = 0;
      defender.guardBroken = true;
      damage *= (1 - absorb * 0.4);
      poise *= 2.0;
      result = HIT_RESULT.GUARD_BROKEN;
    }
  }

  // Defences. Flat reduction first, then a percentage, so light hits are
  // absorbed by armour and heavy ones are not.
  const flat = defender.defenceFlat ?? 0;
  const pct = clamp(defender.defencePercent ?? 0, 0, 0.85);
  damage = Math.max(damage * 0.08, (damage - flat) * (1 - pct));

  if (attack.critical) {
    damage *= attack.source?.stats?.criticalMultiplier ?? 2.0;
    poise = 1e6;   // criticals always stagger
  }

  damage = Math.max(1, Math.round(damage));
  defender.health = Math.max(0, defender.health - damage);

  // Poise. Break it and the defender is staggered and open.
  let staggered = false;
  if (!blocked || result === HIT_RESULT.GUARD_BROKEN) {
    defender.poise -= poise;
    if (defender.poise <= 0) {
      defender.poise = defender.maxPoise;
      defender.poiseRecoveryDelay = 1.1;
      staggered = true;
    } else {
      defender.poiseRecoveryDelay = 1.4;
    }
  }

  if (attack.status && attack.statusAmount) {
    defender.applyStatusBuildup?.(attack.status, attack.statusAmount);
  }

  const report = {
    result: defender.health <= 0 ? HIT_RESULT.KILLED : result,
    damage, poiseDamage: poise, staggered, blocked,
    relation: match.relation, attack,
    point: attack.point, direction: attack.direction,
  };

  bus.emit('combat:hit', { defender, attacker: attack.source, report });
  if (defender.health <= 0) {
    defender.onDeath?.(report);
    bus.emit('combat:killed', { defender, attacker: attack.source, report });
  } else if (staggered) {
    defender.onStagger?.(report);
  } else if (!blocked) {
    defender.onFlinch?.(report);
  } else {
    defender.onBlock?.(report);
  }
  return report;
}

/**
 * Is `attacker` behind `defender` and close enough for a backstab?
 * The angle is deliberately tight — backstabs should feel earned.
 */
export function isBackstab(attacker, defender, { maxAngle = 0.62, maxRange = 1.5 } = {}) {
  if (!defender.alive || defender.backstabImmune) return false;
  const dx = attacker.position.x - defender.position.x;
  const dz = attacker.position.z - defender.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > maxRange) return false;
  // Defender's forward is +Z rotated by its yaw.
  const fx = Math.sin(defender.yaw), fz = Math.cos(defender.yaw);
  const dot = (dx * fx + dz * fz) / (dist || 1);
  // dot near -1 means the attacker is directly behind.
  return dot < -Math.cos(maxAngle);
}
