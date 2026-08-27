// Character bodies.
//
// There are no model files in this project, so every character is assembled out
// of primitives parented to skeleton bones: tapered capsules for flesh, rounded
// boxes for armour plates, a lathe for the helm. What makes it read as a
// character rather than a pile of shapes is silhouette — oversized pauldrons,
// a hanging fauld, a cape — plus rim lighting to cut the shape out of the fog.
//
// Geometry is cached by shape key and shared across every actor that uses it,
// so a crowd of the same enemy costs one geometry, not thirty.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterial, makeGlowMaterial } from '../render/materials.js';
import { radialSprite } from '../render/textures.js';

const geoCache = new Map();

/**
 * Materials are shared between every character built from the same look.
 * Twenty husks want one set of materials, not twenty: each distinct material
 * is a distinct shader program, and compiling a hundred and fifty of them at
 * load is a visible stall.
 */
const materialCache = new Map();

function lookSignature(look) {
  const p = look.palette;
  return [
    look.helm, look.pauldrons, look.fauld, look.cape, look.eyeGlow,
    look.rimStrength, look.metalness, look.capeColor,
    p.flesh, p.cloth, p.cloth2, p.leather, p.metal, p.metalDark, p.accent, p.eye,
  ].join('|');
}

function cached(key, build) {
  let g = geoCache.get(key);
  if (!g) { g = build(); geoCache.set(key, g); }
  return g;
}

/** A tapered capsule running from the bone origin down -Y by `len`. */
function limbGeo(len, rTop, rBot, segs = 10) {
  return cached(`limb:${len.toFixed(3)}:${rTop.toFixed(3)}:${rBot.toFixed(3)}:${segs}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, segs, 1, true);
    g.translate(0, -len / 2, 0);
    // Cap each end with a hemisphere so joints never show a seam.
    const top = new THREE.SphereGeometry(rTop, segs, Math.max(4, segs >> 1), 0, Math.PI * 2, 0, Math.PI / 2);
    const bot = new THREE.SphereGeometry(rBot, segs, Math.max(4, segs >> 1), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bot.translate(0, -len, 0);
    return mergeGeometries([g, top, bot]);
  });
}

function boxGeo(w, h, d, r = 0.02, seg = 2) {
  return cached(`box:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`, () =>
    new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49)));
}

function sphereGeo(r, w = 12, h = 10) {
  return cached(`sph:${r.toFixed(3)}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
}

/** Minimal geometry merge — enough for position/normal/uv non-indexed merges. */
function mergeGeometries(list) {
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of nonIndexed) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (g.attributes.normal) nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  for (const g of nonIndexed) if (!list.includes(g)) g.dispose();
  return out;
}

/**
 * A default humanoid look. Every field is overridable, which is how one builder
 * produces a knight, a husk, a hollow priest and a companion.
 */
export const DEFAULT_LOOK = {
  scale: 1,
  build: 1,                 // 1 = human, 1.25 = brute, 0.85 = lean
  palette: {
    flesh:   0x8a6a52,
    cloth:   0x39323c,
    cloth2:  0x5a3230,
    leather: 0x4a382c,
    metal:   0x6e6f78,
    metalDark: 0x3a3b44,
    accent:  0xffa04c,
    eye:     0xffb45c,
  },
  helm: 'greathelm',        // 'greathelm' | 'hood' | 'none' | 'crown' | 'skull'
  pauldrons: 'plate',       // 'plate' | 'cloth' | 'none' | 'spiked'
  fauld: true,              // hanging plates from the hips
  cape: true,
  capeColor: null,          // defaults to palette.cloth2
  eyeGlow: 0.9,
  rimStrength: 0.34,
  metalness: 0.55,
};

const _v = new THREE.Vector3();

