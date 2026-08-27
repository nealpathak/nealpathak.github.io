// Small math helpers used everywhere. Kept framerate-independent on purpose:
// anything named `damp` is safe to call with a variable dt.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Exponential decay toward a target. `rate` is roughly "how many e-folds per second". */
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Same, but wraps correctly across the -PI..PI seam. */
export function dampAngle(current, target, rate, dt) {
  return current + shortestAngle(current, target) * (1 - Math.exp(-rate * dt));
}

/** Signed shortest rotation from a to b, in radians, always within -PI..PI. */
export function shortestAngle(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function moveTowards(current, target, maxDelta) {
  const d = target - current;
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
}

export function moveTowardsAngle(current, target, maxDelta) {
  const d = shortestAngle(current, target);
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
}

/**
 * Critically-damped spring. Returns the new value and writes the new velocity
 * back into `state.v`. Stable for large dt, unlike a naive spring.
 */
export function spring(current, target, state, smoothTime, dt, maxSpeed = Infinity) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  let out = current - change + (change + temp) * exp;
  // Prevent overshoot past the target when we were already closing in.
  if (target - current > 0 === out > target) { out = target; state.v = 0; }
  return out;
}

/** Ping-pong t in 0..1 -> 0..1..0 */
export const pingPong = (t) => 1 - Math.abs(((t % 1) * 2) - 1);

export function randRange(rng, a, b) { return a + rng() * (b - a); }
export function randPick(rng, arr) { return arr[(rng() * arr.length) | 0]; }

/** Weighted pick. `weights` parallel to `arr`. */
export function randWeighted(rng, arr, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}
