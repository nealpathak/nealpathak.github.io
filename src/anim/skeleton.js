// The humanoid skeleton every character in the game shares.
//
// Conventions that the whole animation system depends on:
//   * Bones are stored flat, parents always before children, so a single
//     forward pass computes world matrices with no recursion.
//   * Characters face local +Z, matching Object3D.lookAt.
//   * Limb bones point along -Y in rest pose. With +Z forward that makes a
//     NEGATIVE X rotation swing a limb forward and a positive one swing it
//     back — the same convention as a standard humanoid rig. Every clip in
//     clips/ is authored against that, so read the signs carefully.
//   * Knees and elbows only ever bend one way: knee bend is +X on the shin,
//     elbow bend is -X on the forearm.
//   * Rest pose is a relaxed A-pose; clips author absolute local rotations.

import * as THREE from 'three';

/** [name, parentName|null, [x, y, z] offset from parent, [rx, ry, rz] rest euler in degrees] */
const BONE_DEFS = [
  ['root',      null,     [0, 0, 0],           [0, 0, 0]],
  ['hips',      'root',   [0, 0.95, 0],        [0, 0, 0]],
  ['spine',     'hips',   [0, 0.13, 0],        [0, 0, 0]],
  ['chest',     'spine',  [0, 0.18, 0],        [0, 0, 0]],
  ['neck',      'chest',  [0, 0.16, 0],        [0, 0, 0]],
  ['head',      'neck',   [0, 0.09, 0],        [0, 0, 0]],

  ['clavL',     'chest',  [0.06, 0.13, 0],     [0, 0, -8]],
  ['upperArmL', 'clavL',  [0.14, -0.02, 0],    [0, 0, -9]],
  ['forearmL',  'upperArmL', [0, -0.28, 0],    [-6, 0, 0]],
  ['handL',     'forearmL',  [0, -0.26, 0],    [0, 0, 0]],

  ['clavR',     'chest',  [-0.06, 0.13, 0],    [0, 0, 8]],
  ['upperArmR', 'clavR',  [-0.14, -0.02, 0],   [0, 0, 9]],
  ['forearmR',  'upperArmR', [0, -0.28, 0],    [-6, 0, 0]],
  ['handR',     'forearmR',  [0, -0.26, 0],    [0, 0, 0]],

  ['thighL',    'hips',   [0.10, -0.05, 0],    [0, 0, -1.5]],
  ['shinL',     'thighL', [0, -0.44, 0],       [3, 0, 0]],
  ['footL',     'shinL',  [0, -0.44, 0],       [-2, 0, 0]],
  ['toeL',      'footL',  [0, -0.045, 0.10],   [0, 0, 0]],

  ['thighR',    'hips',   [-0.10, -0.05, 0],   [0, 0, 1.5]],
  ['shinR',     'thighR', [0, -0.44, 0],       [3, 0, 0]],
  ['footR',     'shinR',  [0, -0.44, 0],       [-2, 0, 0]],
  ['toeR',      'footR',  [0, -0.045, 0.10],   [0, 0, 0]],
];

const DEG = Math.PI / 180;

export const BONE_NAMES = BONE_DEFS.map((b) => b[0]);
export const BONE_INDEX = Object.freeze(
  Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])),
);
export const BONE_COUNT = BONE_NAMES.length;
export const BONE_PARENT = BONE_DEFS.map((b) => (b[1] === null ? -1 : BONE_NAMES.indexOf(b[1])));

export const REST_OFFSET = BONE_DEFS.map((b) => new THREE.Vector3(...b[2]));
export const REST_ROT = BONE_DEFS.map((b) => new THREE.Quaternion().setFromEuler(
  new THREE.Euler(b[3][0] * DEG, b[3][1] * DEG, b[3][2] * DEG, 'XYZ'),
));

/** Descendant sets, precomputed so masks can be written as "chest and below it". */
function descendantsOf(rootIdx) {
  const out = new Set([rootIdx]);
  for (let i = 0; i < BONE_COUNT; i++) {
    let p = BONE_PARENT[i];
    while (p !== -1) { if (p === rootIdx) { out.add(i); break; } p = BONE_PARENT[p]; }
  }
  return out;
}

/** Build a per-bone weight array from a list of subtree roots. */
export function makeMask(rootNames, { weight = 1, includeRoots = true } = {}) {
  const mask = new Float32Array(BONE_COUNT);
  for (const name of rootNames) {
    const idx = BONE_INDEX[name];
    if (idx === undefined) { console.warn(`[skeleton] unknown bone "${name}" in mask`); continue; }
    for (const d of descendantsOf(idx)) {
      if (!includeRoots && d === idx) continue;
      mask[d] = weight;
    }
  }
  return mask;
}

