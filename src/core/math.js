// Minimal column-major 4x4 matrix + vec3 math. No dependencies.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach toward a target.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(m) {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function perspective(out, fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[11] = -1;
  const nf = 1 / (near - far);
  out[10] = (far + near) * nf;
  out[14] = 2 * far * near * nf;
  return out;
}

export function multiply(out, a, b) {
  // out = a * b, both column-major.
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

// Builds a view matrix from a camera position and its basis vectors.
// right/up/fwd must be orthonormal; fwd points where the camera looks.
export function viewFromBasis(out, eye, right, up, fwd) {
  // The view matrix is the inverse of the camera's world transform: since the
  // basis is orthonormal, the inverse rotation is just its transpose.
  out[0] = right[0]; out[4] = right[1]; out[8] = right[2];
  out[1] = up[0]; out[5] = up[1]; out[9] = up[2];
  out[2] = -fwd[0]; out[6] = -fwd[1]; out[10] = -fwd[2];
  out[3] = 0; out[7] = 0; out[11] = 0;
  out[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  out[13] = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
  out[14] = fwd[0] * eye[0] + fwd[1] * eye[1] + fwd[2] * eye[2];
  out[15] = 1;
  return out;
}

// Rotation matrix from yaw (Y), pitch (X), roll (Z), applied Y * X * Z.
// Column 2 is the heading, so meshes are authored facing +Z. Sign convention:
// positive yaw turns right, positive pitch raises the nose, positive roll banks right.
export function fromYawPitchRoll(out, yaw, pitch, roll) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = Math.sin(-pitch), cp = Math.cos(pitch);
  const sr = Math.sin(roll), cr = Math.cos(roll);
  out[0] = cy * cr + sy * sp * sr;
  out[1] = cp * sr;
  out[2] = -sy * cr + cy * sp * sr;
  out[3] = 0;
  out[4] = -cy * sr + sy * sp * cr;
  out[5] = cp * cr;
  out[6] = sy * sr + cy * sp * cr;
  out[7] = 0;
  out[8] = sy * cp;
  out[9] = -sp;
  out[10] = cy * cp;
  out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

export function composeTRS(out, pos, yaw, pitch, roll, scale) {
  fromYawPitchRoll(out, yaw, pitch, roll);
  const s = scale === undefined ? 1 : scale;
  for (let i = 0; i < 12; i++) out[i] *= s;
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
  return out;
}

export function invert(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export const v3 = (x = 0, y = 0, z = 0) => new Float32Array([x, y, z]);

export function setv(out, x, y, z) { out[0] = x; out[1] = y; out[2] = z; return out; }
export function copyv(out, a) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
export function addv(out, a, b) { out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2]; return out; }
export function subv(out, a, b) { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2]; return out; }
export function scalev(out, a, s) { out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s; return out; }
export function addScaled(out, a, b, s) { out[0] = a[0] + b[0] * s; out[1] = a[1] + b[1] * s; out[2] = a[2] + b[2] * s; return out; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function lengthv(a) { return Math.hypot(a[0], a[1], a[2]); }

export function normalize(out, a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-9) return setv(out, 0, 0, 0);
  return scalev(out, a, 1 / l);
}

export function cross(out, a, b) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  return setv(out, x, y, z);
}

// Extracts the three basis columns of a rotation matrix.
export function basisFrom(m, right, up, fwd) {
  setv(right, m[0], m[1], m[2]);
  setv(up, m[4], m[5], m[6]);
  setv(fwd, m[8], m[9], m[10]);
}
