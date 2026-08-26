// Procedural props. Each builder returns { object, colliders } so a zone can
// place a thing and have it block movement in the same call.
//
// Everything is built from the same handful of primitives as the characters,
// which keeps the world and the people in it looking like they belong together.

import * as THREE from 'three';
import { makeMaterial, makeGlowMaterial } from '../render/materials.js';
import { cachedGeometry as cached, boxGeo, mergeGeometries } from '../actors/body.js';
import { BoxCollider, CylinderCollider } from './collision.js';
import { makeRng } from '../core/rng.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const _mats = new Map();
function surfaceMat(key, opts) {
  let m = _mats.get(key);
  if (!m) { m = makeMaterial(opts); _mats.set(key, m); }
  return m;
}

export const PROP_MATERIALS = {
  get stone() {
    return surfaceMat('prop:stone', {
      color: 0xa6a094, surface: 'stone', roughness: 0.92, metalness: 0.02,
      normalScale: 0.9, rimColor: 0xffc38a, rimStrength: 0.10, rimPower: 3.6,
    });
  },
  get stoneDark() {
    return surfaceMat('prop:stoneDark', {
      color: 0x6a6560, surface: 'stone', roughness: 0.95, normalScale: 1.0,
      rimColor: 0xffb375, rimStrength: 0.08,
    });
  },
  get rock() {
    return surfaceMat('prop:rock', {
      color: 0x8e8d92, surface: 'rock', roughness: 0.94, normalScale: 1.1,
      rimColor: 0xffc090, rimStrength: 0.10, flatShading: true,
    });
  },
  get bark() {
    return surfaceMat('prop:bark', {
      color: 0x50412f, surface: 'rock', roughness: 0.98, normalScale: 1.4,
      rimColor: 0xffbe86, rimStrength: 0.12,
    });
  },
  get deadwood() {
    return surfaceMat('prop:deadwood', {
      color: 0x3c332a, surface: 'rock', roughness: 1.0, normalScale: 1.2,
      rimColor: 0xffb070, rimStrength: 0.16,
    });
  },
  get canopy() {
    return surfaceMat('prop:canopy', {
      color: 0x4b5738, surface: 'moss', roughness: 0.95, normalScale: 0.8,
      rimColor: 0xd8e08a, rimStrength: 0.20, wind: 0.13, side: THREE.DoubleSide,
    });
  },
  get iron() {
    return surfaceMat('prop:iron', {
      color: 0x54545c, surface: 'metal', roughness: 0.55, metalness: 0.7,
      rimColor: 0xffc9a0, rimStrength: 0.22,
    });
  },
  get cloth() {
    return surfaceMat('prop:cloth', {
      color: 0x7a2f28, surface: 'cloth', roughness: 0.96, normalScale: 1.0,
      side: THREE.DoubleSide, wind: 0.10, rimColor: 0xffb070, rimStrength: 0.24,
    });
  },
};

/**
 * Collapse a group of static meshes into one mesh per material.
 *
 * A ruined wall is authored as ninety individual blocks because that is how it
 * crumbles convincingly, but ninety draw calls per wall (and ninety more in the
 * shadow pass) is not a price worth paying for geometry that never moves again.
 * Baking each block's transform into a single merged buffer takes the whole
 * zone from four figures of draw calls to a few hundred.
 */
export function bakeStatic(group) {
  const byMaterial = new Map();
  const keep = [];
  group.updateMatrixWorld(true);

  group.traverse((o) => {
    if (!o.isMesh) return;
    // Anything animated, lit or transparent stays as it is.
    if (o.userData.noBake || o.material.transparent) { keep.push(o); return; }
    const list = byMaterial.get(o.material) ?? [];
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    o.updateMatrix();
    g.applyMatrix4(o.matrix);
    // Merging needs a consistent attribute set.
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    list.push(g);
    byMaterial.set(o.material, list);
  });

  if (!byMaterial.size) return group;

  const out = new THREE.Group();
  out.name = group.name;
  out.position.copy(group.position);
  out.rotation.copy(group.rotation);
  out.scale.copy(group.scale);

  for (const [material, geos] of byMaterial) {
    const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
    for (const g of geos) if (g !== merged) g.dispose();
  }
  for (const k of keep) {
    k.updateMatrix();
    // Re-parent survivors, preserving their world placement inside the group.
    k.removeFromParent();
    out.add(k);
  }
  return out;
}

