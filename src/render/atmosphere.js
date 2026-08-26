// Atmosphere: a physically-flavoured sky gradient, height fog with sun
// inscatter, and the shared uniforms both share.
//
// Three's built-in fog is distance-only, which makes valleys look like they are
// filled with the same soup as the ridgeline above them. We override the global
// fog shader chunks to add a height term and a sun-facing inscatter tint. This
// touches every fogged material at once, which is exactly what we want.

import * as THREE from 'three';

export const skyUniforms = {
  uTopColor:    { value: new THREE.Color(0x1d2a4a) },
  uHorizon:     { value: new THREE.Color(0xd88a52) },
  uBottomColor: { value: new THREE.Color(0x140f14) },
  uSunDir:      { value: new THREE.Vector3(0.4, 0.28, -0.86).normalize() },
  uSunColor:    { value: new THREE.Color(0xffc07a) },
  uSunIntensity:{ value: 1.0 },
  uHorizonSharp:{ value: 2.6 },
  uTime:        { value: 0 },
};

export const fogUniforms = {
  fogHeightFalloff: { value: 0.055 },   // larger = fog hugs the ground harder
  fogHeightOffset:  { value: 2.0 },     // world Y where fog reaches full density
  fogInscatter:     { value: new THREE.Color(0xffb070) },
  fogInscatterAmt:  { value: 0.55 },
  fogSunDir:        { value: skyUniforms.uSunDir.value },
};

let installed = false;

/** Patch the global fog chunks. Safe to call more than once. */
export function installHeightFog() {
  if (installed) return;
  installed = true;

  Object.assign(THREE.UniformsLib.fog, {
    fogHeightFalloff: fogUniforms.fogHeightFalloff,
    fogHeightOffset: fogUniforms.fogHeightOffset,
    fogInscatter: fogUniforms.fogInscatter,
    fogInscatterAmt: fogUniforms.fogInscatterAmt,
    fogSunDir: fogUniforms.fogSunDir,
  });

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
    #ifdef USE_FOG
      varying vec3 vFogWorldPos;
      varying float vFogDepth;
    #endif
  `;

  THREE.ShaderChunk.fog_vertex = /* glsl */`
    #ifdef USE_FOG
      vFogDepth = - mvPosition.z;
      vFogWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
    #endif
  `;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
    #ifdef USE_FOG
      uniform vec3 fogColor;
      varying vec3 vFogWorldPos;
      varying float vFogDepth;
      uniform float fogHeightFalloff;
      uniform float fogHeightOffset;
      uniform vec3 fogInscatter;
      uniform float fogInscatterAmt;
      uniform vec3 fogSunDir;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
      #endif
    #endif
  `;

  THREE.ShaderChunk.fog_fragment = /* glsl */`
    #ifdef USE_FOG
      // Analytic height fog: integrate an exponentially decaying density along
      // the view ray instead of assuming it is uniform.
      vec3 camToFrag = vFogWorldPos - cameraPosition;
      float rayLen = max( length( camToFrag ), 1e-4 );
      vec3 rayDir = camToFrag / rayLen;

      float hCam = cameraPosition.y - fogHeightOffset;
      float hDir = rayDir.y;
      float k = fogHeightFalloff;

      float integral;
      if ( abs( hDir ) < 1e-4 ) {
        integral = rayLen * exp( -k * hCam );
      } else {
        integral = ( exp( -k * hCam ) - exp( -k * ( hCam + hDir * rayLen ) ) ) / ( k * hDir );
      }
      integral = max( integral, 0.0 );

      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * integral * rayLen * 0.55 );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth ) * clamp( integral / max( rayLen, 1.0 ), 0.0, 1.0 );
      #endif
      fogFactor = clamp( fogFactor, 0.0, 1.0 );

      // Looking toward the sun through fog should glow. This one line does most
      // of the work of selling depth in wide shots.
      float sunAmount = max( dot( rayDir, normalize( fogSunDir ) ), 0.0 );
      vec3 fogCol = mix( fogColor, fogInscatter, pow( sunAmount, 6.0 ) * fogInscatterAmt );

      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
    #endif
  `;
}

const SKY_VERT = /* glsl */`
  varying vec3 vWorldDir;
  void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorldDir = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position.z = gl_Position.w;   // always on the far plane
  }
`;

