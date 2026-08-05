// World time.
//
// Two different clocks live here and it's worth keeping them straight:
//
//   AGE   — how old the world is, in real days. Advances once per daily update
//           and is stored in world/state.json. A visitor never sees it tick.
//   CYCLE — the sun's orbit, which the visitor does watch. Compressed to a few
//           minutes so the terminator visibly sweeps across the planet.

export function makeClock({ cycleSeconds = 240, startAt = 0.15 } = {}) {
  let elapsed = startAt * cycleSeconds;
  // The moon takes a little longer than the sun, so the two drift in and out
  // of alignment instead of being locked together forever.
  const moonCycleSeconds = cycleSeconds * 1.618;
  let moonElapsed = 0;

  return {
    /** Advance time. `dt` is seconds since the last frame. */
    advance(dt) {
      elapsed = (elapsed + dt) % cycleSeconds;
      moonElapsed = (moonElapsed + dt) % moonCycleSeconds;
    },

    /** Position in the sun's orbit, 0..1. */
    get t() {
      return elapsed / cycleSeconds;
    },

    /** Angle of the sun around the planet, in radians. */
    get sunAngle() {
      return this.t * Math.PI * 2;
    },

    /** Angle of the moon around the planet, in radians. */
    get moonAngle() {
      return (moonElapsed / moonCycleSeconds) * Math.PI * 2;
    },
  };
}

/**
 * Name the time of day at whichever part of the planet is facing the viewer.
 *
 * `lit` is the dot product of the direction the camera looks from and the
 * direction of the sun: +1 means the face we're watching is at high noon,
 * -1 means we're looking at the middle of its night.
 */
export function phaseFromLit(lit) {
  if (lit > 0.72) return 'Midday';
  if (lit > 0.38) return 'Afternoon';
  if (lit > 0.1) return 'Golden hour';
  if (lit > -0.1) return 'Dusk';
  if (lit > -0.45) return 'Nightfall';
  return 'Deep night';
}
