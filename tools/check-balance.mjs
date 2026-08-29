import { Course, COURSE_LENGTH } from '../src/world/course.js';
import { Ship } from '../src/game/ship.js';
import { Run, State, formatTime } from '../src/game/run.js';
import { GhostRecorder, GhostPlayer } from '../src/game/ghost.js';
import { seedForKey } from '../src/core/rng.js';

const DT = 1/120;
const wrapPi = a => { a=(a+Math.PI)%(Math.PI*2); if(a<0)a+=Math.PI*2; return a-Math.PI; };

// Autopilot: aim at the next gate, brake into hard turns.
function pilot(ship, course, run, hug) {
  const g = course.gates[run.nextGate];
  let tx, ty, tz;
  if (g) { tx=g.x; ty=g.y; tz=g.z; }
  else { tz = ship.z + 80; tx = course.pathX(tz); ty = course.floorY(tz)+16; }
  // "hug" bot still flies through every gate, but dives toward the canyon
  // floor between gates to farm slipstream charge.
  if (hug) {
    const gap = tz - ship.z;
    if (gap > 70) ty = Math.min(ty, course.floorY(ship.z + 40) + 8);
  }
  const dz = Math.max(1, tz - ship.z);
  const desiredYaw = Math.atan2(tx - ship.x, dz);
  const steer = Math.max(-1, Math.min(1, wrapPi(desiredYaw - ship.yaw) * 2.6));
  const horiz = Math.hypot(tx - ship.x, dz);
  const desiredPitch = Math.atan2(ty - ship.y, horiz);
  const pitch = Math.max(-1, Math.min(1, (desiredPitch - ship.pitch) * 3.2));
  return { steer, pitch, brake: Math.abs(steer) > 0.85 ? 1 : 0 };
}

function runOne(key, hug, record) {
  const course = new Course(seedForKey(key), key);
  const ship = new Ship(course);
  const run = new Run(course, ship);
  const rec = record ? new GhostRecorder() : null;
  run.start();
  let steps=0, maxSpeed=0, sumSpeed=0, maxCharge=0, sumCharge=0, sumClear=0;
  const LIMIT = 120/DT;
  while (run.state === State.FLYING && steps < LIMIT) {
    const input = pilot(ship, course, run, hug);
    ship.update(DT, input);
    run.update(DT);
    if (rec) rec.sample(run.time, ship);
    maxSpeed=Math.max(maxSpeed, ship.speed); sumSpeed+=ship.speed;
    maxCharge=Math.max(maxCharge, ship.charge); sumCharge+=ship.charge;
    sumClear += ship.clearance;
    steps++;
    if (!isFinite(ship.x+ship.y+ship.z)) return { key, blewUp: true };
  }
  return {
    key, hug,
    finished: run.state === State.FINISHED,
    time: run.finalTime, raw: run.time, penalty: run.penalty,
    passed: run.passed, missed: run.missed, crashes: ship.crashCount,
    avgSpeed: sumSpeed/steps, maxSpeed, avgCharge: sumCharge/steps, maxCharge,
    avgClear: sumClear/steps, z: ship.z,
    ghost: rec ? rec.toArray() : null, steps,
  };
}

console.log('=== 12 daily courses, centre-line bot vs wall-hugging bot ===');
let allFinished = true, deltas = [];
for (let d=0; d<12; d++) {
  const key = new Date(Date.UTC(2026,7,29+d)).toISOString().slice(0,10);
  const a = runOne(key, false, false);
  const b = runOne(key, true, false);
  if (a.blewUp||b.blewUp) { console.log(key,'NUMERIC BLOWUP'); allFinished=false; continue; }
  if (!a.finished||!b.finished) allFinished=false;
  deltas.push(a.time-b.time);
  console.log(`${key}  centre ${a.finished?formatTime(a.time):'DNF@'+a.z.toFixed(0)} (${a.passed}/${a.passed+a.missed} gates, ${a.crashes} hits, chg ${a.avgCharge.toFixed(2)})   hug ${b.finished?formatTime(b.time):'DNF@'+b.z.toFixed(0)} (${b.passed}/${b.passed+b.missed}, ${b.crashes} hits, chg ${b.avgCharge.toFixed(2)})  delta ${(a.time-b.time>0?'+':'')}${(a.time-b.time).toFixed(2)}s`);
}
console.log('\nall runs finished:', allFinished);
console.log('wall-hugging faster on', deltas.filter(d=>d>0).length, '/', deltas.length, 'courses; mean gain', (deltas.reduce((s,x)=>s+x,0)/deltas.length).toFixed(2), 's');

console.log('\n=== ghost record/playback fidelity ===');
const r = runOne('2026-08-29', true, true);
const gp = new GhostPlayer(r.ghost);
console.log('ghost samples:', gp.count, 'covering', (gp.count/20).toFixed(1), 's of a', r.raw.toFixed(1), 's run');
let maxDev = 0;
for (let t=0; t<r.raw-0.1; t+=0.037) { const p = gp.at(t); if (p) maxDev = Math.max(maxDev, Math.abs(p.z - (gp.zAt(t)))); }
console.log('playback in range:', !!gp.at(1.0), ' past end returns null:', gp.at(r.raw+5)===null);
console.log('ghost z at 25%/50%/100%:', [0.25,0.5,0.99].map(f=>gp.at(r.raw*f)?.z.toFixed(0)).join(', '), 'of', COURSE_LENGTH);

console.log('\n=== framerate independence (fixed step must be deterministic) ===');
const x1 = runOne('2026-09-02', true, false);
const x2 = runOne('2026-09-02', true, false);
console.log('identical repeat runs:', x1.time===x2.time && x1.crashes===x2.crashes);
