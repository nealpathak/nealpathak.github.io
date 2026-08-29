// Draw orchestration: sky, terrain, gates, ships, streaks, then one post pass.

import * as S from './shaders.js';
import { createContext, createProgram, createRenderTarget, resizeRenderTarget, buffer, vao } from '../core/gl.js';
import { Terrain } from '../world/terrain.js';
import { gateRing, shipHull, streakField } from './meshes.js';
import { paletteFor } from './palettes.js';
import { makeRng } from '../core/rng.js';
import {
  mat4, perspective, multiply, invert, viewFromBasis, composeTRS,
  v3, setv, normalize, cross, damp, clamp,
} from '../core/math.js';

const STREAKS = 1100;
const NEAR = 0.4;
const FAR = 900;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = createContext(canvas);
    if (!gl) throw new Error('WebGL2 is required and unavailable.');
    this.gl = gl;

    this.progs = {
      sky: createProgram(gl, S.skyVS, S.skyFS, 'sky'),
      terrain: createProgram(gl, S.terrainVS, S.terrainFS, 'terrain'),
      gate: createProgram(gl, S.gateVS, S.gateFS, 'gate'),
      ship: createProgram(gl, S.shipVS, S.shipFS, 'ship'),
      streak: createProgram(gl, S.streakVS, S.streakFS, 'streak'),
      post: createProgram(gl, S.postVS, S.postFS, 'post'),
    };

    this.emptyVao = gl.createVertexArray(); // for gl_VertexID-only draws

    // Gates: one shared ring, instanced per gate, with a per-frame state buffer.
    const ring = gateRing();
    this.gateIndexCount = ring.indices.length;
    const ringVbo = buffer(gl, gl.ARRAY_BUFFER, ring.positions);
    const ringIbo = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, ring.indices);
    this.gateInstVbo = gl.createBuffer();
    this.gateVao = vao(gl, [
      { loc: 0, size: 3, buffer: ringVbo },
      { loc: 1, size: 4, buffer: this.gateInstVbo, stride: 24, offset: 0, divisor: 1 },
      { loc: 2, size: 2, buffer: this.gateInstVbo, stride: 24, offset: 16, divisor: 1 },
    ], ringIbo);

    const hull = shipHull();
    this.shipCount = hull.count;
    this.shipVao = vao(gl, [
      { loc: 0, size: 3, buffer: buffer(gl, gl.ARRAY_BUFFER, hull.positions) },
      { loc: 1, size: 1, buffer: buffer(gl, gl.ARRAY_BUFFER, hull.glow) },
    ]);

    const field = streakField(STREAKS, makeRng(0x51ea3));
    this.streakCount = field.count;
    this.streakVao = vao(gl, [
      { loc: 0, size: 3, buffer: buffer(gl, gl.ARRAY_BUFFER, field.seed) },
      { loc: 1, size: 1, buffer: buffer(gl, gl.ARRAY_BUFFER, field.end) },
    ]);

    this.rt = createRenderTarget(gl, 2, 2);

    // Scratch matrices and vectors, reused every frame to avoid churn.
    this.proj = mat4();
    this.view = mat4();
    this.viewProj = mat4();
    this.invViewProj = mat4();
    this.model = mat4();
    this.camPos = v3(0, 20, -20);
    this._fwd = v3(0, 0, 1);
    this._right = v3(1, 0, 0);
    this._up = v3(0, 1, 0);
    this._tmp = v3();
    this._target = v3();
    this.worldUp = v3(0, 1, 0);
    this.fov = 1.15;
    this.flash = 0;
    this.camInit = false;

    this.resolutionScale = guessResolutionScale();
    this.size = { w: 1, h: 1, rw: 1, rh: 1 };
    this.resize();
  }

  setCourse(course) {
    this.course = course;
    this.palette = paletteFor(course.palette);
    this.terrain = new Terrain(this.gl, course, { position: 0, lateral: 1 });
    this.sunDir = normalize(v3(), v3(
      Math.sin(course.sunAngle) * 0.8,
      course.sunHeight,
      Math.cos(course.sunAngle) * 0.8,
    ));
    this.gateInst = new Float32Array(course.gates.length * 6);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gateInstVbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.gateInst.byteLength, this.gl.DYNAMIC_DRAW);
    this.camInit = false;
  }

  resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth || 960));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight || 540));
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    const rw = Math.max(1, Math.floor(this.canvas.width * this.resolutionScale));
    const rh = Math.max(1, Math.floor(this.canvas.height * this.resolutionScale));
    this.size = { w: this.canvas.width, h: this.canvas.height, rw, rh };
    resizeRenderTarget(this.gl, this.rt, rw, rh);
  }

  setResolutionScale(s) {
    this.resolutionScale = clamp(s, 0.4, 1);
    this.resize();
  }

  // Chase camera. Distance, height and field of view all open up with speed,
  // which is most of the sensation of going fast.
  updateCamera(ship, dt) {
    const boost = ship.boostFactor;
    const h = ship.heading;
    const back = 12.5 + boost * 3.2;
    const lift = 3.6 + boost * 0.7;
    setv(this._target,
      ship.x - h[0] * back + this.worldUp[0] * lift,
      ship.y - h[1] * back + lift,
      ship.z - h[2] * back + this.worldUp[2] * lift);

    if (!this.camInit) { this.camPos.set(this._target); this.camInit = true; }
    // Slightly lazy follow: the ship leads the camera through turns.
    const k = 9.5;
    this.camPos[0] = damp(this.camPos[0], this._target[0], k, dt);
    this.camPos[1] = damp(this.camPos[1], this._target[1], k, dt);
    this.camPos[2] = damp(this.camPos[2], this._target[2], k, dt);

    // Never let the camera sink into rock.
    const floor = this.course.height(this.camPos[0], this.camPos[2]) + 2.2;
    if (this.camPos[1] < floor) this.camPos[1] = floor;

    if (ship.shake > 0.001) {
      const s = ship.shake * 1.1;
      this.camPos[0] += (Math.random() - 0.5) * s;
      this.camPos[1] += (Math.random() - 0.5) * s;
    }

    // Aim ahead of the ship so the next gate is always in frame.
    setv(this._tmp, ship.x + h[0] * 26, ship.y + h[1] * 26 + 1.2, ship.z + h[2] * 26);
    this._tmp[0] -= this.camPos[0]; this._tmp[1] -= this.camPos[1]; this._tmp[2] -= this.camPos[2];
    normalize(this._fwd, this._tmp);
    normalize(this._right, cross(this._right, this._fwd, this.worldUp));
    cross(this._up, this._right, this._fwd);

    // Bank the horizon with the ship's roll, at a fraction of the real angle.
    const bank = ship.roll * 0.32;
    const cb = Math.cos(bank), sb = Math.sin(bank);
    const rx = this._right[0], ry = this._right[1], rz = this._right[2];
    const ux = this._up[0], uy = this._up[1], uz = this._up[2];
    setv(this._right, rx * cb + ux * sb, ry * cb + uy * sb, rz * cb + uz * sb);
    setv(this._up, ux * cb - rx * sb, uy * cb - ry * sb, uz * cb - rz * sb);

    const targetFov = 1.10 + boost * 0.20 + clamp((ship.speed - 62) / 200, 0, 0.12);
    this.fov = damp(this.fov, targetFov, 3.5, dt);

    const aspect = this.size.rw / this.size.rh;
    perspective(this.proj, this.fov, aspect, NEAR, FAR);
    viewFromBasis(this.view, this.camPos, this._right, this._up, this._fwd);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);
  }

  _setSkyUniforms(p) {
    const gl = this.gl;
    const pal = this.palette;
    gl.uniform3fv(p.u.uSunDir, this.sunDir);
    gl.uniform3fv(p.u.uSkyTop, pal.skyTop);
    gl.uniform3fv(p.u.uSkyHorizon, pal.skyHorizon);
    gl.uniform3fv(p.u.uSkyGround, pal.skyGround);
    gl.uniform3fv(p.u.uSunColor, pal.sun);
  }

  render(scene, dt) {
    const gl = this.gl;
    const { ship, run, ghostPose } = scene;
    const pal = this.palette;

    this.terrain.update(ship.z);
    this.updateCamera(ship, dt);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rt.fbo);
    gl.viewport(0, 0, this.size.rw, this.size.rh);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- sky ---------------------------------------------------------------
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    let p = this.progs.sky;
    gl.useProgram(p.prog);
    this._setSkyUniforms(p);
    gl.uniformMatrix4fv(p.u.uInvViewProj, false, this.invViewProj);
    gl.uniform3fv(p.u.uCamPos, this.camPos);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // --- terrain -----------------------------------------------------------
    p = this.progs.terrain;
    gl.useProgram(p.prog);
    this._setSkyUniforms(p);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform3fv(p.u.uCamPos, this.camPos);
    gl.uniform1f(p.u.uFogDensity, pal.fog);
    gl.uniform3fv(p.u.uRockLo, pal.rockLo);
    gl.uniform3fv(p.u.uRockHi, pal.rockHi);
    gl.uniform3fv(p.u.uFloorCol, pal.floorCol);
    gl.uniform1f(p.u.uFloorY, this.course.floorY(ship.z));
    gl.enable(gl.CULL_FACE);
    this.terrain.draw(gl);

    // --- gates -------------------------------------------------------------
    this._updateGateInstances(run);
    p = this.progs.gate;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform3fv(p.u.uCamPos, this.camPos);
    gl.disable(gl.CULL_FACE); // thin tori: cheaper than getting winding perfect
    gl.bindVertexArray(this.gateVao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.gateIndexCount, gl.UNSIGNED_SHORT, 0, this.course.gates.length);

    // --- ghost then player -------------------------------------------------
    p = this.progs.ship;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
    gl.uniform3fv(p.u.uCamPos, this.camPos);
    gl.uniform3fv(p.u.uSunDir, this.sunDir);
    gl.uniform3fv(p.u.uSunColor, pal.sun);
    gl.bindVertexArray(this.shipVao);

    if (ghostPose) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      composeTRS(this.model, [ghostPose.x, ghostPose.y, ghostPose.z], ghostPose.yaw, ghostPose.pitch, ghostPose.roll, 1);
      gl.uniformMatrix4fv(p.u.uModel, false, this.model);
      gl.uniform3f(p.u.uBodyColor, 0.30, 0.62, 0.85);
      gl.uniform1f(p.u.uBoost, 0.15);
      gl.uniform1f(p.u.uAlpha, 0.38);
      gl.drawArrays(gl.TRIANGLES, 0, this.shipCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    composeTRS(this.model, [ship.x, ship.y, ship.z], ship.yaw, ship.pitch, ship.roll, 1);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform3f(p.u.uBodyColor, 0.88, 0.90, 0.94);
    gl.uniform1f(p.u.uBoost, ship.boostFactor);
    gl.uniform1f(p.u.uAlpha, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, this.shipCount);

    // --- speed streaks -----------------------------------------------------
    const intensity = clamp((ship.speed - 55) / 60, 0, 1) * 0.85;
    if (intensity > 0.02) {
      p = this.progs.streak;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.u.uViewProj, false, this.viewProj);
      const h = ship.heading;
      gl.uniform3f(p.u.uCenter, this.camPos[0] + h[0] * 70, this.camPos[1] + h[1] * 70, this.camPos[2] + h[2] * 70);
      gl.uniform3f(p.u.uBox, 190, 110, 300);
      gl.uniform3f(p.u.uVel, h[0] * ship.speed, h[1] * ship.speed, h[2] * ship.speed);
      gl.uniform1f(p.u.uLen, 0.010 + ship.boostFactor * 0.018);
      gl.uniform1f(p.u.uIntensity, intensity);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.bindVertexArray(this.streakVao);
      gl.drawArrays(gl.LINES, 0, this.streakCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // --- post --------------------------------------------------------------
    this.flash = damp(this.flash, 0, 7, dt);
    if (ship.shake > 0.35) this.flash = Math.max(this.flash, 0.30);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.size.w, this.size.h);
    gl.disable(gl.DEPTH_TEST);
    p = this.progs.post;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.rt.color);
    gl.uniform1i(p.u.uScene, 0);
    const fast = clamp((ship.speed - 66) / 55, 0, 1);
    gl.uniform1f(p.u.uBlur, fast * 0.085);
    gl.uniform1f(p.u.uChroma, fast * 0.0042);
    gl.uniform1f(p.u.uFlash, this.flash);
    gl.uniform1f(p.u.uVignette, 0.42 + fast * 0.30);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  _updateGateInstances(run) {
    const gl = this.gl;
    const gates = this.course.gates;
    const t = run ? run.time : 0;
    const d = this.gateInst;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const o = i * 6;
      d[o] = g.x; d[o + 1] = g.y; d[o + 2] = g.z;
      d[o + 3] = Math.atan2(g.tilt, 1) * 0.6;
      // Brief flare when the gate resolves, then settle to a steady tint.
      let glow = 0;
      let state = 0;
      if (g.hitAt !== undefined) { state = 1; glow = Math.max(0, 1 - (t - g.hitAt) * 2.2); }
      else if (g.missAt !== undefined) { state = 2; glow = Math.max(0, 1 - (t - g.missAt) * 2.2); }
      d[o + 4] = glow;
      d[o + 5] = state;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gateInstVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d);
  }
}

// Phones and high-DPI laptops render the scene below native and let the post
// pass scale it back up; desktops run 1:1.
function guessResolutionScale() {
  if (typeof navigator === 'undefined') return 1;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const dpr = globalThis.devicePixelRatio || 1;
  if (coarse) return 0.62;
  return dpr > 1.5 ? 0.75 : 1;
}
