import { Course, COURSE_LENGTH, GATE_RADIUS } from '../src/world/course.js';
import { seedForKey } from '../src/core/rng.js';

let worstCorridor = Infinity, worstCorridorInfo = '';
let worstGate = Infinity, worstGateInfo = '';
let blockedCount = 0, totalSlices = 0, pillarTotal = 0;
let wallMin = Infinity;

const DAYS = 30;
for (let d = 0; d < DAYS; d++) {
  const key = new Date(Date.UTC(2026, 7, 29 + d)).toISOString().slice(0,10);
  const c = new Course(seedForKey(key), key);

  // 1. Free lateral span at flying height, sampled every 4m down the course.
  for (let z = 0; z < COURSE_LENGTH; z += 4) {
    const cx = c.pathX(z), hw = c.halfWidth(z), fy = c.floorY(z);
    const flyY = fy + 15;
    // scan laterally for contiguous free span containing/near centre
    let free = 0, bestFree = 0;
    for (let x = cx - hw*1.6; x <= cx + hw*1.6; x += 1.0) {
      if (c.height(x, z) < flyY - 2.5) { free += 1.0; bestFree = Math.max(bestFree, free); }
      else free = 0;
    }
    totalSlices++;
    if (bestFree < 12) { blockedCount++; }
    if (bestFree < worstCorridor) { worstCorridor = bestFree; worstCorridorInfo = `${key} z=${z}`; }
  }

  // 2. Gate clearance: terrain must be clear through the whole ring aperture.
  for (const g of c.gates) {
    let minClear = Infinity;
    for (let a = 0; a < 12; a++) {
      const th = a/12*Math.PI*2;
      const px = g.x + Math.cos(th)*GATE_RADIUS*0.8;
      const pz = g.z + 0;
      const py = g.y + Math.sin(th)*GATE_RADIUS*0.8;
      minClear = Math.min(minClear, py - c.height(px, pz));
    }
    if (minClear < worstGate) { worstGate = minClear; worstGateInfo = `${key} gate#${g.i} z=${g.z}`; }
  }

  // 3. Wall containment: terrain far outside the corridor must be high.
  for (let z = 200; z < COURSE_LENGTH; z += 37) {
    const cx = c.pathX(z), hw = c.halfWidth(z), fy = c.floorY(z);
    const wl = c.height(cx - hw - 45, z) - fy;
    const wr = c.height(cx + hw + 45, z) - fy;
    wallMin = Math.min(wallMin, wl, wr);
  }

  for (let s = 0; s < COURSE_LENGTH/52; s++) if (c.pillarAt(s)) pillarTotal++;
}

console.log('=== corridor ===');
console.log('narrowest free lateral span:', worstCorridor.toFixed(1), 'm  at', worstCorridorInfo);
console.log('slices with <12m free:', blockedCount, '/', totalSlices);
console.log('=== gates ===');
console.log('worst gate aperture clearance:', worstGate.toFixed(2), 'm  at', worstGateInfo);
console.log('=== walls ===');
console.log('lowest wall 45m outside corridor:', wallMin.toFixed(1), 'm above floor');
console.log('=== pillars ===');
console.log('avg pillars per course:', (pillarTotal/DAYS).toFixed(1));

// 4. Determinism + perf
const a = new Course(seedForKey('2026-09-01'));
const b = new Course(seedForKey('2026-09-01'));
let same = true;
for (let i=0;i<500;i++){ const x=i*0.7-100, z=i*9.3; if (a.height(x,z)!==b.height(x,z)) same=false; }
console.log('deterministic across instances:', same);

const t0 = performance.now();
let acc=0;
for (let i=0;i<200000;i++) acc += a.height((i%211)-100, i*0.37);
const t1 = performance.now();
console.log('height() throughput:', (200000/(t1-t0)/1000).toFixed(1), 'M calls/sec  (chunk of 3663 verts =', ((3663*(t1-t0)/200000)).toFixed(2), 'ms)');
