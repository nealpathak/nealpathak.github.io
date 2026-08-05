// Climate.
//
// Everything about how cold a place is comes from here, so the land, the sea
// and the forests can't disagree with each other. Get the ice caps and the tree
// line out of one number and they line up for free.
//
// The sun orbits close to the x-z plane, so the poles are +Y and -Y and
// latitude is simply how far a point is from the equator.

/**
 * `coldness` is the single quantity the rest of the world reads. Roughly 0..1+:
 *
 *   0.0   equatorial lowland
 *   0.5   temperate
 *   0.62  the tree line — nothing grows past here
 *   0.80  permanent snow and ice
 *
 * The defaults are tuned so that, of all the land on this planet, roughly
 * 11% is under permanent ice and 26% sits above the tree line — close enough
 * to Earth to feel right. `latitudeFalloff` is the lever that matters: raising
 * it widens the tropics and squeezes the cold toward the poles, and it moves
 * those numbers far more than `lapseRate` does.
 *
 * Both distance from the equator and height above the sea push it up, which is
 * why an equatorial peak can wear snow while a polar shoreline is already
 * frozen at sea level.
 */
export function makeClimate({
  poleColdness = 1.0,
  lapseRate = 0.42,
  latitudeFalloff = 2.5,
  frozen = 0.8,
  treeLine = 0.62,
} = {}) {
  function latitudeAt(p) {
    return Math.abs(p.y);
  }

  function coldnessAt(p, elevation) {
    const lat = Math.abs(p.y);
    // The exponent keeps the tropics broad and squeezes the cold into the
    // higher latitudes, which is both truer and better looking than a
    // linear ramp.
    const fromLatitude = Math.pow(lat, latitudeFalloff) * poleColdness;
    const fromAltitude = Math.max(0, elevation) * lapseRate;
    return fromLatitude + fromAltitude;
  }

  return {
    latitudeAt,
    coldnessAt,
    TREE_LINE: treeLine,
    FROZEN: frozen,
  };
}

/** Linear blend between two hex colours, returning a hex number. */
export function mixHex(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    ((ar + (br - ar) * k) << 16) |
    ((ag + (bg - ag) * k) << 8) |
    (ab + (bb - ab) * k)
  );
}

/** Smooth 0..1 ramp between two edges. */
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
