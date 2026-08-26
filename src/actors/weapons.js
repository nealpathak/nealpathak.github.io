// Weapons, built from primitives and attached to a hand bone.
//
// Each builder returns a Group whose origin is the grip point and whose +Y runs
// up the blade. Hands hold weapons by parenting at `handR` with a rotation that
// lays the blade along the forearm, so the animation clips do not need to know
// which weapon is equipped.
//
// Every weapon also declares a `reach` and a `bladeStart`/`bladeEnd` in local
// space, which is what the combat system sweeps for hits.

import * as THREE from 'three';
import { makeMaterial, makeGlowMaterial } from '../render/materials.js';
import { cachedGeometry as cached, boxGeo, mergeGeometries } from './body.js';

const _mats = new Map();
function mat(kind, color) {
  const key = `${kind}:${color}`;
  let m = _mats.get(key);
  if (m) return m;
  switch (kind) {
    case 'steel':
      m = makeMaterial({ color, roughness: 0.24, metalness: 0.92, surface: 'metal', normalScale: 0.35,
        rimColor: 0xdfe8ff, rimStrength: 0.5, rimPower: 4.0 });
      break;
    case 'darksteel':
      m = makeMaterial({ color, roughness: 0.45, metalness: 0.8, surface: 'metal', normalScale: 0.5,
        rimColor: 0xffb070, rimStrength: 0.3, rimPower: 3.4 });
      break;
    case 'wood':
      m = makeMaterial({ color, roughness: 0.86, metalness: 0.0, surface: 'cloth', normalScale: 1.1,
        rimColor: 0xffc890, rimStrength: 0.22 });
      break;
    case 'leather':
      m = makeMaterial({ color, roughness: 0.8, metalness: 0.05, surface: 'cloth', normalScale: 1.0 });
      break;
    case 'gold':
      m = makeMaterial({ color, roughness: 0.3, metalness: 1.0, surface: 'metal',
        rimColor: 0xffe9b0, rimStrength: 0.5 });
      break;
    default:
      m = makeMaterial({ color, roughness: 0.6, metalness: 0.3 });
  }
  _mats.set(key, m);
  return m;
}

/** A double-edged blade: a flattened, tapered prism with a central fuller. */
function bladeGeo(length, width, thickness, tipRatio = 0.14) {
  return cached(`blade:${length}:${width}:${thickness}:${tipRatio}`, () => {
    const w = width / 2, t = thickness / 2;
    const tipStart = length * (1 - tipRatio);
    // Six-sided cross-section extruded in two segments, then a point.
    const section = (y, sw, st) => ([
      [0, y, st], [sw, y, st * 0.35], [sw, y, -st * 0.35], [0, y, -st],
      [-sw, y, -st * 0.35], [-sw, y, st * 0.35],
    ]);
    const rings = [
      section(0, w * 0.96, t),
      section(length * 0.18, w, t),
      section(tipStart, w * 0.88, t * 0.8),
      section(length, w * 0.05, t * 0.2),
    ];
    const verts = [];
    const push = (p) => verts.push(p[0], p[1], p[2]);
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r], B = rings[r + 1];
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        push(A[i]); push(B[i]); push(B[j]);
        push(A[i]); push(B[j]); push(A[j]);
      }
    }
    // Cap the base.
    const A = rings[0];
    for (let i = 1; i < 5; i++) { push(A[0]); push(A[i + 1]); push(A[i]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
    return g;
  });
}

function gripGeo(length, r) {
  return cached(`grip:${length}:${r}`, () => {
    const g = new THREE.CylinderGeometry(r * 0.92, r, length, 8);
    g.translate(0, -length / 2, 0);
    return g;
  });
}

function addMesh(group, geo, material, { pos, rot, scale } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  group.add(m);
  return m;
}

/**
 * Weapon definitions. `grip` is the transform applied when parented to a hand.
 * `hitFrom`/`hitTo` are local-space points along the blade that the combat
 * system sweeps between frames.
 */