/** Everything from the chest up, plus both arms. Used for attack-while-moving. */
export const UPPER_BODY_MASK = (() => {
  const m = makeMask(['chest']);
  m[BONE_INDEX.spine] = 0.55;   // let the spine partially follow, or the torso snaps
  m[BONE_INDEX.hips] = 0.15;
  return m;
})();

/** Arms only — for one-handed gestures over a full-body clip. */
export const ARMS_MASK = makeMask(['clavL', 'clavR']);

/** Head and neck, for look-at. */
export const HEAD_MASK = makeMask(['neck']);

/**
 * A pose: local rotation per bone plus an optional local position override for
 * the hips (the only bone clips are allowed to translate).
 */
export class Pose {
  constructor() {
    this.rot = Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion());
    this.hipOffset = new THREE.Vector3();
    this.scale = 1;
  }

  copyRest() {
    for (let i = 0; i < BONE_COUNT; i++) this.rot[i].copy(REST_ROT[i]);
    this.hipOffset.set(0, 0, 0);
    return this;
  }

  copy(other) {
    for (let i = 0; i < BONE_COUNT; i++) this.rot[i].copy(other.rot[i]);
    this.hipOffset.copy(other.hipOffset);
    return this;
  }

  /** Blend `other` into this pose by `t`, optionally weighted per bone. */
  blend(other, t, mask = null) {
    if (t <= 0) return this;
    for (let i = 0; i < BONE_COUNT; i++) {
      const w = mask ? mask[i] * t : t;
      if (w <= 0.0001) continue;
      this.rot[i].slerp(other.rot[i], w >= 1 ? 1 : w);
    }
    const hw = mask ? mask[BONE_INDEX.hips] * t : t;
    if (hw > 0.0001) this.hipOffset.lerp(other.hipOffset, Math.min(1, hw));
    return this;
  }

  /** Add `other` as a delta from rest — used for breathing and lean layers. */
  additive(other, t, mask = null) {
    if (t <= 0) return this;
    const tmp = _tmpQ;
    for (let i = 0; i < BONE_COUNT; i++) {
      const w = mask ? mask[i] * t : t;
      if (w <= 0.0001) continue;
      // delta = rest^-1 * other, then this = this * slerp(identity, delta, w)
      tmp.copy(REST_ROT[i]).invert().multiply(other.rot[i]);
      _tmpQ2.identity().slerp(tmp, Math.min(1, w));
      this.rot[i].multiply(_tmpQ2);
    }
    return this;
  }
}

const _tmpQ = new THREE.Quaternion();
const _tmpQ2 = new THREE.Quaternion();

/**
 * A live skeleton: an Object3D per bone, so meshes and attachment points can
 * simply be added as children and follow along for free.
 */
export class Skeleton {
  constructor(scaleFactor = 1) {
    this.scaleFactor = scaleFactor;
    this.bones = [];
    this.root = new THREE.Group();
    this.root.name = 'skeleton';

    for (let i = 0; i < BONE_COUNT; i++) {
      const b = new THREE.Object3D();
      b.name = BONE_NAMES[i];
      b.position.copy(REST_OFFSET[i]).multiplyScalar(scaleFactor);
      b.quaternion.copy(REST_ROT[i]);
      b.matrixAutoUpdate = false;
      this.bones.push(b);
      const p = BONE_PARENT[i];
      if (p === -1) this.root.add(b);
      else this.bones[p].add(b);
    }
    this.restOffsets = REST_OFFSET.map((v) => v.clone().multiplyScalar(scaleFactor));
  }

  get(name) { return this.bones[BONE_INDEX[name]]; }

  /** Push a pose onto the bone transforms and refresh matrices. */
  apply(pose) {
    const hips = this.bones[BONE_INDEX.hips];
    for (let i = 0; i < BONE_COUNT; i++) this.bones[i].quaternion.copy(pose.rot[i]);
    hips.position.copy(this.restOffsets[BONE_INDEX.hips])
      .addScaledVector(pose.hipOffset, this.scaleFactor);
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = this.bones[i];
      b.matrix.compose(b.position, b.quaternion, b.scale);
    }
    this.root.updateMatrixWorld(true);
  }

  /** World-space position of a bone. Allocates unless `out` is given. */
  worldPos(name, out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.bones[BONE_INDEX[name]].matrixWorld);
  }
}