function mesh(geo, material, { pos, rot, scale, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/** An irregular boulder: a subdivided icosahedron pushed around by noise. */
export function boulder({ radius = 1.2, seed = 1, squash = 0.68 } = {}) {
  const key = `boulder:${radius.toFixed(2)}:${seed}:${squash}`;
  const geo = cached(key, () => {
    const g = new THREE.IcosahedronGeometry(radius, 2);
    const pos = g.attributes.position;
    const rng = makeRng(seed * 2654435761);
    // Displace by a few low-frequency lobes rather than per-vertex noise, so
    // the silhouette gets facets instead of fuzz.
    const lobes = [];
    for (let i = 0; i < 5; i++) {
      lobes.push({
        dir: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
        amt: 0.14 + rng() * 0.24,
        sharp: 1.5 + rng() * 2.5,
      });
    }
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      let scale = 1;
      for (const l of lobes) scale += Math.pow(Math.max(0, n.dot(l.dir)), l.sharp) * l.amt;
      v.multiplyScalar(scale);
      v.y *= squash;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
  const object = mesh(geo, PROP_MATERIALS.rock);
  object.position.y = radius * squash * 0.55;
  const group = new THREE.Group();
  group.add(object);
  return {
    object: group,
    colliders: (origin) => [new CylinderCollider(
      new THREE.Vector3(origin.x, origin.y, origin.z), radius * 0.82, radius * squash * 1.3, { tag: 'rock' },
    )],
  };
}

/** A dead tree: a tapered trunk with a few forking branches. */
export function deadTree({ height = 7, seed = 3, lean = 0.12 } = {}) {
  const group = new THREE.Group();
  const rng = makeRng(seed * 40503 + 17);
  const mat = PROP_MATERIALS.deadwood;

  const trunkR = height * 0.045;
  const trunk = mesh(
    cached(`trunk:${height.toFixed(1)}`, () => {
      const g = new THREE.CylinderGeometry(trunkR * 0.35, trunkR, height, 7, 3);
      g.translate(0, height / 2, 0);
      return g;
    }),
    mat,
  );
  trunk.rotation.z = (rng() - 0.5) * lean;
  group.add(trunk);

  const branchCount = 4 + ((rng() * 4) | 0);
  for (let i = 0; i < branchCount; i++) {
    const t = 0.42 + rng() * 0.5;
    const len = height * (0.16 + rng() * 0.24);
    const a = rng() * Math.PI * 2;
    const pitch = 0.5 + rng() * 0.7;
    const b = mesh(
      cached(`branch:${len.toFixed(2)}`, () => {
        const g = new THREE.CylinderGeometry(trunkR * 0.12, trunkR * 0.34, len, 5, 1);
        g.translate(0, len / 2, 0);
        return g;
      }),
      mat,
    );
    b.position.y = height * t;
    b.rotation.set(Math.sin(a) * pitch, a, Math.cos(a) * pitch);
    group.add(b);
    // A forked tip, which is what makes a dead tree read as dead.
    if (rng() > 0.4) {
      const tip = mesh(
        cached(`branchTip:${len.toFixed(2)}`, () => {
          const g = new THREE.CylinderGeometry(trunkR * 0.05, trunkR * 0.14, len * 0.55, 4, 1);
          g.translate(0, len * 0.275, 0);
          return g;
        }),
        mat,
      );
      tip.position.y = len;
      tip.rotation.z = (rng() - 0.5) * 1.4;
      tip.rotation.x = (rng() - 0.5) * 1.4;
      b.add(tip);
    }
  }

  return {
    object: bakeStatic(group),
    colliders: (origin) => [new CylinderCollider(
      new THREE.Vector3(origin.x, origin.y, origin.z), trunkR * 1.6, height * 0.8, { tag: 'tree' },
    )],
  };
}

/** A living tree with a layered canopy. */
export function paleTree({ height = 9, seed = 5 } = {}) {
  const group = new THREE.Group();
  const rng = makeRng(seed * 22695477 + 3);
  const trunkR = height * 0.042;
  group.add(mesh(cached(`ptrunk:${height.toFixed(1)}`, () => {
    const g = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, height * 0.62, 8, 2);
    g.translate(0, height * 0.31, 0);
    return g;
  }), PROP_MATERIALS.bark));

  const layers = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(1, layers - 1);
    const r = height * (0.30 - t * 0.16) * (0.85 + rng() * 0.3);
    const y = height * (0.52 + t * 0.34);
    const blob = mesh(
      cached(`canopy:${r.toFixed(2)}`, () => new THREE.IcosahedronGeometry(r, 1)),
      PROP_MATERIALS.canopy,
      { pos: [(rng() - 0.5) * r * 0.5, y, (rng() - 0.5) * r * 0.5], scale: [1, 0.66, 1] },
    );
    blob.rotation.y = rng() * Math.PI;
    group.add(blob);
  }

  return {
    object: bakeStatic(group),
    colliders: (origin) => [new CylinderCollider(
      new THREE.Vector3(origin.x, origin.y, origin.z), trunkR * 1.8, height * 0.6, { tag: 'tree' },
    )],
  };
}

/**
 * A ruined wall segment: courses of blocks with pieces missing and a broken
 * top edge. This is the workhorse of the level's architecture.
 */
export function ruinWall({ length = 6, height = 3.4, thickness = 0.7, seed = 11, ruin = 0.35 } = {}) {
  const group = new THREE.Group();
  const rng = makeRng(seed * 2246822519 + 7);
  const courseH = 0.42;
  const courses = Math.max(1, Math.round(height / courseH));
  const blockW = 0.82;

  for (let c = 0; c < courses; c++) {
    // The top courses crumble away first.
    const heightFrac = c / courses;
    const missChance = ruin * (0.25 + heightFrac * heightFrac * 2.2);
    const offset = (c % 2) * blockW * 0.5;
    for (let x = -length / 2 + offset; x < length / 2; x += blockW) {
      if (rng() < missChance) continue;
      const w = blockW * (0.86 + rng() * 0.12);
      const h = courseH * (0.88 + rng() * 0.1);
      const d = thickness * (0.9 + rng() * 0.14);
      group.add(mesh(boxGeo(w, h, d, 0.035), rng() > 0.7 ? PROP_MATERIALS.stoneDark : PROP_MATERIALS.stone, {
        pos: [x + w / 2, c * courseH + h / 2, (rng() - 0.5) * 0.05],
        rot: [(rng() - 0.5) * 0.02, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.02],
      }));
    }
  }

  return {
    object: bakeStatic(group),
    colliders: (origin, rotY = 0) => [new BoxCollider(
      new THREE.Vector3(origin.x, origin.y + height * 0.45, origin.z),
      new THREE.Vector3(length / 2, height * 0.45, thickness / 2),
      rotY, { tag: 'wall' },
    )],
  };
}

/** A broken column, optionally still holding a lintel. */
export function column({ height = 4.2, radius = 0.42, broken = false, seed = 2 } = {}) {
  const group = new THREE.Group();
  const rng = makeRng(seed * 374761393 + 5);
  const h = broken ? height * (0.30 + rng() * 0.45) : height;

  group.add(mesh(cached(`colBase:${radius.toFixed(2)}`, () => {
    const g = new THREE.CylinderGeometry(radius * 1.32, radius * 1.42, 0.26, 12);
    g.translate(0, 0.13, 0);
    return g;
  }), PROP_MATERIALS.stone));

  const drums = Math.max(1, Math.round(h / 0.9));
  for (let i = 0; i < drums; i++) {
    const dh = h / drums;
    group.add(mesh(cached(`colDrum:${radius.toFixed(2)}:${dh.toFixed(2)}`, () => {
      const g = new THREE.CylinderGeometry(radius * 0.94, radius, dh, 12, 1);
      g.translate(0, dh / 2, 0);
      return g;
    }), i % 2 ? PROP_MATERIALS.stone : PROP_MATERIALS.stoneDark, {
      pos: [(rng() - 0.5) * 0.04, 0.26 + i * dh, (rng() - 0.5) * 0.04],
      rot: [0, rng() * Math.PI, 0],
    }));
  }

  if (!broken) {
    group.add(mesh(boxGeo(radius * 2.6, 0.3, radius * 2.6, 0.05), PROP_MATERIALS.stone,
      { pos: [0, 0.26 + h + 0.15, 0] }));
  }

  return {
    object: bakeStatic(group),
    colliders: (origin) => [new CylinderCollider(
      new THREE.Vector3(origin.x, origin.y, origin.z), radius * 1.15, h + 0.4, { tag: 'column' },
    )],
  };
}

/** A flight of stairs. Returns box colliders per step so they are walkable. */
export function stairs({ steps = 8, width = 3.2, rise = 0.26, run = 0.42 } = {}) {
  const group = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    group.add(mesh(boxGeo(width, rise, run, 0.02), i % 2 ? PROP_MATERIALS.stone : PROP_MATERIALS.stoneDark, {
      pos: [0, rise * (i + 0.5), run * (i + 0.5)],
    }));
    // A riser block behind each step so there is no gap to fall through.
    if (i > 0) {
      group.add(mesh(boxGeo(width, rise * i, run, 0.01), PROP_MATERIALS.stoneDark, {
        pos: [0, rise * i * 0.5, run * (i + 0.5)], shadow: false,
      }));
    }
  }
  return {
    object: bakeStatic(group),
    colliders: (origin, rotY = 0) => {
      const out = [];
      const c = Math.cos(rotY), s = Math.sin(rotY);
      for (let i = 0; i < steps; i++) {
        const lz = run * (i + 0.5);
        out.push(new BoxCollider(
          new THREE.Vector3(origin.x + s * lz, origin.y + rise * (i + 0.5) - rise * 0.5, origin.z + c * lz),
          new THREE.Vector3(width / 2, rise * (i + 1) * 0.5 + 0.02, run / 2),
          rotY, { tag: 'stairs' },
        ));
      }
      return out;
    },
  };
}

/** An archway: two piers and a stepped arch, the zone's landmark shape. */
export function archway({ span = 4.4, height = 5.2, thickness = 0.9, seed = 21 } = {}) {
  const group = new THREE.Group();
  const pierW = 1.0;
  const pierH = height * 0.62;
  for (const side of [-1, 1]) {
    const pier = ruinWall({ length: pierW, height: pierH, thickness, seed: seed + side, ruin: 0.12 });
    pier.object.position.x = side * (span / 2 + pierW / 2);
    group.add(pier.object);
  }
  // Corbelled arch: blocks stepping inward, which is how these were actually built.
  const rings = 7;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const a = Math.PI * (0.06 + t * 0.88);
    const r = span / 2 + pierW / 2;
    const x = -Math.cos(a) * r;
    const y = pierH + Math.sin(a) * (height - pierH) * 0.92;
    group.add(mesh(boxGeo(0.86, 0.44, thickness * 1.05, 0.04), i % 2 ? PROP_MATERIALS.stone : PROP_MATERIALS.stoneDark, {
      pos: [x, y, 0], rot: [0, 0, a - Math.PI / 2],
    }));
  }
  return {
    object: bakeStatic(group),
    colliders: (origin, rotY = 0) => [-1, 1].map((side) => new BoxCollider(
      new THREE.Vector3(
        origin.x + Math.cos(rotY) * side * (span / 2 + pierW / 2),
        origin.y + pierH * 0.5,
        origin.z - Math.sin(rotY) * side * (span / 2 + pierW / 2),
      ),
      new THREE.Vector3(pierW / 2, pierH / 2, thickness / 2),
      rotY, { tag: 'wall' },
    )),
  };
}