export const WEAPON_BUILDERS = {

  /** Ashbound Longsword — the starting weapon. Balanced, fast enough. */
  longsword({ steel = 0xc9d2de, hilt = 0x4a3a2c, pommel = 0x8a7346, glow = null } = {}) {
    const g = new THREE.Group();
    addMesh(g, bladeGeo(0.98, 0.075, 0.020), mat('steel', steel), { pos: [0, 0.12, 0] });
    addMesh(g, boxGeo(0.30, 0.035, 0.045, 0.012), mat('darksteel', pommel), { pos: [0, 0.115, 0] });
    addMesh(g, gripGeo(0.20, 0.020), mat('leather', hilt), { pos: [0, 0.10, 0] });
    addMesh(g, cached('pommelSph', () => new THREE.SphereGeometry(0.034, 10, 8)), mat('gold', pommel),
      { pos: [0, -0.115, 0] });
    if (glow) {
      const e = new THREE.Mesh(bladeGeo(0.98, 0.075, 0.020), makeGlowMaterial(glow, { opacity: 0.5 }));
      e.position.set(0, 0.12, 0); e.scale.setScalar(1.06);
      g.add(e);
    }
    g.userData = { reach: 1.15, hitFrom: [0, 0.16, 0], hitTo: [0, 1.08, 0], radius: 0.10, class: 'sword' };
    return g;
  },

  /** Vale Greatsword — slow, huge poise damage, two-handed. */
  greatsword({ steel = 0xb6bdc8, hilt = 0x33281f, pommel = 0x5e5a52 } = {}) {
    const g = new THREE.Group();
    addMesh(g, bladeGeo(1.42, 0.135, 0.030, 0.10), mat('steel', steel), { pos: [0, 0.20, 0] });
    addMesh(g, boxGeo(0.42, 0.05, 0.06, 0.016), mat('darksteel', pommel), { pos: [0, 0.19, 0] });
    addMesh(g, boxGeo(0.09, 0.09, 0.075, 0.02), mat('darksteel', pommel), { pos: [0, 0.235, 0] });
    addMesh(g, gripGeo(0.34, 0.024), mat('leather', hilt), { pos: [0, 0.175, 0] });
    addMesh(g, cached('gsPommel', () => new THREE.CylinderGeometry(0.045, 0.032, 0.07, 8)), mat('darksteel', pommel),
      { pos: [0, -0.20, 0] });
    g.userData = { reach: 1.62, hitFrom: [0, 0.24, 0], hitTo: [0, 1.60, 0], radius: 0.15, class: 'greatsword' };
    return g;
  },

  /** Choir Spear — reach and thrusts, poor at sweeping. */
  spear({ steel = 0xcdd6e2, shaft = 0x6b5436 } = {}) {
    const g = new THREE.Group();
    addMesh(g, gripGeo(1.85, 0.022), mat('wood', shaft), { pos: [0, 1.05, 0] });
    addMesh(g, bladeGeo(0.36, 0.062, 0.018, 0.4), mat('steel', steel), { pos: [0, 1.05, 0] });
    addMesh(g, cached('spearCollar', () => new THREE.CylinderGeometry(0.032, 0.028, 0.09, 8)), mat('darksteel', 0x4a4a52),
      { pos: [0, 1.02, 0] });
    addMesh(g, cached('spearButt', () => new THREE.ConeGeometry(0.026, 0.10, 8)), mat('darksteel', 0x4a4a52),
      { pos: [0, -0.85, 0], rot: [Math.PI, 0, 0] });
    g.userData = { reach: 2.05, hitFrom: [0, 1.00, 0], hitTo: [0, 1.42, 0], radius: 0.09, class: 'spear' };
    return g;
  },

  /** Husk Cleaver — an enemy weapon: crude, heavy, short. */
  cleaver({ steel = 0x8c8478, hilt = 0x3a2f26 } = {}) {
    const g = new THREE.Group();
    const blade = boxGeo(0.20, 0.62, 0.028, 0.012);
    addMesh(g, blade, mat('darksteel', steel), { pos: [0.03, 0.42, 0] });
    addMesh(g, boxGeo(0.10, 0.22, 0.03, 0.01), mat('darksteel', steel), { pos: [-0.06, 0.22, 0], rot: [0, 0, 0.3] });
    addMesh(g, gripGeo(0.24, 0.024), mat('leather', hilt), { pos: [0, 0.11, 0] });
    g.userData = { reach: 0.92, hitFrom: [0, 0.16, 0], hitTo: [0.03, 0.72, 0], radius: 0.13, class: 'axe' };
    return g;
  },

  /** Kindle Staff — the caster option. */
  staff({ wood = 0x4a3628, gem = 0xff9a4d } = {}) {
    const g = new THREE.Group();
    addMesh(g, gripGeo(1.55, 0.024), mat('wood', wood), { pos: [0, 0.78, 0] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      addMesh(g, cached('staffClaw', () => new THREE.CylinderGeometry(0.012, 0.008, 0.20, 6)), mat('darksteel', 0x4a4038),
        { pos: [Math.cos(a) * 0.055, 0.80, Math.sin(a) * 0.055], rot: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45] });
    }
    const orb = new THREE.Mesh(
      cached('staffOrb', () => new THREE.IcosahedronGeometry(0.062, 1)),
      makeGlowMaterial(gem, { opacity: 0.95, depthWrite: true }),
    );
    orb.position.set(0, 0.90, 0);
    orb.name = 'orb';
    g.add(orb);
    const light = new THREE.PointLight(gem, 2.2, 4.5, 2);
    light.position.set(0, 0.90, 0);
    g.add(light);
    g.userData = { reach: 1.5, hitFrom: [0, 0.5, 0], hitTo: [0, 0.95, 0], radius: 0.12, class: 'staff', emitter: orb };
    return g;
  },

};

