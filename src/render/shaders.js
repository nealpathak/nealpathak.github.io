// GLSL ES 3.00 sources. Attribute locations are pinned with layout qualifiers
// so buffer setup never has to query them back.

const V = '#version 300 es\n';
const F = '#version 300 es\nprecision highp float;\n';

// Shared sky model. Terrain fog samples the same function along the view ray,
// so distant geometry dissolves into the horizon with no visible seam.
const SKY_FN = `
uniform vec3 uSunDir;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
uniform vec3 uSunColor;

vec3 skyColor(vec3 dir) {
  float up = dir.y;
  vec3 col = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.75, up));
  // Below the horizon the haze darkens into the canyon's own shadow.
  col = mix(mix(uSkyGround, uSkyHorizon, smoothstep(-0.30, 0.0, up)), col, step(0.0, up));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * pow(sd, 8.0) * 0.17;          // broad glow
  col += uSunColor * smoothstep(0.9986, 0.9994, sd) * 6.0; // disc
  return col;
}`;

// Cheap value noise, used only for surface detail.
const HASH_FN = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}`;

// Full-screen triangle generated from gl_VertexID; no vertex buffer needed.
const FS_TRI_VS = V + `
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const skyVS = FS_TRI_VS;

export const skyFS = F + SKY_FN + `
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
out vec4 fragColor;
void main() {
  vec4 far = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - uCamPos);
  fragColor = vec4(skyColor(dir), 1.0);
}`;