export class Body {
  /**
   * @param {Skeleton} skeleton
   * @param {object} look — merged over DEFAULT_LOOK
   */
  constructor(skeleton, look = {}) {
    this.skeleton = skeleton;
    this.look = { ...DEFAULT_LOOK, ...look, palette: { ...DEFAULT_LOOK.palette, ...(look.palette ?? {}) } };
    this.parts = [];
    this.materials = [];
    this.group = skeleton.root;
    this.attachments = {};
    this.cape = null;

    this._buildMaterials();
    this._build();
    this.bakeSkinned();
  }

  /**
   * Collapse the forty-odd meshes a character is assembled from into one
   * SkinnedMesh per material.
   *
   * Each part is rigidly bound to the single bone it was parented to — weight
   * 1.0, no blending — so the result is pixel-identical to the parented
   * hierarchy it replaces. What changes is the cost: a crowd of twenty actors
   * goes from roughly eight hundred draw calls (doubled again by the shadow
   * pass) to about sixty.
   */
  bakeSkinned() {
    const bones = this.skeleton.bones;
    const root = this.skeleton.root;
    root.updateMatrixWorld(true);

    // Everything is baked into the skeleton root's frame, so the bind matrix
    // can be identity and the mesh can be parented straight to the root.
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const relative = (obj) => new THREE.Matrix4().multiplyMatrices(rootInverse, obj.matrixWorld);
    const boneInverses = bones.map((b) => relative(b).invert());

    const byMaterial = new Map();
    for (const part of this.parts) {
      const boneIndex = bones.indexOf(part.parent);
      if (boneIndex < 0) continue;
      part.updateMatrixWorld(true);

      const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      g.applyMatrix4(relative(part));
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      const count = g.attributes.position.count;
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      const idx = new Uint16Array(count * 4);
      const wgt = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) { idx[i * 4] = boneIndex; wgt[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));

      const list = byMaterial.get(part.material) ?? [];
      list.push(g);
      byMaterial.set(part.material, list);
    }
    if (!byMaterial.size) return;

