// Birds.
//
// A flock is steered exactly like a wanderer — a unit position and a unit
// tangent heading, moved by one rigid rotation — except that it holds a
// constant turn as it goes, so its track is a slow wandering loop rather than a
// straight line. The birds themselves are offsets around that moving centre.
//
// Each flock runs a little cycle: circle for a while, drop onto land, sit,
// climb back out. Night pins them down wherever they happen to have roosted.

import * as THREE from 'three';
import { streamFor, pointOnSphere, range } from '../core/rng.js';
import { smoothstep } from '../core/climate.js';

const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();

/** Height above sea level a flock cruises at, and its clearance over hills. */
const CRUISE = 1.35;
const CLEARANCE = 0.7;

/** Somewhere worth landing: dry, and not a sheer face. */
const LANDABLE = 0.12;

function stepForward(p, t, angle) {
  _axis.crossVectors(p, t).normalize();
  _quat.setFromAxisAngle(_axis, angle);
  p.applyQuaternion(_quat);
  t.applyQuaternion(_quat);
}

function turn(p, t, angle) {
  _quat.setFromAxisAngle(p, angle);
  t.applyQuaternion(_quat);
}

/**
 * A bird: two triangles forming a chevron, wings swept back, tips raised.
 *
 * The swept shape is doing real work. Wings that meet in a plain straight V
 * look like a bird from the side and like a flat diamond from directly above —
 * and from a camera orbiting outside the planet, most birds are seen from
 * above. A chevron reads as a bird from either angle.
 *
 * Flapping is done by scaling in Y, which deepens and flattens the dihedral:
 * far cheaper than animating geometry, and at this size it reads correctly.
 */
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const w = 0.17; // half-span
  const nose = 0.09;
  const back = -0.07; // how far the tips trail behind the nose
  const notch = -0.015;
  const lift = 0.06;
  const verts = new Float32Array([
    0, 0, nose, -w, lift, back, 0, 0, notch, // left wing
    0, 0, nose, 0, 0, notch, w, lift, back, // right wing
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

export function createBirds({ seed, radius, terrain, flocks, perFlock }) {
  const rng = streamFor(seed, 'birds');

  const mesh = new THREE.InstancedMesh(
    birdGeometry(),
    new THREE.MeshLambertMaterial({
      color: 0x3a3f4a,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    flocks * perFlock
  );
  mesh.name = 'birds';

  const groups = [];
  for (let f = 0; f < flocks; f++) {
    // Start each flock somewhere over land so it has somewhere to come down.
    let p = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const c = pointOnSphere(rng, new THREE.Vector3());
      if (terrain.heightAt(c) > LANDABLE) {
        p = c;
        break;
      }
    }
    if (!p) p = pointOnSphere(rng, new THREE.Vector3());

    const ref = Math.abs(p.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(p, ref).normalize();
    turn(p, t, rng() * Math.PI * 2);

    const birds = [];
    for (let b = 0; b < perFlock; b++) {
      birds.push({
        // Where this bird sits relative to the flock's centre, in the local
        // tangent frame. Kept loose so the flock has a shape rather than
        // being a ring.
        side: range(rng, -0.55, 0.55),
        along: range(rng, -0.6, 0.6),
        lift: range(rng, -0.16, 0.16),
        flapPhase: rng() * Math.PI * 2,
        flapRate: range(rng, 7, 11),
        size: range(rng, 0.75, 1.25),
      });
    }

    groups.push({
      p,
      t,
      birds,
      speed: range(rng, 1.5, 2.3),
      // A steady turn is what makes the track a loop. Slowly varying it stops
      // the loop being a perfect, obviously mechanical circle.
      turnBase: (rng() < 0.5 ? -1 : 1) * range(rng, 0.1, 0.22),
      turnWobble: range(rng, 0.4, 0.9),
      phase: rng() * Math.PI * 2,
      altitude: CRUISE,
      state: 'cruise',
      timer: range(rng, 10, 60),
    });
  }

  const group = new THREE.Group();
  group.name = 'flocks';
  group.add(mesh);

  function update(dt, elapsed, sunDir) {
    let i = 0;

    for (const fl of groups) {
      const ground = Math.max(0, terrain.heightAt(fl.p));
      const sunHeight = sunDir ? fl.p.dot(sunDir) : 1;
      const daylight = smoothstep(-0.08, 0.1, sunHeight);

      // --- the flock's own little routine ---------------------------------
      const overLand = ground > LANDABLE;
      const night = daylight < 0.05;
      fl.timer -= dt;

      // Nothing comes down onto open water, ever — not on a whim and not
      // because night fell while the flock happened to be out over the sea.
      // A flock caught over water at dusk simply keeps flying until it finds
      // somewhere to put down.
      if (!overLand && fl.state !== 'cruise') {
        // Give it a proper stretch on the wing again, rather than a few
        // seconds — otherwise a flock that crosses water comes down the
        // instant it makes landfall, every time.
        fl.state = 'cruise';
        fl.timer = range(rng, 15, 40);
      } else if (night) {
        if (fl.state !== 'roost' && fl.state !== 'descend' && overLand) {
          fl.state = 'descend';
          fl.timer = 6;
        }
      } else if (fl.state === 'roost') {
        fl.state = 'ascend';
        fl.timer = 6;
      }

      if (fl.timer <= 0) {
        if (fl.state === 'cruise') {
          // Only go down if there's something to go down onto.
          if (overLand) {
            fl.state = 'descend';
            fl.timer = 6;
          } else {
            fl.timer = 4; // keep looking
          }
        } else if (fl.state === 'descend') {
          fl.state = night ? 'roost' : 'landed';
          fl.timer = range(rng, 8, 16);
        } else if (fl.state === 'landed') {
          fl.state = 'ascend';
          fl.timer = 6;
        } else if (fl.state === 'ascend') {
          // Long enough on the wing that a flock is usually flying when
          // you look up, rather than sitting in a field.
          fl.state = 'cruise';
          fl.timer = range(rng, 60, 140);
        }
      }

      const down = fl.state === 'descend' || fl.state === 'landed' || fl.state === 'roost';
      const grounded = fl.state === 'landed' || fl.state === 'roost';

      // --- move the flock ---------------------------------------------------
      // A descending flock holds station and drops onto the spot it chose.
      // Letting it keep travelling meant it would cross a coastline halfway
      // down, find sea beneath it, abort — and so never actually land.
      if (!grounded && fl.state !== 'descend') {
        const wobble = Math.sin(elapsed * 0.25 + fl.phase) * fl.turnWobble;
        turn(fl.p, fl.t, (fl.turnBase + fl.turnBase * wobble) * dt);
        stepForward(fl.p, fl.t, (fl.speed * dt) / radius);
        fl.p.normalize();
        fl.t.addScaledVector(fl.p, -fl.p.dot(fl.t)).normalize();
      }

      // Height is settled *after* moving, against the ground actually under
      // the flock now. Doing it before meant the altitude was always one frame
      // behind the terrain, which is enough to clip a hillside.
      const here = Math.max(0, terrain.heightAt(fl.p));

      // Cruising height follows the land, so a flock climbs over a ridge
      // instead of flying through it. Climbing is quick and settling is slow:
      // a single easing rate for both couldn't gain height fast enough.
      const targetAlt = down ? here + 0.06 : Math.max(CRUISE, here + CLEARANCE);
      const rate = targetAlt > fl.altitude ? 4.5 : 0.8;
      fl.altitude += (targetAlt - fl.altitude) * Math.min(1, dt * rate);

      // And a hard floor, so no amount of lag can put a bird inside a hill.
      if (!down) fl.altitude = Math.max(fl.altitude, here + 0.3);

      // --- place the birds --------------------------------------------------
      _side.crossVectors(fl.p, fl.t); // right-hand side of the flock

      for (const b of fl.birds) {
        // Offset within the flock, as a small rotation across the surface.
        _dir
          .copy(fl.p)
          .addScaledVector(_side, b.side * 0.06)
          .addScaledVector(fl.t, b.along * 0.06)
          .normalize();

        let r;
        if (grounded) {
          r = radius + Math.max(0, terrain.heightAt(_dir)) + 0.05;
        } else {
          r = radius + fl.altitude + b.lift;
        }
        _pos.copy(_dir).multiplyScalar(r);

        // Face along the flock's heading, flattened onto this bird's own
        // patch of sky so nobody is tilted relative to the ground below.
        _fwd.copy(fl.t).addScaledVector(_dir, -_dir.dot(fl.t));
        if (_fwd.lengthSq() < 1e-8) _fwd.copy(fl.t);
        _fwd.normalize();
        _side.crossVectors(_dir, _fwd);

        _matrix.makeBasis(_side, _dir, _fwd);
        const flap = grounded ? 0.35 : 1 + Math.sin(elapsed * b.flapRate + b.flapPhase) * 0.75;
        _scale.set(b.size, b.size * flap, b.size);
        _matrix.scale(_scale);
        _matrix.setPosition(_pos);
        mesh.setMatrixAt(i++, _matrix);

        _side.crossVectors(fl.p, fl.t); // restore for the next bird
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  }

  return { group, count: flocks * perFlock, flocks: groups, update };
}
