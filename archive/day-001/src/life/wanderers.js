// Wanderers: the first creatures.
//
// Walking on a sphere is the part worth doing carefully, because every future
// creature will reuse it. Each wanderer carries a position `p` (a unit vector)
// and a heading `t` (a unit vector tangent to the surface at `p`). Moving
// forward is a single rigid rotation applied to BOTH vectors, which keeps the
// pair perfectly orthonormal — no drift, no creatures sinking into the ground
// or peeling off into space.

import * as THREE from 'three';
import { streamFor, pointOnSphere, range, pick } from '../core/rng.js';

const BODY_COLORS = [0xe0a35c, 0xd98b6a, 0xc9c07a, 0xb98a5e, 0xe4bd83];

const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _ahead = new THREE.Vector3();
const _aheadT = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();

/** Rotate `p` toward its heading `t` by `angle` radians, carrying `t` along. */
function stepForward(p, t, angle) {
  _axis.crossVectors(p, t).normalize();
  _quat.setFromAxisAngle(_axis, angle);
  p.applyQuaternion(_quat);
  t.applyQuaternion(_quat);
}

/** Turn in place: swing the heading around the surface normal. */
function turn(p, t, angle) {
  _quat.setFromAxisAngle(p, angle);
  t.applyQuaternion(_quat);
}

export function createWanderers({ seed, radius, terrain, count }) {
  const rng = streamFor(seed, 'wanderers');

  // Sized so they still read as creatures from the default camera distance —
  // anatomically these are very large animals, and that is the right call.
  const bodyGeo = new THREE.IcosahedronGeometry(0.23, 1);
  bodyGeo.scale(1, 0.85, 1.35);
  const headGeo = new THREE.IcosahedronGeometry(0.135, 1);
  headGeo.translate(0, 0.11, 0.27);

  const bodyMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const headMat = new THREE.MeshLambertMaterial({ flatShading: true });

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);
  bodies.name = 'wanderer-bodies';
  heads.name = 'wanderer-heads';

  const agents = [];
  const color = new THREE.Color();

  // Spawn well inland so nobody starts the world stuck on a sandbar.
  let spawned = 0;
  for (let attempt = 0; attempt < count * 200 && spawned < count; attempt++) {
    const p = pointOnSphere(rng, new THREE.Vector3());
    if (terrain.heightAt(p) < 0.15) continue;

    // Any vector perpendicular to p works as an initial heading.
    const ref = Math.abs(p.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(p, ref).normalize();
    turn(p, t, rng() * Math.PI * 2);

    agents.push({
      p,
      t,
      speed: range(rng, 0.28, 0.52),
      wander: range(rng, 0.5, 1.4),
      bobPhase: rng() * Math.PI * 2,
      bobRate: range(rng, 7, 11),
      scale: range(rng, 0.85, 1.2),
    });

    color.setHex(pick(rng, BODY_COLORS), THREE.SRGBColorSpace);
    bodies.setColorAt(spawned, color);
    heads.setColorAt(spawned, color.offsetHSL(0, 0, 0.08));
    spawned++;
  }

  bodies.count = spawned;
  heads.count = spawned;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'wanderers';
  group.add(bodies, heads);

  // The shoreline is the only obstacle so far. Look a short distance ahead
  // along the heading and check whether that spot is still dry.
  const LOOKAHEAD = 0.11; // radians of arc
  const SHORE = 0.06; // elevation considered walkable
  const SHOULDER = 1.2; // radians to either side when looking for a way out

  function update(dt, elapsed) {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];

      // Where would I be shortly if I kept going?
      _ahead.copy(a.p);
      _aheadT.copy(a.t);
      stepForward(_ahead, _aheadT, LOOKAHEAD);

      if (terrain.heightAt(_ahead) < SHORE) {
        // Water ahead. Rather than always turning the same way — which strands
        // anyone who wanders onto a spit — glance over both shoulders and
        // commit to whichever side has higher ground.
        let best = 0;
        let bestHeight = -Infinity;
        for (const side of [-1, 1]) {
          _ahead.copy(a.p);
          _aheadT.copy(a.t);
          turn(_ahead, _aheadT, side * SHOULDER);
          stepForward(_ahead, _aheadT, LOOKAHEAD);
          const h = terrain.heightAt(_ahead);
          if (h > bestHeight) {
            bestHeight = h;
            best = side;
          }
        }
        turn(a.p, a.t, best * dt * 3.6);
      } else {
        // Otherwise meander gently.
        turn(a.p, a.t, (Math.sin(elapsed * 0.7 + a.bobPhase) * a.wander) * dt * 0.6);
      }

      // Arc length s over radius r is the angle to rotate through.
      stepForward(a.p, a.t, (a.speed * dt) / radius);

      // Cheap insurance against floating-point drift over long sessions.
      a.p.normalize();
      a.t.addScaledVector(a.p, -a.p.dot(a.t)).normalize();

      const ground = terrain.heightAt(a.p);
      const bob = Math.abs(Math.sin(elapsed * a.bobRate + a.bobPhase)) * 0.05;
      _pos.copy(a.p).multiplyScalar(radius + ground + 0.19 + bob);

      // Orient the model: +Y out from the planet, +Z along the heading.
      _right.crossVectors(a.p, a.t);
      _matrix.makeBasis(_right, a.p, a.t);
      _scale.setScalar(a.scale);
      _matrix.scale(_scale);
      _matrix.setPosition(_pos);

      bodies.setMatrixAt(i, _matrix);
      heads.setMatrixAt(i, _matrix);
    }

    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  return { group, count: spawned, update };
}