export const terrainVS = V + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aLat;   // 0 at centreline, 1 at the corridor lip
uniform mat4 uViewProj;
out vec3 vWorld;
out float vLat;
void main() {
  vWorld = aPos;
  vLat = aLat;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

export const terrainFS = F + SKY_FN + HASH_FN + `
in vec3 vWorld;
in float vLat;
uniform vec3 uCamPos;
uniform float uFogDensity;
uniform vec3 uRockLo;
uniform vec3 uRockHi;
uniform vec3 uFloorCol;
uniform float uFloorY;      // canyon floor height near the camera, for strata
out vec4 fragColor;

void main() {
  // Flat shading: the triangle's own plane normal, from screen-space
  // derivatives of world position. Cheaper than storing normals, and the
  // faceting is the intended look.
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (N.y < 0.0) N = -N;   // heightfield normals always point up

  float slope = 1.0 - clamp(N.y, 0.0, 1.0);

  // Horizontal strata banding, warped by noise so it never looks like a ramp.
  // Two frequencies: broad beds with a finer seam inside them, which stops the
  // cliffs reading as one repeating stripe.
  float warp = vnoise(vWorld.xz * 0.021) * 3.4;
  float h0 = (vWorld.y - uFloorY);
  float band = fract(h0 * 0.055 + warp * 0.25);
  band = smoothstep(0.18, 0.82, band);
  float seam = smoothstep(0.35, 0.5, fract(h0 * 0.17 + warp * 0.4));
  band = clamp(band * 0.82 + seam * 0.24, 0.0, 1.0);
  vec3 rock = mix(uRockLo, uRockHi, band);
  // Sampled across a plane that includes Y: an XZ-only lookup is constant up a
  // vertical cliff face and smears into stripes.
  rock *= 0.86 + 0.28 * vnoise(vec2(vWorld.x * 0.31 + vWorld.z * 0.27, vWorld.y * 0.33));

  // The corridor floor gets its own sediment colour, blended in where the
  // surface is both low-lying and near the centreline.
  float floorMix = (1.0 - smoothstep(0.70, 1.25, vLat)) * (1.0 - smoothstep(0.22, 0.62, slope));
  vec3 albedo = mix(rock, uFloorCol, floorMix * 0.92);

  float sun = max(dot(N, uSunDir), 0.0);
  // Hemispheric ambient: sky above, warm bounce from the canyon below.
  // Ambient is a *fraction* of sky radiance. Scaling it above 1.0 blows out the
  // bright-sky palettes until the rock reads as white paper.
  vec3 ambient = mix(uSkyGround * 0.55, uSkyTop * 0.55, N.y * 0.5 + 0.5) + 0.05;
  // Fill from opposite the sun. Without it, faces turned away from a low sun
  // -- pillars especially -- crush to black and you cannot read the hazard.
  vec3 fillDir = normalize(vec3(-uSunDir.x, 0.40, -uSunDir.z));
  float fill = max(dot(N, fillDir), 0.0);
  vec3 lit = albedo * (ambient + uSunColor * sun * 1.15 + uSkyHorizon * fill * 0.42);

  // Cheap occlusion: steep faces sit in their own shadow and between crags.
  // A pure lambert term leaves faceted cliffs looking flat, and this is what
  // makes the relief read as rock depth rather than a painted gradient.
  lit *= mix(1.0, 0.70, smoothstep(0.30, 0.95, slope));

  // Rim light picks the cliff edges out against the sky.
  vec3 V = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  lit += uSunColor * rim * 0.22;

  float dist = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  fragColor = vec4(mix(lit, skyColor(-V), fog), 1.0);
}`;

// --- gates -----------------------------------------------------------------
export const gateVS = V + `
layout(location = 0) in vec3 aPos;      // ring vertex, in gate-local space
layout(location = 1) in vec4 iPosYaw;   // instance: xyz centre, w yaw
layout(location = 2) in vec2 iState;    // x: glow 0..1, y: 0 pending 1 passed 2 missed
uniform mat4 uViewProj;
out vec3 vLocal;
out vec2 vState;
void main() {
  float c = cos(iPosYaw.w), s = sin(iPosYaw.w);
  vec3 p = vec3(aPos.x * c + aPos.z * s, aPos.y, -aPos.x * s + aPos.z * c);
  vLocal = aPos;
  vState = iState;
  gl_Position = uViewProj * vec4(p + iPosYaw.xyz, 1.0);
}`;

export const gateFS = F + `
in vec3 vLocal;
in vec2 vState;
uniform vec3 uCamPos;
out vec4 fragColor;
void main() {
  vec3 pending = vec3(0.35, 0.85, 1.0);
  vec3 passed  = vec3(0.35, 1.0, 0.55);
  vec3 missed  = vec3(1.0, 0.28, 0.30);
  vec3 col = vState.y > 1.5 ? missed : (vState.y > 0.5 ? passed : pending);
  // Emissive: gates read as light sources, so they stay legible through fog.
  // Kept below the tone-mapper's shoulder -- a brighter flare just clips to
  // white and fills the screen as you pass through the ring.
  float pulse = 0.80 + 0.20 * sin(vLocal.x * 2.3 + vLocal.y * 1.7);
  fragColor = vec4(col * (0.92 + vState.x * 1.15) * pulse, 1.0);
}`;

// --- ship / ghost ----------------------------------------------------------
export const shipVS = V + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aGlow;   // 1 on engine faces
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorld;
out float vGlow;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vGlow = aGlow;
  gl_Position = uViewProj * w;
}`;

export const shipFS = F + `
in vec3 vWorld;
in float vGlow;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uBodyColor;
uniform float uBoost;
uniform float uAlpha;
uniform float uRim;      // ghost outline strength; 0 for the player's own ship
out vec4 fragColor;
void main() {
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;   // two-sided: the hull is an open shell
  float sun = max(dot(N, uSunDir), 0.0);
  vec3 col = uBodyColor * (0.30 + sun * 0.9) + uSunColor * pow(max(dot(N, V), 0.0), 2.0) * 0.18;
  // Engine bloom scales with the slipstream charge.
  vec3 fire = mix(vec3(0.30, 0.75, 1.0), vec3(1.0, 0.55, 0.20), uBoost);
  col += fire * vGlow * (1.2 + uBoost * 3.5);

  // A translucent hull alone is nearly invisible against pale rock. Lighting
  // the silhouette edges gives the ghost a readable outline on every palette,
  // which matters because it is the only opponent in the game.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  col += vec3(0.42, 0.88, 1.0) * fres * uRim;
  fragColor = vec4(col, clamp(uAlpha + fres * uRim * 0.5, 0.0, 1.0));
}`;

// --- speed streaks ---------------------------------------------------------
export const streakVS = V + `
layout(location = 0) in vec3 aSeed;   // stable anchor in [0,1)^3
layout(location = 1) in float aEnd;   // 0 head, 1 tail
uniform mat4 uViewProj;
uniform vec3 uCenter;                 // wrapping cell origin, follows the camera
uniform vec3 uBox;
uniform vec3 uVel;                    // ship velocity, metres per second
uniform float uLen;
out float vFade;
void main() {
  vec3 o = uCenter - uBox * 0.5;
  // Anchor the mote to a fixed world point, then wrap it into the cell around
  // the camera: motes appear to stream past instead of travelling with you.
  vec3 wp = o + mod(aSeed * uBox - o, uBox);
  wp -= uVel * aEnd * uLen;
  float d = length(wp - uCenter);
  vFade = (1.0 - smoothstep(0.25, 0.5, d / uBox.z)) * (1.0 - aEnd * 0.85);
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;

export const streakFS = F + `
in float vFade;
uniform float uIntensity;
out vec4 fragColor;
void main() {
  fragColor = vec4(vec3(1.0, 0.97, 0.92) * vFade * uIntensity, 1.0);
}`;

// --- post ------------------------------------------------------------------
export const postVS = FS_TRI_VS;

export const postFS = F + `
in vec2 vUv;
uniform sampler2D uScene;
uniform float uBlur;     // radial blur strength, driven by speed
uniform float uChroma;
uniform float uFlash;    // white-out on impact
uniform float uVignette;
uniform float uSlip;     // slipstream charge / proximity, 0..1
out vec4 fragColor;

void main() {
  vec2 uv = vUv;
  vec2 dir = (uv - 0.5);
  vec3 col = vec3(0.0);

  if (uBlur > 0.001) {
    // Eight taps back along the radial vector: cheap, and reads as velocity.
    float total = 0.0;
    for (int i = 0; i < 8; i++) {
      float t = float(i) / 7.0;
      float w = 1.0 - t * 0.75;
      col += texture(uScene, uv - dir * t * uBlur).rgb * w;
      total += w;
    }
    col /= total;
  } else {
    col = texture(uScene, uv).rgb;
  }

  // Radial chromatic split, strongest at the frame edges.
  if (uChroma > 0.001) {
    float r = texture(uScene, uv - dir * uChroma).r;
    float b = texture(uScene, uv + dir * uChroma).b;
    col.r = mix(col.r, r, 0.75);
    col.b = mix(col.b, b, 0.75);
  }

  col = mix(col, vec3(1.0, 0.93, 0.88), uFlash);
  float v = 1.0 - dot(dir, dir) * uVignette;
  col *= clamp(v, 0.0, 1.0);

  // Slipstream tell: the frame edges warm and close in as charge builds. The
  // HUD bar states the number, but this is what the player actually feels, and
  // it is the only feedback that reaches them while they are watching the rock.
  float edge = smoothstep(0.16, 0.55, dot(dir, dir));
  col += vec3(1.0, 0.55, 0.22) * edge * uSlip * 0.34;

  // Filmic-ish shoulder keeps the emissive gates from clipping to flat white.
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));

  // The tone curve lifts mid-tones hard, which leaves pale palettes looking
  // washed out. A gentle S-curve and a touch of saturation put the depth back.
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(luma), col, 1.12), 0.0, 1.0);
  fragColor = vec4(col, 1.0);
}`;