const SKY_FRAG = /* glsl */`
  varying vec3 vWorldDir;
  uniform vec3 uTopColor;
  uniform vec3 uHorizon;
  uniform vec3 uBottomColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform float uHorizonSharp;
  uniform float uTime;

  // Cheap hash-based value noise for the cloud band.
  float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float noise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), u.x ),
                mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), u.x ), u.y );
  }
  float fbm( vec2 p ) {
    float v = 0.0, a = 0.5;
    for ( int i = 0; i < 5; i++ ) { v += a * noise( p ); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 dir = normalize( vWorldDir );
    float h = dir.y;

    // Two-sided gradient meeting at the horizon.
    float up = pow( clamp( h, 0.0, 1.0 ), 1.0 / uHorizonSharp );
    float down = pow( clamp( -h, 0.0, 1.0 ), 1.0 / uHorizonSharp );
    vec3 col = mix( uHorizon, uTopColor, up );
    col = mix( col, uBottomColor, down );

    // Sun disc plus a wide halo.
    float sd = max( dot( dir, normalize( uSunDir ) ), 0.0 );
    float halo = pow( sd, 8.0 ) * 0.55 + pow( sd, 64.0 ) * 0.9;
    float disc = smoothstep( 0.9985, 0.9995, sd ) * 6.0;
    col += uSunColor * ( halo + disc ) * uSunIntensity;

    // Slow high cloud, only above the horizon, thickening toward it.
    if ( h > -0.02 ) {
      vec2 uv = dir.xz / max( abs( h ) + 0.14, 0.14 );
      float c = fbm( uv * 1.35 + vec2( uTime * 0.006, uTime * 0.0032 ) );
      c = smoothstep( 0.48, 0.92, c ) * smoothstep( -0.02, 0.30, h ) * ( 1.0 - up * 0.45 );
      vec3 cloudCol = mix( uHorizon * 1.15, uTopColor * 1.5 + uSunColor * 0.25, up );
      col = mix( col, cloudCol, c * 0.62 );
    }

    // Ordered-ish dither to kill banding in the gradient.
    float dither = ( hash( gl_FragCoord.xy ) - 0.5 ) / 255.0;
    // Linear out — the composer's OutputPass does tone mapping and encoding.
    gl_FragColor = vec4( col + dither, 1.0 );
  }
`;

export function createSky(radius = 4000) {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}

/**
 * Apply a named mood: sun direction and colour, fog, ambient tint. Zones use
 * these so moving between them reads as a change of place, not just geometry.
 */
export const MOODS = {
  ashfen: {
    top: 0x24304f, horizon: 0xc97a4a, bottom: 0x120e13,
    sun: [0.34, 0.40, -0.85], sunColor: 0xffb374, sunIntensity: 1.0,
    fog: 0xa9764f, fogDensity: 0.0085, heightFalloff: 0.05, heightOffset: 3,
    inscatter: 0xffbd7d, inscatterAmt: 0.6,
    ambientSky: 0x8ba0d8, ambientGround: 0x6b5142, ambientIntensity: 1.15,
    sunLight: 0xffd2a1, sunLightIntensity: 3.1,
  },
  choir: {
    top: 0x101a2e, horizon: 0x3f6f7e, bottom: 0x060a10,
    sun: [-0.3, 0.55, 0.78], sunColor: 0x9fe4ff, sunIntensity: 0.6,
    fog: 0x2c4b58, fogDensity: 0.019, heightFalloff: 0.10, heightOffset: 1,
    inscatter: 0x86d5ef, inscatterAmt: 0.45,
    ambientSky: 0x69a8c6, ambientGround: 0x27333e, ambientIntensity: 1.0,
    sunLight: 0xbfe8ff, sunLightIntensity: 1.9,
  },
  cinderreach: {
    top: 0x2c1017, horizon: 0xff6a24, bottom: 0x10060a,
    sun: [0.62, 0.34, 0.71], sunColor: 0xff8a3c, sunIntensity: 1.4,
    fog: 0x8c3a1c, fogDensity: 0.014, heightFalloff: 0.035, heightOffset: 5,
    inscatter: 0xff9448, inscatterAmt: 0.85,
    ambientSky: 0xd2764c, ambientGround: 0x5a2a20, ambientIntensity: 1.25,
    sunLight: 0xffa25c, sunLightIntensity: 2.8,
  },
  rest: {
    top: 0x1b2340, horizon: 0x8f6f9e, bottom: 0x0d0b14,
    sun: [-0.5, 0.48, -0.72], sunColor: 0xffd9b0, sunIntensity: 0.75,
    fog: 0x5b4c6b, fogDensity: 0.010, heightFalloff: 0.06, heightOffset: 2,
    inscatter: 0xffcfa8, inscatterAmt: 0.5,
    ambientSky: 0x8f9bd0, ambientGround: 0x4a4056, ambientIntensity: 1.1,
    sunLight: 0xffe4c4, sunLightIntensity: 2.3,
  },
};
