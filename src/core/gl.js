// Thin WebGL2 helpers: programs, buffers, vertex arrays, render targets.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, // we resolve aliasing with the post pass + resolution scale
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  gl.clearColor(0, 0, 0, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  return gl;
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    // Prefix each line with its number so the compiler's line refs are usable.
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    throw new Error(`[${label}] shader compile failed:\n${log}\n${numbered}`);
  }
  return sh;
}

// Compiles a program and eagerly caches every active uniform location.
export function createProgram(gl, vsSrc, fsSrc, label = 'program') {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + ':vs');
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + ':fs');
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`[${label}] link failed: ${log}`);
  }
  const u = Object.create(null);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    // Array uniforms report as "name[0]"; store them under the bare name too.
    const base = info.name.replace(/\[0\]$/, '');
    u[base] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, u, label };
}

export function buffer(gl, target, data, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, usage || gl.STATIC_DRAW);
  return b;
}

// attribs: [{ loc, size, type?, stride?, offset?, divisor?, integer? }]
export function vao(gl, attribs, indexBuffer) {
  const a = gl.createVertexArray();
  gl.bindVertexArray(a);
  for (const at of attribs) {
    gl.bindBuffer(gl.ARRAY_BUFFER, at.buffer);
    gl.enableVertexAttribArray(at.loc);
    const type = at.type || gl.FLOAT;
    if (at.integer) {
      gl.vertexAttribIPointer(at.loc, at.size, type, at.stride || 0, at.offset || 0);
    } else {
      gl.vertexAttribPointer(at.loc, at.size, type, !!at.normalized, at.stride || 0, at.offset || 0);
    }
    if (at.divisor) gl.vertexAttribDivisor(at.loc, at.divisor);
  }
  if (indexBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bindVertexArray(null);
  return a;
}

// A colour target plus depth renderbuffer, resizable in place.
export function createRenderTarget(gl, w, h) {
  const fbo = gl.createFramebuffer();
  const color = gl.createTexture();
  const depth = gl.createRenderbuffer();
  const rt = { fbo, color, depth, w: 0, h: 0 };
  resizeRenderTarget(gl, rt, w, h);
  return rt;
}

export function resizeRenderTarget(gl, rt, w, h) {
  w = Math.max(1, w | 0);
  h = Math.max(1, h | 0);
  if (rt.w === w && rt.h === h) return rt;
  rt.w = w; rt.h = h;
  gl.bindTexture(gl.TEXTURE_2D, rt.color);
  // RGBA8 is universally colour-renderable, so this needs no extension checks.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rt.depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.color, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rt.depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return rt;
}