    const skeleton = new THREE.Skeleton(bones, boneInverses);
    this.skinned = [];
    for (const [material, geos] of byMaterial) {
      const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.SkinnedMesh(merged, material);
      // A skinned character's bounds move with the pose, so the bind-pose
      // sphere is wrong the moment anything animates. Rather than switching
      // culling off — which forces every character in the level to be drawn —
      // widen the sphere to something no pose can leave.
      const reach = 2.2 * this.skeleton.scaleFactor;
      merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, reach * 0.45, 0), reach);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.bind(skeleton, new THREE.Matrix4());
      root.add(mesh);
      this.skinned.push(mesh);
      for (const g of geos) if (g !== merged) g.dispose();
    }

    // The originals are now redundant; keep the named attachment points so
    // callers can still find the visor and the hands.
    for (const part of this.parts) {
      if (part.name && this.attachments[part.name] === part) continue;
      part.removeFromParent();
      part.visible = false;
    }
    this.parts = this.parts.filter((p) => p.parent);
    this.bakedSkeleton = skeleton;
  }

  _buildMaterials() {
    const signature = lookSignature(this.look);
    const cached = materialCache.get(signature);
    if (cached) {
      this.mat = cached;
      this.sharedMaterials = true;
      return;
    }

    const p = this.look.palette;
    const rim = this.look.rimStrength;
    const mk = (color, opts) => {
      const m = makeMaterial({ color, rimColor: p.accent, rimStrength: rim, rimPower: 3.4, ...opts });
      this.materials.push(m);
      return m;
    };
    this.mat = {
      flesh:   mk(p.flesh, { roughness: 0.86, metalness: 0.0, surface: 'cloth', normalScale: 0.4 }),
      cloth:   mk(p.cloth, { roughness: 0.95, metalness: 0.0, surface: 'cloth', normalScale: 0.7 }),
      cloth2:  mk(p.cloth2, { roughness: 0.94, metalness: 0.0, surface: 'cloth', normalScale: 0.7 }),
      leather: mk(p.leather, { roughness: 0.78, metalness: 0.05, surface: 'cloth', normalScale: 0.9 }),
      metal:   mk(p.metal, { roughness: 0.42, metalness: this.look.metalness, surface: 'metal', normalScale: 0.6 }),
      metalDark: mk(p.metalDark, { roughness: 0.55, metalness: this.look.metalness * 0.8, surface: 'metal', normalScale: 0.6 }),
    };
    this.mat.glow = makeGlowMaterial(p.eye, { opacity: this.look.eyeGlow });
    this.materials.push(this.mat.glow);
    materialCache.set(signature, this.mat);
  }

  _add(boneName, geo, mat, { pos = null, rot = null, scale = null, shadow = true, name = '' } = {}) {
    const bone = this.skeleton.get(boneName);
    if (!bone) { console.warn(`[body] no bone "${boneName}"`); return null; }
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    if (name) { m.name = name; this.attachments[name] = m; }
    bone.add(m);
    this.parts.push(m);
    return m;
  }

  _build() {
    const s = this.skeleton.scaleFactor;
    const b = this.look.build;
    const M = this.mat;
    const L = this.look;

    // --- torso ---------------------------------------------------------------
    // Two stacked tapers: the belly from the hips, the ribcage from the spine.
    this._add('hips', limbGeo(0.15 * s, 0.155 * s * b, 0.165 * s * b, 12), M.leather, { pos: [0, 0.13 * s, 0] });
    this._add('spine', limbGeo(0.19 * s, 0.185 * s * b, 0.155 * s * b, 12), M.cloth, { pos: [0, 0.19 * s, 0] });
    // Chest plate: a rounded box is a better armour silhouette than a cylinder.
    this._add('chest', boxGeo(0.40 * s * b, 0.30 * s, 0.24 * s * b, 0.075 * s), M.metal,
      { pos: [0, 0.06 * s, 0.005 * s] });
    this._add('chest', boxGeo(0.30 * s * b, 0.10 * s, 0.255 * s * b, 0.04 * s), M.metalDark,
      { pos: [0, 0.17 * s, 0.004 * s] });
    // A collar so the neck does not read as a stick.
    this._add('chest', limbGeo(0.09 * s, 0.075 * s, 0.115 * s, 10), M.metalDark, { pos: [0, 0.20 * s, 0] });

    this._add('neck', limbGeo(0.10 * s, 0.048 * s, 0.052 * s, 8), M.flesh, { pos: [0, 0.005 * s, 0] });

    this._buildHead(s);
    this._buildArms(s, b);
    this._buildLegs(s, b);
    if (L.fauld) this._buildFauld(s, b);
    if (L.cape) this._buildCape(s);
  }

  _buildHead(s) {
    const M = this.mat, L = this.look;
    switch (L.helm) {
      case 'none': {
        this._add('head', sphereGeo(0.105 * s, 14, 12), M.flesh, { pos: [0, 0.085 * s, 0], scale: [1, 1.12, 1.02] });
        this._add('head', boxGeo(0.16 * s, 0.09 * s, 0.16 * s, 0.045 * s), M.cloth, { pos: [0, 0.135 * s, -0.005 * s] });
        this._addEyes(s, 0.085, 0.095);
        break;
      }
      case 'hood': {
        this._add('head', sphereGeo(0.10 * s, 14, 12), M.flesh, { pos: [0, 0.082 * s, 0], scale: [1, 1.1, 1] });
        const hood = this._add('head', sphereGeo(0.135 * s, 14, 12), M.cloth,
          { pos: [0, 0.086 * s, -0.012 * s], scale: [1, 1.12, 1.05] });
        hood.material = M.cloth;
        // A cowl that falls to the shoulders.
        this._add('head', limbGeo(0.20 * s, 0.145 * s, 0.20 * s, 12), M.cloth, { pos: [0, 0.13 * s, -0.02 * s] });
        this._addEyes(s, 0.078, 0.085);
        break;
      }
      case 'skull': {
        this._add('head', sphereGeo(0.10 * s, 12, 10), M.flesh, { pos: [0, 0.085 * s, 0], scale: [0.94, 1.14, 1.06] });
        this._add('head', boxGeo(0.11 * s, 0.07 * s, 0.07 * s, 0.02 * s), M.flesh, { pos: [0, 0.045 * s, 0.075 * s] });
        this._addEyes(s, 0.088, 0.078, 0.022);
        break;
      }
      case 'crown': {
        this._add('head', sphereGeo(0.105 * s, 14, 12), M.flesh, { pos: [0, 0.085 * s, 0], scale: [1, 1.12, 1.02] });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const h = (i % 2 === 0 ? 0.075 : 0.05) * s;
          this._add('head', boxGeo(0.022 * s, h, 0.022 * s, 0.006 * s), M.metal,
            { pos: [Math.cos(a) * 0.10 * s, 0.15 * s + h / 2, Math.sin(a) * 0.10 * s] });
        }
        this._add('head', limbGeo(0.045 * s, 0.112 * s, 0.112 * s, 14), M.metal, { pos: [0, 0.168 * s, 0] });
        this._addEyes(s, 0.085, 0.095);
        break;
      }
      default: {  // greathelm
        this._add('head', boxGeo(0.185 * s, 0.215 * s, 0.20 * s, 0.055 * s), M.metal, { pos: [0, 0.095 * s, 0.005 * s] });
        // Brow ridge and a keel down the face, which is what makes a helm read.
        this._add('head', boxGeo(0.20 * s, 0.035 * s, 0.205 * s, 0.014 * s), M.metalDark, { pos: [0, 0.155 * s, 0.004 * s] });
        this._add('head', boxGeo(0.028 * s, 0.16 * s, 0.045 * s, 0.012 * s), M.metalDark, { pos: [0, 0.085 * s, 0.098 * s] });
        // Visor slit.
        this._add('head', boxGeo(0.15 * s, 0.022 * s, 0.02 * s, 0.004 * s), M.glow,
          { pos: [0, 0.118 * s, 0.100 * s], shadow: false, name: 'visor' });
        // Neck guard.
        this._add('head', limbGeo(0.075 * s, 0.10 * s, 0.115 * s, 10), M.metalDark, { pos: [0, 0.0 * s, -0.005 * s] });
        break;
      }
    }
  }

  _addEyes(s, y, z, size = 0.018) {
    const g = sphereGeo(size * s, 8, 6);
    for (const x of [0.035, -0.035]) {
      this._add('head', g, this.mat.glow, { pos: [x * s, y * s, z * s], shadow: false });
    }
  }

  _buildArms(s, b) {
    const M = this.mat, L = this.look;
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? 1 : -1;
      const big = side === 'L';   // asymmetric pauldron reads as designed, not lazy

      if (L.pauldrons !== 'none') {
        const w = (big ? 0.26 : 0.22) * s * b;
        const mat = L.pauldrons === 'cloth' ? M.cloth : M.metal;
        this._add(`clav${side}`, boxGeo(w, 0.145 * s, 0.26 * s, 0.065 * s), mat,
          { pos: [sgn * 0.10 * s, 0.025 * s, 0], rot: [0, 0, sgn * -0.20] });
        this._add(`clav${side}`, boxGeo(w * 0.88, 0.105 * s, 0.235 * s, 0.05 * s), M.metalDark,
          { pos: [sgn * 0.135 * s, -0.065 * s, 0], rot: [0, 0, sgn * -0.32] });
        this._add(`clav${side}`, boxGeo(w * 0.74, 0.075 * s, 0.20 * s, 0.04 * s), mat,
          { pos: [sgn * 0.16 * s, -0.145 * s, 0], rot: [0, 0, sgn * -0.44] });
        if (L.pauldrons === 'spiked') {
          for (let i = 0; i < 3; i++) {
            this._add(`clav${side}`, cached(`spike:${s}`, () => new THREE.ConeGeometry(0.022, 0.11, 6)), M.metalDark,
              { pos: [sgn * 0.10 * s, 0.06 * s, (-0.06 + i * 0.06) * s], rot: [0, 0, sgn * -0.5] });
          }
        }
      }

      this._add(`upperArm${side}`, limbGeo(0.28 * s, 0.062 * s * b, 0.052 * s * b, 10), M.cloth,
        { pos: [0, 0, 0] });
      // Bracer over the forearm, deliberately chunkier than the arm inside it.
      this._add(`forearm${side}`, limbGeo(0.26 * s, 0.055 * s * b, 0.048 * s * b, 10), M.leather);
      this._add(`forearm${side}`, boxGeo(0.10 * s * b, 0.15 * s, 0.10 * s * b, 0.035 * s), M.metal,
        { pos: [0, -0.10 * s, 0] });
      // Hand: a mitten shape, which animates better than fingers at this scale.
      this._add(`hand${side}`, boxGeo(0.075 * s, 0.115 * s, 0.095 * s, 0.032 * s), M.metalDark,
        { pos: [0, -0.045 * s, 0.006 * s], name: `hand${side}` });
    }
  }

  _buildLegs(s, b) {
    const M = this.mat;
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? 1 : -1;
      this._add(`thigh${side}`, limbGeo(0.44 * s, 0.088 * s * b, 0.068 * s * b, 10), M.cloth);
      this._add(`thigh${side}`, boxGeo(0.15 * s * b, 0.20 * s, 0.16 * s * b, 0.05 * s), M.metalDark,
        { pos: [0, -0.10 * s, 0.005 * s] });
      this._add(`shin${side}`, limbGeo(0.44 * s, 0.068 * s * b, 0.050 * s * b, 10), M.leather);
      // Greave: front-only plate, so the calf still tapers behind it.
      this._add(`shin${side}`, boxGeo(0.115 * s * b, 0.30 * s, 0.09 * s, 0.035 * s), M.metal,
        { pos: [0, -0.17 * s, 0.035 * s] });
      this._add(`shin${side}`, boxGeo(0.12 * s * b, 0.08 * s, 0.13 * s, 0.03 * s), M.metal,
        { pos: [0, 0.0 * s, 0.005 * s] });
      // Boot.
      this._add(`foot${side}`, boxGeo(0.105 * s, 0.085 * s, 0.235 * s, 0.032 * s), M.metalDark,
        { pos: [0, -0.022 * s, 0.055 * s] });
      this._add(`toe${side}`, boxGeo(0.095 * s, 0.06 * s, 0.075 * s, 0.026 * s), M.metalDark,
        { pos: [0, 0.0 * s, 0.02 * s], rot: [sgn * 0, 0, 0] });
    }
  }

  _buildFauld(s, b) {
    // Six hanging plates. Given a little outward tilt they catch the rim light
    // and give the hips a shape that survives being seen from behind.
    const M = this.mat;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.PI / count;
      const w = 0.13 * s * b, h = 0.20 * s;
      const r = 0.135 * s * b;
      this._add('hips', boxGeo(w, h, 0.045 * s, 0.02 * s), i % 2 ? M.metalDark : M.metal, {
        pos: [Math.sin(a) * r, -0.05 * s - h / 2, Math.cos(a) * r],
        rot: [0.12, a, 0],
      });
    }
  }

  _buildCape(s) {
    // A verlet cloth pinned across the shoulders. It is the single most
    // effective piece of motion on the whole character.
    const cols = 7, rows = 9;
    const width = 0.40 * s, height = 0.85 * s;
    this.cape = new Cape(this.skeleton, {
      cols, rows, width, height,
      color: this.look.capeColor ?? this.look.palette.cloth2,
      accent: this.look.palette.accent,
      rimStrength: this.look.rimStrength,
    });
    this.materials.push(this.cape.material);
  }

  /** Attach an object to a named bone (weapons, torches, sigils). */
  attach(boneName, object, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
    const bone = this.skeleton.get(boneName);
    if (!bone) return null;
    object.position.set(pos[0], pos[1], pos[2]);
    object.rotation.set(rot[0], rot[1], rot[2]);
    object.scale.setScalar(scale);
    bone.add(object);
    return object;
  }

  setVisorGlow(v) {
    if (this.attachments.visor) this.attachments.visor.material.opacity = v;
  }

  /** Hide or show the whole body — used by distance culling. */
  setVisible(v) {
    for (const m of this.skinned ?? []) m.visible = v;
    for (const p of this.parts) p.visible = v;
    if (this.cape) this.cape.mesh.visible = v;
  }

  /**
   * Tint the whole body — the white flash on a hit.
   *
   * Materials are shared between identical characters, so flashing through the
   * material would light up every husk in the zone at once. The tint goes on
   * this body's own meshes instead, via a per-object uniform override.
   */
  setEmissive(color, intensity) {
    const meshes = this.skinned ?? [];
    for (const m of meshes) {
      if (intensity <= 0.001) {
        if (m.userData.flashMaterial) { m.material = m.userData.baseMaterial; }
        continue;
      }
      if (!m.userData.flashMaterial) {
        m.userData.baseMaterial = m.material;
        const clone = m.material.clone();
        clone.customProgramCacheKey = m.material.customProgramCacheKey;
        clone.onBeforeCompile = m.material.onBeforeCompile;
        m.userData.flashMaterial = clone;
      }
      const f = m.userData.flashMaterial;
      if (f.isMeshStandardMaterial) { f.emissive.set(color); f.emissiveIntensity = intensity; }
      m.material = f;
    }
  }

  update(dt, rootMatrix) {
    this.cape?.update(dt, rootMatrix);
  }

  dispose() {
    // `materials` is empty when this body borrowed a cached set, so shared
    // materials survive one actor being removed.
    for (const m of this.materials) m.dispose();
    for (const m of this.skinned ?? []) m.geometry.dispose();
    this.cape?.dispose();
  }
}

