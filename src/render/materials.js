// Shared materials. Everything visible in the game comes out of this file, so
// the whole world stays on one lighting model and one art direction.
//
// The base is MeshStandardMaterial with two injections:
//   * a rim/fresnel term, which is what separates a silhouette from the fog
//   * optional vertex wind, for anything that should move in a breeze

import * as THREE from 'three';
import { surface } from './textures.js';

/** Shared, animated per-frame. */
export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
  uWindStrength: { value: 1.0 },
  uWindFreq: { value: 0.9 },
};

const RIM_CHUNK = /* glsl */`
  #ifdef USE_RIM
    float rimDot = 1.0 - clamp( dot( normalize( vNormal ), normalize( vViewPosition ) ), 0.0, 1.0 );
    float rim = pow( rimDot, uRimPower );
    outgoingLight += uRimColor * rim * uRimStrength;
  #endif
`;

const WIND_CHUNK = /* glsl */`
  #ifdef USE_WIND
    {
      vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      // uWindMask: 0 at the root, 1 at the tips. Encoded in vertex colour .g by
      // the foliage builder, or falls back to height above the object origin.
      float stiff = uWindMask;
      float phase = dot( wp.xz, uWindDir ) * 0.18 + uTime * uWindFreq;
      float gust = sin( phase ) * 0.6 + sin( phase * 2.31 + 1.7 ) * 0.3 + sin( phase * 4.7 + 0.4 ) * 0.1;
      float sway = gust * uWindStrength * uWindAmount * stiff;
      transformed.x += uWindDir.x * sway;
      transformed.z += uWindDir.y * sway;
      transformed.y -= abs( sway ) * 0.25 * stiff;
    }
  #endif
`;

let materialId = 0;

/**
 * Build a standard material with the project's extensions.
 *
 * @param {object} opts
 * @param {number|THREE.Color} opts.color
 * @param {string} [opts.surface]        named procedural surface set
 * @param {number} [opts.roughness]
 * @param {number} [opts.metalness]
 * @param {number|THREE.Color} [opts.rimColor]
 * @param {number} [opts.rimStrength]
 * @param {number} [opts.rimPower]
 * @param {number} [opts.wind]           0 disables; ~0.15 is a gentle bush
 * @param {'height'|'color'} [opts.windMask]
 */
export function makeMaterial(opts = {}) {
  const {
    color = 0xffffff, roughness = 0.85, metalness = 0.0,
    surface: surfName = null, emissive = 0x000000, emissiveIntensity = 1,
    rimColor = null, rimStrength = 0.0, rimPower = 3.0,
    wind = 0, windMask = 'height',
    transparent = false, opacity = 1, side = THREE.FrontSide,
    alphaTest = 0, vertexColors = false, flatShading = false,
    normalScale = 1, mapRepeat = null, dithered = false,
  } = opts;

  const params = {
    color, roughness, metalness, emissive, emissiveIntensity,
    transparent, opacity, side, alphaTest, vertexColors, flatShading,
  };

  if (surfName) {
    const s = surface(surfName);
    if (s.map) params.map = s.map.clone(), params.map.needsUpdate = true;
    if (s.normalMap) params.normalMap = s.normalMap.clone(), params.normalMap.needsUpdate = true;
    if (s.roughnessMap) params.roughnessMap = s.roughnessMap.clone(), params.roughnessMap.needsUpdate = true;
    if (mapRepeat) {
      for (const t of [params.map, params.normalMap, params.roughnessMap]) {
        if (t) { t.repeat.set(mapRepeat, mapRepeat); t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      }
    }
  }

  const mat = new THREE.MeshStandardMaterial(params);
  if (params.normalMap) mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  if (dithered) mat.dithering = true;

  const useRim = rimStrength > 0;
  const useWind = wind > 0;
  if (!useRim && !useWind) return mat;

  const rimCol = new THREE.Color(rimColor ?? 0xffffff);
  const key = `ew${materialId++}`;
  mat.userData.rimColor = rimCol;

  mat.onBeforeCompile = (shader) => {
    if (useRim) {
      shader.uniforms.uRimColor = { value: rimCol };
      shader.uniforms.uRimStrength = { value: rimStrength };
      shader.uniforms.uRimPower = { value: rimPower };
      shader.fragmentShader = `#define USE_RIM\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>', RIM_CHUNK + '\n#include <opaque_fragment>',
      );
    }
    if (useWind) {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWindDir = windUniforms.uWindDir;
      shader.uniforms.uWindStrength = windUniforms.uWindStrength;
      shader.uniforms.uWindFreq = windUniforms.uWindFreq;
      shader.uniforms.uWindAmount = { value: wind };
      const maskExpr = windMask === 'color'
        ? 'float uWindMask = vColor.g;'
        : 'float uWindMask = clamp( position.y * 0.55, 0.0, 1.4 );';
      shader.vertexShader = `#define USE_WIND\nuniform float uTime;\nuniform vec2 uWindDir;\nuniform float uWindStrength;\nuniform float uWindFreq;\nuniform float uWindAmount;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${maskExpr}\n` + WIND_CHUNK,
      );
    }
    mat.userData.shader = shader;
  };
  // Distinct cache key so three does not share a compiled program between
  // materials whose injected defines differ.
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Unlit additive material for glows, trails and magic. */
export function makeGlowMaterial(color, { opacity = 1, depthWrite = false, blending = THREE.AdditiveBlending, map = null } = {}) {
  return new THREE.MeshBasicMaterial({
    color, map, transparent: true, opacity, depthWrite, blending,
    side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
}

/** A soft dark ellipse pinned to the ground under an actor. Cheap contact cue. */
export function makeBlobShadowMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    map: texture, color: 0x000000, transparent: true, opacity: 0.42,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

/**
 * Silhouette material for the "you are being watched" cue and lock-on outlines:
 * renders back faces slightly inflated along the normal.
 */
export function makeOutlineMaterial(color = 0xffcf8a, thickness = 0.035) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uThickness: { value: thickness } },
    vertexShader: /* glsl */`
      uniform float uThickness;
      void main() {
        vec3 n = normalize( normalMatrix * normal );
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        mv.xyz += n * uThickness * ( -mv.z * 0.08 + 1.0 );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4( uColor, 1.0 ); }`,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  return mat;
}

export function tickMaterials(elapsed) {
  windUniforms.uTime.value = elapsed;
}
