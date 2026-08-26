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
};
