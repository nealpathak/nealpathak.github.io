// Records the player's line at a fixed rate and replays their personal best
// alongside them. The ghost is the opponent -- there is no AI to write.

export const GHOST_HZ = 20;
const GHOST_DT = 1 / GHOST_HZ;
const STRIDE = 6; // x, y, z, yaw, pitch, roll

export class GhostRecorder {
  constructor() {
    this.samples = [];
    this.next = 0;
  }

  // Called every frame with the run clock; stores on a fixed grid so playback
  // can index straight into the array.
  sample(t, ship) {
    while (t >= this.next) {
      this.samples.push(ship.x, ship.y, ship.z, ship.yaw, ship.pitch, ship.roll);
      this.next += GHOST_DT;
    }
  }

  toArray() { return new Float32Array(this.samples); }
}

export class GhostPlayer {
  constructor(data) {
    this.data = data && data.length >= STRIDE * 2 ? data : null;
    this._cursor = 0;
    this.count = this.data ? Math.floor(this.data.length / STRIDE) : 0;
    this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
    this.active = false;
  }

  // Interpolated pose at run time t, or null once the ghost has finished.
  at(t) {
    if (!this.data || t < 0) { this.active = false; return null; }
    const f = t / GHOST_DT;
    const i = Math.floor(f);
    if (i >= this.count - 1) { this.active = false; return null; }
    const a = i * STRIDE;
    const b = a + STRIDE;
    const u = f - i;
    const p = this.pose;
    p.x = lerp(this.data[a], this.data[b], u);
    p.y = lerp(this.data[a + 1], this.data[b + 1], u);
    p.z = lerp(this.data[a + 2], this.data[b + 2], u);
    p.yaw = alerp(this.data[a + 3], this.data[b + 3], u);
    p.pitch = lerp(this.data[a + 4], this.data[b + 4], u);
    p.roll = alerp(this.data[a + 5], this.data[b + 5], u);
    this.active = true;
    return p;
  }

  // Distance down the course at time t, for the HUD's ahead/behind readout.
  zAt(t) {
    if (!this.data) return null;
    const i = Math.min(this.count - 1, Math.max(0, Math.floor(t / GHOST_DT)));
    return this.data[i * STRIDE + 2];
  }

  // When the ghost reached distance z. Course distance is monotonic, so a
  // pointer that only moves forward makes this O(1) amortised per frame.
  timeAtZ(z) {
    if (!this.data) return null;
    let i = this._cursor || 0;
    if (this.data[i * STRIDE + 2] > z) i = 0; // player restarted or fell back
    while (i < this.count - 1 && this.data[(i + 1) * STRIDE + 2] < z) i++;
    this._cursor = i;
    if (i >= this.count - 1) return null; // ghost never got this far
    const z0 = this.data[i * STRIDE + 2];
    const z1 = this.data[(i + 1) * STRIDE + 2];
    const u = z1 > z0 ? (z - z0) / (z1 - z0) : 0;
    return (i + u) * GHOST_DT;
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

// Angle-aware lerp so yaw does not unwind the long way round at the +/-pi seam.
function alerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