/** A tattered banner on a pole. Pure set dressing, but it sells the place. */
export function banner({ height = 4.0, color = 0x7a2f28, seed = 9 } = {}) {
  const group = new THREE.Group();
  group.add(mesh(cached(`bannerPole:${height.toFixed(1)}`, () => {
    const g = new THREE.CylinderGeometry(0.045, 0.055, height, 6);
    g.translate(0, height / 2, 0);
    return g;
  }), PROP_MATERIALS.iron));
  group.add(mesh(cached('bannerArm', () => {
    const g = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5);
    g.rotateZ(Math.PI / 2);
    return g;
  }), PROP_MATERIALS.iron, { pos: [0.4, height - 0.15, 0] }));

  const cloth = makeMaterial({
    color, surface: 'cloth', roughness: 0.96, side: THREE.DoubleSide,
    normalScale: 1.0, wind: 0.16, rimColor: 0xffb070, rimStrength: 0.26,
  });
  const rng = makeRng(seed * 668265263);
  const w = 0.8, h = height * 0.55;
  const geo = new THREE.PlaneGeometry(w, h, 5, 8);
  // Chew the bottom edge so it reads as tattered.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -h * 0.32) pos.setY(i, pos.getY(i) - rng() * h * 0.16);
  }
  geo.computeVertexNormals();
  const flag = mesh(geo, cloth, { pos: [0.42, height - 0.18 - h / 2, 0], rot: [0, Math.PI / 2, 0] });
  flag.castShadow = false;
  group.add(flag);

  return {
    object: group,
    colliders: (origin) => [new CylinderCollider(
      new THREE.Vector3(origin.x, origin.y, origin.z), 0.18, height * 0.9, { tag: 'prop' },
    )],
  };
}