/** Verlet cloth cape pinned to the chest bone. */
class Cape {
  constructor(skeleton, { cols, rows, width, height, color, accent, rimStrength }) {
    this.skeleton = skeleton;
    this.cols = cols; this.rows = rows;
    this.width = width; this.height = height;

    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    this.restLen = height / (rows - 1);
    this.restLenH = width / (cols - 1);
    // Flaring the hem is what turns a hanging rectangle into a cape. Each row
    // gets its own horizontal rest length instead of one value for the sheet.
    this.rowWidth = new Float32Array(rows);
    for (let r = 0; r < rows; r++) this.rowWidth[r] = this.restLenH * (1 + (r / (rows - 1)) * 0.75);
    this.gravity = new THREE.Vector3(0, -9.0, 0);
    this._initialised = false;

    for (let c = 0; c < cols; c++) this.pinned[c] = 1;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uvs = new Float32Array(n * 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        uvs[(r * cols + c) * 2] = c / (cols - 1);
        uvs[(r * cols + c) * 2 + 1] = 1 - r / (rows - 1);
      }
    }
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b2 = a + 1, cIdx = a + cols, d = cIdx + 1;
        idx.push(a, cIdx, b2, b2, cIdx, d);
      }
    }
    this.geometry.setIndex(idx);

    this.material = makeMaterial({
      color, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
      surface: 'cloth', normalScale: 0.8,
      rimColor: accent, rimStrength: rimStrength * 1.3, rimPower: 2.6,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;   // positions are already in world space
    this.mesh.name = 'cape';

    this._anchorL = new THREE.Vector3();
    this._anchorR = new THREE.Vector3();
    this._lastAnchor = new THREE.Vector3();
    this._back = new THREE.Vector3(0, 0, -1);
    // Colliders the cloth is pushed out of, refreshed from bone positions each
    // frame. Without these the cape saws straight through the wearer's legs.
    this._colliders = [
      { bone: 'chest', offset: new THREE.Vector3(0, 0.05, -0.02), radius: 0.24, p: new THREE.Vector3() },
      { bone: 'hips', offset: new THREE.Vector3(0, 0.02, -0.02), radius: 0.22, p: new THREE.Vector3() },
      { bone: 'thighL', offset: new THREE.Vector3(0, -0.22, 0), radius: 0.15, p: new THREE.Vector3() },
      { bone: 'thighR', offset: new THREE.Vector3(0, -0.22, 0), radius: 0.15, p: new THREE.Vector3() },
    ];
    this._tmp = new THREE.Vector3();
    this._acc = 0;
    // Anything larger than this between frames is a teleport, not motion:
    // a respawn, a fast travel, or a first frame before matrices were valid.
    this.teleportThreshold = 0.6;
    this.maxStepDisplacement = 0.25;
  }

  /** Where the top row is pinned this frame, in world space. */
  _updateAnchors() {
    const chest = this.skeleton.get('chest');
    chest.updateMatrixWorld();
    const m = chest.matrixWorld;
    const s = this.skeleton.scaleFactor;
    this._anchorL.set(this.width / 2, 0.14 * s, -0.10 * s).applyMatrix4(m);
    this._anchorR.set(-this.width / 2, 0.14 * s, -0.10 * s).applyMatrix4(m);
    // The "hold it off the legs" push has to be in the wearer's frame, not the
    // world's, or the cape blows forward whenever they face -Z.
    this._back.set(0, 0, -1).transformDirection(m);

    const scale = this.skeleton.scaleFactor;
    for (const col of this._colliders) {
      const bone = this.skeleton.get(col.bone);
      col.p.copy(col.offset).multiplyScalar(scale).applyMatrix4(bone.matrixWorld);
      col.r = col.radius * scale;
    }
  }

  _seed() {
    this._updateAnchors();
    const { cols, rows } = this;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        // Seed each row already flared, and bowed slightly outward, so the
        // solver settles into a drape rather than fighting a flat sheet.
        const spread = this.rowWidth[r] / this.restLenH;
        const t = (c / (cols - 1) - 0.5) * spread + 0.5;
        this._tmp.lerpVectors(this._anchorL, this._anchorR, t);
        this.pos[i] = this._tmp.x;
        this.pos[i + 1] = this._tmp.y - r * this.restLen;
        this.pos[i + 2] = this._tmp.z - r * this.restLen * 0.18;
        this.prev[i] = this.pos[i]; this.prev[i + 1] = this.pos[i + 1]; this.prev[i + 2] = this.pos[i + 2];
      }
    }
    this._initialised = true;
    this._lastAnchor.addVectors(this._anchorL, this._anchorR).multiplyScalar(0.5);
  }

  update(dt) {
    this._updateAnchors();
    if (!this._initialised) { this._seed(); this._writeGeometry(); return; }

    // If the wearer moved further than a body length in one frame they did not
    // walk there. Re-seeding avoids a cape that flails after every respawn.
    this._tmp.addVectors(this._anchorL, this._anchorR).multiplyScalar(0.5);
    if (this._tmp.distanceTo(this._lastAnchor) > this.teleportThreshold) {
      this._seed();
      this._writeGeometry();
      return;
    }
    this._lastAnchor.copy(this._tmp);

    // Fixed sub-steps keep the cloth stable regardless of frame rate.
    this._acc = Math.min(this._acc + dt, 0.1);
    const step = 1 / 60;
    while (this._acc >= step) { this._step(step); this._acc -= step; }
    this._writeGeometry();
  }

  _step(dt) {
    const { cols, rows, pos, prev, pinned } = this;
    const n = cols * rows;
    void rows;
    const damp = 0.985;
    const gy = this.gravity.y * dt * dt;

    for (let p = 0; p < n; p++) {
      const i = p * 3;
      if (pinned[p]) {
        // Top row follows the shoulders exactly.
        const t = (p % cols) / (cols - 1);
        this._tmp.lerpVectors(this._anchorL, this._anchorR, t);
        prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2];
        pos[i] = this._tmp.x; pos[i + 1] = this._tmp.y; pos[i + 2] = this._tmp.z;
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const cur = pos[i + k];
        // Clamping velocity per axis keeps one bad frame from launching the
        // cloth into a swing it takes seconds to damp out.
        let v = (cur - prev[i + k]) * damp;
        if (v > this.maxStepDisplacement) v = this.maxStepDisplacement;
        else if (v < -this.maxStepDisplacement) v = -this.maxStepDisplacement;
        prev[i + k] = cur;
        pos[i + k] = cur + v + (k === 1 ? gy : 0);
      }
      // A light backward push, strongest at the shoulders where the cape rests
      // on the wearer's back and fading to nothing at the hem, so the cloth
      // drapes instead of standing out like a board.
      const row = (p / cols) | 0;
      const falloff = 1 - row / (rows - 1);
      const push = 1.9 * falloff * falloff * dt * dt;
      pos[i] += this._back.x * push;
      pos[i + 1] += this._back.y * push;
      pos[i + 2] += this._back.z * push;
    }

    for (let iter = 0; iter < 4; iter++) {
      this._satisfy(true);
      this._satisfy(false);
    }
    this._collide();
  }

  /** Push every free particle out of the wearer's collision spheres. */
  _collide() {
    const { pos, pinned } = this;
    const n = pos.length / 3;
    for (const col of this._colliders) {
      const cx = col.p.x, cy = col.p.y, cz = col.p.z, r = col.r;
      for (let p = 0; p < n; p++) {
        if (pinned[p]) continue;
        const i = p * 3;
        const dx = pos[i] - cx, dy = pos[i + 1] - cy, dz = pos[i + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const k = r / d;
        pos[i] = cx + dx * k;
        pos[i + 1] = cy + dy * k;
        pos[i + 2] = cz + dz * k;
      }
    }
  }

  _satisfy(vertical) {
    const { cols, rows, pos, pinned } = this;
    const maxR = vertical ? rows - 1 : rows;
    const maxC = vertical ? cols : cols - 1;
    for (let r = 0; r < maxR; r++) {
      const rest = vertical ? this.restLen : this.rowWidth[r];
      for (let c = 0; c < maxC; c++) {
        const a = r * cols + c;
        const b = vertical ? a + cols : a + 1;
        const ia = a * 3, ib = b * 3;
        let dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - rest) / d * 0.5;
        dx *= diff; dy *= diff; dz *= diff;
        if (!pinned[a]) { pos[ia] += dx; pos[ia + 1] += dy; pos[ia + 2] += dz; }
        if (!pinned[b]) { pos[ib] -= dx; pos[ib + 1] -= dy; pos[ib + 2] -= dz; }
      }
    }
  }

  _writeGeometry() {
    const attr = this.geometry.attributes.position;
    attr.array.set(this.pos);
    attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/** A soft blob shadow that sits on the ground under an actor. */
export function makeBlobShadow(radius = 0.5) {
  const geo = cached('blob', () => new THREE.PlaneGeometry(1, 1));
  const mat = new THREE.MeshBasicMaterial({
    map: radialSprite('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 128, 1.6),
    transparent: true, depthWrite: false, opacity: 1,
    blending: THREE.NormalBlending, fog: true, color: 0x000000,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(radius * 2);
  m.renderOrder = 1;
  return m;
}

export { mergeGeometries, boxGeo, limbGeo, sphereGeo, cached as cachedGeometry };
