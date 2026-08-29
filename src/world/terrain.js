// Streams the canyon as a ring of GPU chunks. Chunk grids are path-relative --
// each row of vertices is centred on the canyon centreline -- so neighbouring
// chunks share their boundary rows exactly and the surface is seamless.

export const CHUNK_LEN = 64;   // metres of course per chunk
const NZ = 32;                 // rows per chunk  -> 2m spacing
const NX = 110;                // columns         -> 2m spacing
const HALF_SPAN = 110;         // metres either side of the centreline
const DZ = CHUNK_LEN / NZ;
const DX = (HALF_SPAN * 2) / NX;
const VERTS = (NX + 1) * (NZ + 1);
const FLOATS_PER_VERT = 4;     // x, y, z, lateral-position
export const CHUNKS_AHEAD = 9;
const CHUNKS_BEHIND = 1;
const POOL = CHUNKS_AHEAD + CHUNKS_BEHIND + 2;

export class Terrain {
  constructor(gl, course, attribLocs) {
    this.gl = gl;
    this.course = course;
    this.live = new Map();   // chunk index -> slot
    this.free = [];
    this.scratch = new Float32Array(VERTS * FLOATS_PER_VERT);

    // One index buffer serves every chunk: the topology never changes.
    const idx = new Uint16Array(NX * NZ * 6);
    let o = 0;
    for (let iz = 0; iz < NZ; iz++) {
      for (let ix = 0; ix < NX; ix++) {
        const a = iz * (NX + 1) + ix;
        const b = a + 1;
        const c = a + (NX + 1);
        const d = c + 1;
        // CCW when viewed from above (+Y), matching gl.CULL_FACE / BACK.
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    this.indexCount = idx.length;
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    const stride = FLOATS_PER_VERT * 4;
    for (let i = 0; i < POOL; i++) {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.scratch.byteLength, gl.DYNAMIC_DRAW);
      const va = gl.createVertexArray();
      gl.bindVertexArray(va);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(attribLocs.position);
      gl.vertexAttribPointer(attribLocs.position, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(attribLocs.lateral);
      gl.vertexAttribPointer(attribLocs.lateral, 1, gl.FLOAT, false, stride, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bindVertexArray(null);
      this.free.push({ vbo, vao: va, index: -1 });
    }
  }

  // Fills the scratch buffer with one chunk's vertices and uploads it.
  _build(slot, chunkIndex) {
    const { course, scratch } = this;
    const z0 = chunkIndex * CHUNK_LEN;
    let o = 0;
    for (let iz = 0; iz <= NZ; iz++) {
      const z = z0 + iz * DZ;
      const cx = course.pathX(z);
      const invHw = 1 / course.halfWidth(z);
      for (let ix = 0; ix <= NX; ix++) {
        const x = cx + (ix - NX * 0.5) * DX;
        scratch[o++] = x;
        scratch[o++] = course.height(x, z);
        scratch[o++] = z;
        // 0 at the centreline, 1 at the corridor lip: drives floor vs cliff shading.
        scratch[o++] = Math.abs(x - cx) * invHw;
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch);
    slot.index = chunkIndex;
  }

  // Keeps the ring centred on the player. Generation is time-budgeted so a
  // burst of new chunks degrades into a slightly shorter view distance rather
  // than a frame hitch.
  update(playerZ, budgetMs = 3) {
    const centre = Math.floor(playerZ / CHUNK_LEN);
    const lo = centre - CHUNKS_BEHIND;
    const hi = centre + CHUNKS_AHEAD;

    for (const [i, slot] of this.live) {
      if (i < lo || i > hi) { this.live.delete(i); this.free.push(slot); }
    }

    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // Nearest-first: the chunk under the player matters more than the horizon.
    for (let i = lo; i <= hi; i++) {
      if (this.live.has(i)) continue;
      const slot = this.free.pop();
      if (!slot) break;
      this._build(slot, i);
      this.live.set(i, slot);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - t0 > budgetMs) break;
    }
  }

  // Builds every visible chunk up front, for the loading screen.
  prewarm(playerZ) { this.update(playerZ, Infinity); }

  draw(gl) {
    for (const slot of this.live.values()) {
      gl.bindVertexArray(slot.vao);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }
  }

  get stats() { return { chunks: this.live.size, tris: this.live.size * NX * NZ * 2 }; }
}

export const TERRAIN_INFO = { VERTS, NX, NZ, DX, DZ, HALF_SPAN, POOL, TRIS_PER_CHUNK: NX * NZ * 2 };