/**
 * An Emberwake shrine: the checkpoint. A broken sword driven into a cairn, with
 * a flame that is the brightest thing in any zone.
 */
export function emberwake({ lit = true } = {}) {
  const group = new THREE.Group();
  group.name = 'emberwake';

  // Cairn.
  const rng = makeRng(0x5eed);
  for (let i = 0; i < 14; i++) {
    const r = 0.16 + rng() * 0.20;
    const a = rng() * Math.PI * 2;
    const rad = rng() * 0.72;
    group.add(mesh(
      cached(`cairn:${r.toFixed(2)}`, () => new THREE.IcosahedronGeometry(r, 0)),
      PROP_MATERIALS.rock,
      { pos: [Math.cos(a) * rad, 0.08 + rng() * 0.30, Math.sin(a) * rad], rot: [rng() * 3, rng() * 3, rng() * 3] },
    ));
  }
  // A flat capstone to sit the flame on.
  group.add(mesh(cached('cairnCap', () => new THREE.CylinderGeometry(0.55, 0.66, 0.16, 9)),
    PROP_MATERIALS.stoneDark, { pos: [0, 0.52, 0] }));

  // The broken sword.
  const blade = mesh(boxGeo(0.10, 1.15, 0.028, 0.012), PROP_MATERIALS.iron, { pos: [0, 1.15, 0] });
  blade.rotation.z = 0.08;
  group.add(blade);
  group.add(mesh(boxGeo(0.42, 0.06, 0.06, 0.02), PROP_MATERIALS.iron, { pos: [0, 0.86, 0], rot: [0, 0, 0.08] }));

  const flame = new THREE.Group();
  flame.name = 'flame';
  flame.position.set(0, 1.02, 0);
  const flameMat = makeGlowMaterial(0xffb257, { opacity: 0.95 });
  for (let i = 0; i < 3; i++) {
    const f = mesh(cached(`flame:${i}`, () => new THREE.IcosahedronGeometry(0.13 - i * 0.028, 1)),
      flameMat, { pos: [0, i * 0.10, 0], scale: [1, 1.8 + i * 0.4, 1], shadow: false });
    f.name = `flameLobe${i}`;
    flame.add(f);
  }
  const light = new THREE.PointLight(0xffa040, lit ? 9 : 0, 16, 2);
  light.position.y = 0.25;
  light.castShadow = false;
  light.name = 'flameLight';
  flame.add(light);
  flame.visible = lit;
  group.add(flame);

  return {
    object: group,
    flame,
    light,
    colliders: (origin) => [new CylinderCollider(
      new THREE.Vector3(origin.x, origin.y, origin.z), 0.72, 0.6, { tag: 'shrine' },
    )],
  };
}

export { mergeGeometries };
