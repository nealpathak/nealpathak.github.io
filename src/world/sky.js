// Everything around the planet: stars, the sun, the moon, and the thin band of
// atmosphere that makes the whole thing read as a world rather than a ball.

import * as THREE from 'three';
import { streamFor, pointOnSphere } from '../core/rng.js';

/** A soft radial gradient, drawn once and reused for glow sprites. */
function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,200,0.55)');
  g.addColorStop(0.55, 'rgba(255,200,120,0.14)');
  g.addColorStop(1.0, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStars(seed, count, distance) {
  const rng = streamFor(seed, 'stars');
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    pointOnSphere(rng, v);
    // Scatter the shell a little so the field has depth.
    const d = distance * (0.85 + rng() * 0.3);
    positions[i * 3 + 0] = v.x * d;
    positions[i * 3 + 1] = v.y * d;
    positions[i * 3 + 2] = v.z * d;

    // Mostly white, drifting slightly warm or slightly blue.
    const hue = 0.55 + (rng() - 0.5) * 0.12;
    const sat = rng() * 0.35;
    const light = 0.65 + rng() * 0.35;
    c.setHSL(hue, sat, light);
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.4,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'stars';
  return points;
}

/**
 * A shell just above the surface that glows where we see it edge-on.
 * This fresnel rim is what sells "atmosphere" more than any amount of fog.
 */
function createAtmosphere(radius) {
  // The rim IS the silhouette here, so it has to be smooth. The shell also has
  // to sit above the cloud deck — clouds drifting outside the glow would read
  // as being in space rather than in the air.
  const geometry = new THREE.IcosahedronGeometry(radius * 1.10, 32);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x6fb4ff) },
      uIntensity: { value: 0.9 },
      // Raised along with the shell radius, to keep the glow hugging the limb
      // rather than spreading into a wide halo.
      uPower: { value: 4.6 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(uColor, pow(rim, uPower) * uIntensity);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'atmosphere';
  return mesh;
}

export function createSky({ seed, radius, scene }) {
  const group = new THREE.Group();
  group.name = 'sky';

  const stars = createStars(seed, 900, 260);
  const atmosphere = createAtmosphere(radius);

  // --- Sun -----------------------------------------------------------------
  // Kept far away and scaled up to match. A nearer sun looks fine at one camera
  // distance and then balloons across the frame at another — on a tall phone
  // the camera pulls back far enough to end up closer to the sun than to the
  // planet. Distance makes its apparent size stable.
  const sunDistance = radius * 20;
  const sun = new THREE.Group();

  const sunDisk = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 0.62, 3),
    new THREE.MeshBasicMaterial({ color: 0xfff2c4 })
  );
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  sunGlow.scale.setScalar(radius * 6.5);
  sun.add(sunDisk, sunGlow);

  const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.5);
  sunLight.target.position.set(0, 0, 0);

  // --- Moon ----------------------------------------------------------------
  // Lit by the same directional light as the planet, so it shows real phases.
  const moonDistance = radius * 1.95;
  const moon = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 0.11, 2),
    new THREE.MeshLambertMaterial({ color: 0xbfc4cc, flatShading: true })
  );
  moon.name = 'moon';

  // Fill light so the night side is readable rather than pure black.
  const ambient = new THREE.AmbientLight(0x35507a, 0.75);

  group.add(stars, atmosphere, sun, moon);
  scene.add(group, sunLight, sunLight.target, ambient);

  // Orbit planes: the sun runs near the equator, the moon on a tilt, so the
  // two trace different paths across the sky.
  const sunTilt = 0.28;
  const moonTilt = 0.62;
  const sunDir = new THREE.Vector3();

  return {
    group,
    sunLight,
    /** Unit vector pointing from the planet toward the sun. */
    sunDirection: sunDir,

    update(dt, clock) {
      const a = clock.sunAngle;
      sunDir.set(
        Math.cos(a),
        Math.sin(a) * Math.sin(sunTilt),
        Math.sin(a) * Math.cos(sunTilt)
      ).normalize();

      sun.position.copy(sunDir).multiplyScalar(sunDistance);
      sunLight.position.copy(sunDir).multiplyScalar(sunDistance);

      const m = clock.moonAngle;
      moon.position.set(
        Math.cos(m) * Math.cos(moonTilt),
        Math.sin(moonTilt) * 0.9,
        Math.sin(m) * Math.cos(moonTilt)
      ).normalize().multiplyScalar(moonDistance);
      moon.rotation.y += dt * 0.05;
    },
  };
}
