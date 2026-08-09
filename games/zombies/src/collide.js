// Collision: upright cylinders (player, zombies) against axis-aligned boxes.
//
// Everything moves first and is pushed back out second. At our speeds nothing
// tunnels through a wall, and push-out gives free wall-sliding, which is what
// makes strafing along a wall feel right instead of sticky.

/** @typedef {{min:{x,y,z}, max:{x,y,z}}} Box */

/**
 * Push `pos` (the cylinder's *feet*) out of any box it overlaps.
 * Mutates pos. Returns true if anything moved it.
 */
export function resolve(pos, radius, height, boxes) {
  let touched = false;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];

    // Vertical overlap first — cheapest rejection, and it's what lets us add
    // ledges later without touching this function.
    if (pos.y >= b.max.y || pos.y + height <= b.min.y) continue;

    // Closest point on the box to the cylinder's axis, in the XZ plane.
    const cx = pos.x < b.min.x ? b.min.x : (pos.x > b.max.x ? b.max.x : pos.x);
    const cz = pos.z < b.min.z ? b.min.z : (pos.z > b.max.z ? b.max.z : pos.z);

    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;

    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // Axis is inside the box. Escape along whichever face is nearest, so we
      // never eject someone through the far side of a wall.
      const left  = pos.x - b.min.x, right = b.max.x - pos.x;
      const back  = pos.z - b.min.z, front = b.max.z - pos.z;
      const m = Math.min(left, right, back, front);
      if (m === left)       pos.x = b.min.x - radius;
      else if (m === right) pos.x = b.max.x + radius;
      else if (m === back)  pos.z = b.min.z - radius;
      else                  pos.z = b.max.z + radius;
    }
    touched = true;
  }

  return touched;
}

/** Would a cylinder at (x, z) overlap anything? Used for spawn placement. */
export function blocked(x, y, z, radius, height, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (y >= b.max.y || y + height <= b.min.y) continue;
    const cx = x < b.min.x ? b.min.x : (x > b.max.x ? b.max.x : x);
    const cz = z < b.min.z ? b.min.z : (z > b.max.z ? b.max.z : z);
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