/** Wakestone Shield — held in the left hand, so it gets its own entry. */
WEAPON_BUILDERS.shield = function shield({ face = 0x5b5f6b } = {}) {
  const g = new THREE.Group();
  addMesh(g, cached('shieldBody', () => {
    const shape = new THREE.Shape();
    // A heater shield: 0.36 wide, 0.48 tall, origin at the grip boss.
    shape.moveTo(-0.18, 0.19); shape.lineTo(0.18, 0.19);
    shape.bezierCurveTo(0.205, -0.02, 0.14, -0.18, 0, -0.29);
    shape.bezierCurveTo(-0.14, -0.18, -0.205, -0.02, -0.18, 0.19);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.038, bevelEnabled: true, bevelSize: 0.010, bevelThickness: 0.010,
      bevelSegments: 2, curveSegments: 10,
    });
    geo.translate(0, 0, -0.024);
    return geo;
  }), mat('darksteel', face));
  addMesh(g, cached('shieldBoss', () => new THREE.SphereGeometry(0.058, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    mat('steel', 0x8b8f9a), { pos: [0, -0.01, 0.032], rot: [Math.PI / 2, 0, 0] });
  // A rim band, which is what stops it reading as a flat plate.
  addMesh(g, cached('shieldRim', () => new THREE.TorusGeometry(0.183, 0.013, 6, 20, Math.PI)),
    mat('steel', 0x7d818c), { pos: [0, 0.012, 0.005], rot: [0, 0, 0] });
  g.userData = { reach: 0.4, class: 'shield', block: 0.78 };
  return g;
};

/** How each weapon class sits in the hand. */
export const GRIPS = {
  sword:      { bone: 'handR', pos: [0, -0.055, 0.015], rot: [Math.PI / 2 - 0.28, 0, 0] },
  greatsword: { bone: 'handR', pos: [0, -0.06, 0.02], rot: [Math.PI / 2 - 0.22, 0, 0] },
  spear:      { bone: 'handR', pos: [0, -0.05, 0.02], rot: [Math.PI / 2 - 0.35, 0, 0] },
  axe:        { bone: 'handR', pos: [0, -0.055, 0.015], rot: [Math.PI / 2 - 0.30, 0, 0] },
  staff:      { bone: 'handR', pos: [0, -0.05, 0.02], rot: [Math.PI / 2 - 0.30, 0, 0] },
  // The grip maps the shield's face normal onto the hand's -Y (out along the
  // fingers) and its top onto the hand's +Z, then slides it back down the arm
  // so the boss covers the chest rather than the face.
  shield:     { bone: 'handL', pos: [0.0, -0.05, -0.17], rot: [Math.PI / 2, 0.24, 0.14] },
};

/** Build a weapon by name and attach it to a character's hand. */
export function equipWeapon(character, name, opts = {}) {
  const build = WEAPON_BUILDERS[name];
  if (!build) { console.warn(`[weapons] unknown weapon "${name}"`); return null; }
  const obj = build(opts);
  const cls = obj.userData.class;
  const grip = GRIPS[cls] ?? GRIPS.sword;
  const scale = character.scale;
  obj.userData.name = name;
  obj.scale.setScalar(scale);
  character.body.attach(grip.bone, obj, { pos: grip.pos.map((v) => v * scale), rot: grip.rot, scale });
  if (grip.bone === 'handL') character.offhand = obj;
  else character.weapon = obj;
  return obj;
}

export { mergeGeometries };
