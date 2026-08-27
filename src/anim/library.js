// The shared clip library. Compiled once; every character samples the same
// Clip objects, since a Clip holds no per-instance state.

import { buildClips, mirrorClip } from './clip.js';
import { LOCOMOTION } from './clips/locomotion.js';
import { COMBAT } from './clips/combat.js';
import { BlendSpace1D, BlendSpace2D } from './animator.js';

export const CLIPS = buildClips({ ...LOCOMOTION, ...COMBAT });

// Mirrors we get for free rather than authoring twice.
CLIPS.set('strafeRight', mirrorClip(CLIPS.get('strafeLeft'), 'strafeRight'));
CLIPS.set('rollLeft', mirrorClip(CLIPS.get('roll'), 'rollLeft'));

export function clip(name) {
  const c = CLIPS.get(name);
  if (!c) throw new Error(`[anim] no clip "${name}"`);
  return c;
}

/**
 * Free-movement locomotion: one axis, driven by ground speed in m/s. The values
 * are the speeds each clip was authored for, so the blend stays foot-synced.
 */
export function makeLocomotionBlend() {
  return new BlendSpace1D([
    { motion: clip('idle'), value: 0 },
    { motion: clip('walk'), value: 1.42 },
    { motion: clip('run'), value: 3.9 },
    { motion: clip('sprint'), value: 5.6 },
  ]);
}

/** Locked-on movement: strafe/backpedal blended around a combat idle. */
export function makeStrafeBlend() {
  return new BlendSpace2D([
    { motion: clip('idleGuard'), x: 0, y: 0 },
    { motion: clip('walk'), x: 0, y: 1 },
    { motion: clip('backpedal'), x: 0, y: -1 },
    { motion: clip('strafeLeft'), x: 1, y: 0 },
    { motion: clip('strafeRight'), x: -1, y: 0 },
  ]);
}

/** Attack chains, in order. Indexing past the end wraps to the start. */
export const CHAINS = {
  light: ['attackLight1', 'attackLight2', 'attackLight3'],
  heavy: ['attackHeavy1', 'attackHeavy2'],
  thrust: ['attackThrust'],
};

/**
 * Per-weapon-class movesets.
 *
 * A greatsword that swings like a longsword is just a longsword with bigger
 * numbers. Each class gets its own chain, playback speed, lunge distance and
 * stamina cost, so the choice of weapon changes how you fight rather than only
 * how fast things die.
 *
 *   speed   playback multiplier on every attack clip
 *   lunge   metres per second of forward drive during the active window
 *   cost    stamina, light and heavy
 *   poise   multiplier on the weapon's poise damage
 */
export const MOVESETS = {
  sword: {
    light: ['attackLight1', 'attackLight2', 'attackLight3'],
    heavy: ['attackHeavy1', 'attackHeavy2'],
    running: 'attackRunning',
    speed: 1.0, lunge: { light: 1.9, heavy: 2.4 }, cost: { light: 18, heavy: 32 }, poise: 1.0,
  },
  greatsword: {
    // Two swings, both enormous. No backhand: this thing does not change
    // direction, it commits.
    light: ['attackHeavy2', 'attackHeavy1'],
    heavy: ['attackHeavy1', 'attackLight3'],
    running: 'attackHeavy1',
    speed: 0.78, lunge: { light: 2.6, heavy: 3.2 }, cost: { light: 30, heavy: 46 }, poise: 1.9,
  },
  spear: {
    // Thrust, sweep, thrust. The polearm is the one class whose identity is the
    // shape of its strike rather than its weight, so it is built on the clip
    // that measurably drives the head forward — two metres in front of the
    // player at chest height — rather than on a sweep that happens to reach.
    light: ['attackThrust', 'attackLight2', 'attackThrust'],
    heavy: ['attackHeavy1', 'attackThrust'],
    running: 'attackRunning',
    speed: 1.12, lunge: { light: 1.4, heavy: 2.0 }, cost: { light: 16, heavy: 28 }, poise: 0.88,
  },
  axe: {
    light: ['attackLight1', 'attackHeavy2'],
    heavy: ['attackHeavy1', 'attackHeavy2'],
    running: 'attackRunning',
    speed: 0.9, lunge: { light: 2.1, heavy: 2.8 }, cost: { light: 24, heavy: 38 }, poise: 1.45,
  },
  staff: {
    light: ['attackLight1', 'attackLight2'],
    heavy: ['attackHeavy1'],
    running: 'attackRunning',
    speed: 1.05, lunge: { light: 1.6, heavy: 2.0 }, cost: { light: 14, heavy: 24 }, poise: 0.62,
  },
};

export function movesetFor(weaponClass) {
  return MOVESETS[weaponClass] ?? MOVESETS.sword;
}
