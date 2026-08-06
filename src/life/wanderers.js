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
import { smoothstep } from '../core/climate.js';

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
      // How high the sun must be before this one gets up. Spread across the
      // population so dawn arrives as a ragged wave of individuals waking,
      // rather than the whole hemisphere switching on at once.
      wakesAt: range(rng, -0.1, 0.12),
      // Slow rise and fall while asleep.
      breathRate: range(rng, 0.9, 1.5),
      // Where this one is heading for the night, and how much it cares.
      goal: null,
      dusk: 0,
      crowded: false,
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

  // Roosting. All distances are angles of arc, so they're independent of the
  // planet's radius.
  const ROOST_RADIUS = 0.5; // how far away a companion still counts as nearby
  const COMFORT = 0.045; // any closer than this and it's too crowded
  const COS_ROOST = Math.cos(ROOST_RADIUS);
  const COS_COMFORT = Math.cos(COMFORT);

  // Finding neighbours is the one O(n^2) thing here. It doesn't need to happen
  // every frame — a herd forms over tens of seconds — so it runs periodically
  // and each creature steers toward the last answer in between.
  const REGROUP_EVERY = 12;
  let regroupCounter = 0;

  const _goal = new THREE.Vector3();
  const _desired = new THREE.Vector3();
  const _cross = new THREE.Vector3();

  /**
   * Pick somewhere for each creature to head as the light goes. Neighbours pull
   * a creature in; a neighbour that's too close pushes it back out again, which
   * is what keeps a herd a loose group rather than a single stack of bodies.
   */
  function regroup() {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.crowded = false;

      let count = 0;
      let nearestDot = -1;
      let nearest = null;
      _goal.set(0, 0, 0);

      for (let j = 0; j < agents.length; j++) {
        if (j === i) continue;
        const d = a.p.dot(agents[j].p);
        if (d < COS_ROOST) continue;
        _goal.add(agents[j].p);
        count++;
        if (d > nearestDot) {
          nearestDot = d;
          nearest = agents[j].p;
        }
      }

      if (count === 0) {
        a.goal = null;
      } else if (nearestDot > COS_COMFORT) {
        // Too close for comfort — back off from whoever it is. Personal space
        // applies around the clock, not only while gathering, or creatures
        // would walk straight through each other all day.
        a.crowded = true;
        a.goal = awayFrom(a, nearest, a.goal || new THREE.Vector3());
      } else if (a.dusk < 0.05) {
        a.goal = null;
      } else {
        a.goal = (a.goal || new THREE.Vector3()).copy(_goal).normalize();
      }
    }
  }

  /**
   * A point to walk to in order to get away from `other`.
   *
   * The tempting one-liner — reflect through your own position, `2p - other` —
   * is wrong exactly when it matters: as two creatures converge it tends toward
   * `p` itself, which has no tangential component at all, so the steering has
   * no direction to act on and two overlapping creatures stay overlapping.
   * Take the separation along the ground instead.
   */
  function awayFrom(a, other, out) {
    _desired.copy(a.p).sub(other);
    _desired.addScaledVector(a.p, -a.p.dot(_desired)); // flatten onto the ground
    if (_desired.lengthSq() < 1e-12) _desired.copy(a.t); // exactly stacked; any way will do
    _desired.normalize();
    return out.copy(a.p).addScaledVector(_desired, 0.25).normalize();
  }

  /** Steer the heading toward `goal`, at most `maxTurn` radians. */
  function steerToward(a, goal, maxTurn) {
    _desired.copy(goal).addScaledVector(a.p, -a.p.dot(goal));
    if (_desired.lengthSq() < 1e-10) return;
    _desired.normalize();

    const cos = Math.max(-1, Math.min(1, a.t.dot(_desired)));
    _cross.crossVectors(a.t, _desired);
    const sign = _cross.dot(a.p) < 0 ? -1 : 1;
    const angle = Math.acos(cos) * sign;
    turn(a.p, a.t, Math.max(-maxTurn, Math.min(maxTurn, angle)));
  }

  function update(dt, elapsed, sunDir) {
    if (regroupCounter-- <= 0) {
      regroupCounter = REGROUP_EVERY;
      regroup();
    }

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];

      // How high the sun stands where this creature is standing: +1 with the
      // sun overhead, 0 at sunrise and sunset, negative through the night.
      // This is what makes the day/night cycle something the world experiences
      // rather than only something the renderer draws.
      const sunHeight = sunDir ? a.p.dot(sunDir) : 1;
      const awake = smoothstep(a.wakesAt - 0.06, a.wakesAt + 0.2, sunHeight);

      // How strongly the evening is pulling this one toward company. It starts
      // well before sunset, because a creature that only began looking for
      // company at dusk would have no time left to walk anywhere.
      a.dusk = smoothstep(0.62, 0.02, sunHeight);

      if (awake < 0.02) {
        // Asleep. Still breathing, but going nowhere — unless somebody has
        // bedded down on top of them, in which case they'll shuffle over
        // without properly waking. Sleepers freeze, so without this two
        // creatures that settle too close stay overlapping until morning.
        if (a.crowded && a.goal) {
          steerToward(a, a.goal, 1.0 * dt);
          stepForward(a.p, a.t, (a.speed * 0.3 * dt) / radius);
          a.p.normalize();
          a.t.addScaledVector(a.p, -a.p.dot(a.t)).normalize();
        }
        restAt(a, i, elapsed);
        continue;
      }

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
      } else if (a.goal && (a.dusk > 0.05 || a.crowded)) {
        // Heading for company, or stepping out of someone's way. Dry ground
        // still wins — the check above runs first — so herds form island by
        // island rather than across water.
        steerToward(a, a.goal, Math.max(1.5, 2.0 * a.dusk) * dt);
      } else {
        // Otherwise meander gently.
        turn(a.p, a.t, (Math.sin(elapsed * 0.7 + a.bobPhase) * a.wander) * dt * 0.6 * (1 - a.dusk));
      }

      // Slowest at first light and again as the sun goes down; briskest with
      // the sun well up. Arc length s over radius r is the angle to rotate
      // through.
      const pace = (0.25 + 0.75 * awake) * (0.72 + 0.4 * Math.max(0, sunHeight));
      stepForward(a.p, a.t, (a.speed * pace * dt) / radius);

      // Cheap insurance against floating-point drift over long sessions.
      a.p.normalize();
      a.t.addScaledVector(a.p, -a.p.dot(a.t)).normalize();

      const ground = terrain.heightAt(a.p);
      const bob = Math.abs(Math.sin(elapsed * a.bobRate + a.bobPhase)) * 0.05 * awake;
      place(a, i, ground, bob, 1);
    }

    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  /** Settled for the night: lower to the ground, breathing slowly. */
  function restAt(a, i, elapsed) {
    const ground = terrain.heightAt(a.p);
    const breath = Math.sin(elapsed * a.breathRate + a.bobPhase) * 0.012;
    place(a, i, ground, breath - 0.05, 0.88);
  }

  /** Write one creature's transform. `squash` flattens a sleeping body. */
  function place(a, i, ground, lift, squash) {
    _pos.copy(a.p).multiplyScalar(radius + ground + 0.19 + lift);

    // Orient the model: +Y out from the planet, +Z along the heading.
    _right.crossVectors(a.p, a.t);
    _matrix.makeBasis(_right, a.p, a.t);
    _scale.set(a.scale, a.scale * squash, a.scale);
    _matrix.scale(_scale);
    _matrix.setPosition(_pos);

    bodies.setMatrixAt(i, _matrix);
    heads.setMatrixAt(i, _matrix);
  }

  // `agents` is exposed for inspection from the console alongside the rest of
  // window.world; behaviour like herding is far easier to check by reading the
  // creatures' own state than by staring at the screen.
  return { group, count: spawned, agents, update };
}
