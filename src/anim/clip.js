// Keyframe clips.
//
// Clips are authored as plain data — bone name to a list of [time, x, y, z]
// keys in degrees, with time normalised 0..1 across the clip. They are compiled
// to quaternions once at load, then sampled with smoothstep easing between
// keys, which lets a walk cycle read well from four keys instead of twenty.

import * as THREE from 'three';
import { BONE_INDEX, BONE_COUNT, REST_ROT, Pose } from './skeleton.js';

const DEG = Math.PI / 180;
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');

export const EASE = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  // Snappy: most of the motion happens early. Attack wind-downs use this.
  snap: (t) => 1 - Math.pow(1 - t, 3),
  // Anticipation: pulls slightly backwards before going forward.
  antic: (t) => (t < 0.3 ? -0.18 * Math.sin((t / 0.3) * Math.PI) : (t - 0.3) / 0.7 * ((t - 0.3) / 0.7) * (3 - 2 * (t - 0.3) / 0.7)),
};

class Track {
  constructor(keys, ease) {
    this.times = new Float32Array(keys.length);
    this.quats = [];
    this.ease = ease;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      this.times[i] = k[0];
      _euler.set(k[1] * DEG, k[2] * DEG, k[3] * DEG, 'XYZ');
      this.quats.push(new THREE.Quaternion().setFromEuler(_euler));
    }
  }

  sample(t, out) {
    const times = this.times;
    const n = times.length;
    if (n === 1 || t <= times[0]) return out.copy(this.quats[0]);
    if (t >= times[n - 1]) return out.copy(this.quats[n - 1]);
    let i = 0;
    while (i < n - 2 && times[i + 1] < t) i++;
    const t0 = times[i], t1 = times[i + 1];
    const raw = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    return out.copy(this.quats[i]).slerp(this.quats[i + 1], this.ease(raw));
  }
}

class VecTrack {
  constructor(keys, ease) {
    this.times = new Float32Array(keys.length);
    this.vecs = [];
    this.ease = ease;
    for (let i = 0; i < keys.length; i++) {
      this.times[i] = keys[i][0];
      this.vecs.push(new THREE.Vector3(keys[i][1], keys[i][2], keys[i][3]));
    }
  }

  sample(t, out) {
    const times = this.times, n = times.length;
    if (n === 1 || t <= times[0]) return out.copy(this.vecs[0]);
    if (t >= times[n - 1]) return out.copy(this.vecs[n - 1]);
    let i = 0;
    while (i < n - 2 && times[i + 1] < t) i++;
    const t0 = times[i], t1 = times[i + 1];
    const raw = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    return out.copy(this.vecs[i]).lerp(this.vecs[i + 1], this.ease(raw));
  }
}

export class Clip {
  /**
   * @param {string} name
   * @param {object} spec
   * @param {number} spec.duration      seconds at playback rate 1
   * @param {boolean} [spec.loop]
   * @param {object} spec.tracks        boneName -> array of [t, rx, ry, rz]
   * @param {Array} [spec.hips]         [t, x, y, z] local hip translation
   * @param {Array} [spec.events]       [{ t, name, data }] fired once per play
   * @param {string} [spec.ease]        default easing for every track
   * @param {number} [spec.rootMotion]  forward metres travelled over the clip
   */
  constructor(name, spec) {
    this.name = name;
    this.duration = spec.duration ?? 1;
    this.loop = spec.loop ?? false;
    this.rootMotion = spec.rootMotion ?? 0;
    this.events = (spec.events ?? []).slice().sort((a, b) => a.t - b.t);
    this.mirror = spec.mirror ?? false;

    const defaultEase = EASE[spec.ease ?? 'smooth'] ?? EASE.smooth;
    this.tracks = new Array(BONE_COUNT).fill(null);
    for (const [bone, keys] of Object.entries(spec.tracks ?? {})) {
      const idx = BONE_INDEX[bone];
      if (idx === undefined) { console.warn(`[clip:${name}] unknown bone "${bone}"`); continue; }
      const ease = typeof keys.ease === 'string' ? (EASE[keys.ease] ?? defaultEase) : defaultEase;
      const list = Array.isArray(keys) ? keys : keys.keys;
      this.tracks[idx] = new Track(list, ease);
    }
    this.hipTrack = spec.hips ? new VecTrack(spec.hips, defaultEase) : null;

    // Which bones this clip actually animates — lets the animator skip bones a
    // clip has nothing to say about instead of snapping them to rest.
    this.affects = new Float32Array(BONE_COUNT);
    for (let i = 0; i < BONE_COUNT; i++) this.affects[i] = this.tracks[i] ? 1 : 0;
  }

  /** Write the pose at normalised time `u` (0..1) into `out`. */
  sample(u, out) {
    for (let i = 0; i < BONE_COUNT; i++) {
      const tr = this.tracks[i];
      if (tr) tr.sample(u, out.rot[i]);
      else out.rot[i].copy(REST_ROT[i]);
    }
    if (this.hipTrack) this.hipTrack.sample(u, out.hipOffset);
    else out.hipOffset.set(0, 0, 0);
    return out;
  }
}

/** Build a set of clips from a spec object. */
export function buildClips(specs) {
  const out = new Map();
  for (const [name, spec] of Object.entries(specs)) out.set(name, new Clip(name, spec));
  return out;
}

/**
 * Mirror a clip left/right. Cheaper than authoring both a left and a right
 * version of every dodge and side-step.
 */
export function mirrorClip(clip, name) {
  const spec = { duration: clip.duration, loop: clip.loop, rootMotion: clip.rootMotion, events: clip.events, tracks: {} };
  const swap = (bone) => bone.endsWith('L') ? bone.slice(0, -1) + 'R'
    : bone.endsWith('R') ? bone.slice(0, -1) + 'L' : bone;
  for (let i = 0; i < BONE_COUNT; i++) {
    const tr = clip.tracks[i];
    if (!tr) continue;
    const boneName = Object.keys(BONE_INDEX).find((k) => BONE_INDEX[k] === i);
    const keys = [];
    for (let k = 0; k < tr.times.length; k++) {
      const e = new THREE.Euler().setFromQuaternion(tr.quats[k], 'XYZ');
      // Mirroring across the YZ plane negates Y and Z rotation.
      keys.push([tr.times[k], e.x / DEG, -e.y / DEG, -e.z / DEG]);
    }
    spec.tracks[swap(boneName)] = keys;
  }
  const c = new Clip(name, spec);
  c.mirror = true;
  return c;
}

export { Pose };
