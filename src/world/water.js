// Standing water.
//
// One plane, held at a fixed level, with three things layered on it:
//
//   1. Analytic swell in the vertex shader — two crossed sine trains whose
//      derivatives give the surface normal exactly, so the big shape of the
//      water is right without a single extra texture fetch.
//   2. A tiled ripple normal map, scrolled from JS by animating the texture
//      offset. That costs no shader surgery at all and gives the fine chop
//      that sells the scale of the swell above it.
//   3. A signed depth map baked once on the CPU from the terrain underneath.
//      Colour, opacity, roughness, the foam line and the waterline itself are
//      all read off it, which means the shore follows the ground exactly and
//      costs nothing per frame. It is signed because the plane is square and
//      the pond is not: without a sign the shader cannot tell water from the
//      bank it is drawn over, and lays a wash of pond across the grass.
//
// The depth map is also what the game asks for gameplay: depthAt() reads the
// terrain directly, so wading and swimming agree with what is drawn.

import * as THREE from 'three';
import { surface } from '../render/textures.js';
import { clamp } from '../core/math.js';

const DEPTH_RES = 192;

export class Water {
  /**
   * @param {import('./terrain.js').Terrain} terrain
   * @param {object} opts
   * @param {number} opts.level        world y of the surface
   * @param {number} [opts.maxDepth]   depth at which the water reads as opaque
   * @param {number} [opts.shallow]    colour where the bed is close
   * @param {number} [opts.deep]       colour where it is not
   */
  constructor(terrain, {
    level = 0, maxDepth = 4.5, shallow = 0x4a7f84, deep = 0x0d2733,
    foam = 0xbfe6ef, swell = 0.16, choppy = 1.0, opacity = 0.93, flow = 1.0,
    centre = null, size: extent = null, edgeFade = 0, roughness = 0.3, ripple = 0.55,
  } = {}) {
    this.terrain = terrain;
    this.level = level;
    this.maxDepth = maxDepth;
    this.flow = flow;
    this.time = 0;

    // A zone can flood entirely, or hold one pond. Either way the plane covers
    // only what it needs to, so the depth bake stays sharp where it matters.
    const size = extent ?? terrain.size;
    const [ox, oz] = centre ?? terrain.origin;
    this.centre = [ox, oz];
    this.size = size;

    this.depthTexture = this._bakeDepth(size, ox, oz);

    const normalMap = surface('ripple').normalMap.clone();
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(size / 9, size / 9);
    normalMap.needsUpdate = true;
    this.normalMap = normalMap;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness,
      metalness: 0.02,
      transparent: true,
      opacity,
      normalMap,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    mat.normalScale = new THREE.Vector2(ripple, ripple);

    const uniforms = {
      uTime: { value: 0 },
      uDepthMap: { value: this.depthTexture },
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uFoam: { value: new THREE.Color(foam) },
      uSwell: { value: swell },
      uChoppy: { value: choppy },
      uOpacity: { value: opacity },
      // A pond that does not reach its own shore needs its edge hidden; a zone
      // flooded wall to wall does not, and pays nothing for the uniform.
      uEdgeFade: { value: edgeFade },
      uMaxDepth: { value: maxDepth },
    };
    this.uniforms = uniforms;

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = `
        uniform float uTime;
        uniform float uSwell;
        uniform float uChoppy;
        varying vec2 vWaterUv;
        varying float vSwellHeight;
        // Two crossed trains. Returns height in .x and d/du, d/dv in .yz, so the
        // normal falls straight out of the same evaluation as the displacement.
        vec3 swellAt( vec2 p ) {
          vec2 d1 = vec2( 0.82, 0.57 );
          vec2 d2 = vec2( -0.44, 0.90 );
          float f1 = 0.115, f2 = 0.207;
          float a1 = uSwell, a2 = uSwell * 0.46 * uChoppy;
          float p1 = dot( p, d1 ) * f1 + uTime * 0.72;
          float p2 = dot( p, d2 ) * f2 - uTime * 1.13;
          float h = sin( p1 ) * a1 + sin( p2 ) * a2;
          vec2 g = cos( p1 ) * a1 * f1 * d1 + cos( p2 ) * a2 * f2 * d2;
          return vec3( h, g );
        }
      ` + shader.vertexShader;

      // The plane is authored in XY and laid down by a -90 degree rotation
      // about X, so local +z is world up: displace transformed.z.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         vec3 swell = swellAt( position.xy );
         objectNormal = normalize( vec3( -swell.y, -swell.z, 1.0 ) );
         vWaterUv = uv;
         vSwellHeight = swell.x;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.z += swell.x;`,
      );

      shader.fragmentShader = `
        uniform sampler2D uDepthMap;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform float uOpacity;
        uniform float uEdgeFade;
        uniform float uMaxDepth;
        uniform float uTime;
        varying vec2 vWaterUv;
        varying float vSwellHeight;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Metres of water over the bed. Negative on dry bank.
         float wDepth = ( texture2D( uDepthMap, vWaterUv ).r - 0.5 ) * 2.0 * uMaxDepth;
         float wNorm = clamp( wDepth / uMaxDepth, 0.0, 1.0 );
         // Deep water swallows light; shallow water shows the bed through it.
         diffuseColor.rgb *= mix( uShallow, uDeep, smoothstep( 0.02, 0.9, wNorm ) );
         // Foam gathers where the swell pushes onto ground that is nearly dry,
         // so the line breathes in and out with the waves instead of sitting
         // frozen at one contour.
         float shore = 1.0 - smoothstep( 0.0, 0.10, wDepth + vSwellHeight * 0.5 );
         // The lace has to reach zero somewhere or the whole shoreline reads as
         // one solid white band rather than water breaking on a bank.
         float lace = sin( vWaterUv.x * 420.0 + vWaterUv.y * 310.0 + uTime * 2.1 ) * 0.5 + 0.5;
         float foam = clamp( shore * ( 0.18 + lace * 0.82 ), 0.0, 1.0 );
         diffuseColor.rgb = mix( diffuseColor.rgb, uFoam, foam * 0.7 );
         // Thin water is nearly clear; foam is not water at all; and past the
         // waterline there is no water to draw.
         diffuseColor.a = uOpacity * mix( 0.16, 1.0, smoothstep( 0.0, 0.16, wDepth ) );
         diffuseColor.a = max( diffuseColor.a, foam * 0.7 );
         diffuseColor.a *= smoothstep( -0.05, 0.01, wDepth );
         if ( uEdgeFade > 0.0 ) {
           vec2 e = abs( vWaterUv - 0.5 ) * 2.0;
           diffuseColor.a *= 1.0 - smoothstep( 1.0 - uEdgeFade, 1.0, max( e.x, e.y ) );
         }`,
      );
      // Wet sand at the edge is rough; open water is a mirror.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix( 0.72, roughnessFactor, smoothstep( 0.0, 0.32, wDepth ) );`,
      );

      this.shader = shader;
    };
    mat.customProgramCacheKey = () => 'ew:water';
    this.material = mat;

    // Enough segments that the swell reads as a curve rather than a fold, but
    // this is one mesh across the whole zone, so it stays cheap.
    const geo = new THREE.PlaneGeometry(size, size, 72, 72);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'water';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(ox, level, oz);
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 2;
    this.mesh.userData.noBake = true;
    // The plane is authored flat; the swell moves it, and three cannot know
    // that, so give the bounds room or the water culls at grazing angles.
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 2;
  }

  /** Bake terrain depth under the water into a texture the shader can read. */
  _bakeDepth(size, ox, oz) {
    const n = DEPTH_RES;
    const data = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      // Plane uv.y runs the opposite way to world z once the plane is laid down.
      const z = oz - ((j + 0.5) / n - 0.5) * size;
      for (let i = 0; i < n; i++) {
        const x = ox + ((i + 0.5) / n - 0.5) * size;
        // Encoded to put the waterline at 0.5, so the shader knows which side
        // of it each fragment is on.
        const d = (this.level - this.terrain.heightAt(x, z)) / this.maxDepth;
        data[j * n + i] = Math.round((clamp(d, -1, 1) * 0.5 + 0.5) * 255);
      }
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /** Is this world point inside the water's footprint at all? */
  covers(x, z) {
    const half = this.size / 2;
    return Math.abs(x - this.centre[0]) <= half && Math.abs(z - this.centre[1]) <= half;
  }

  /** How deep the water is at a world point. Negative above the waterline. */
  depthAt(x, z) {
    if (!this.covers(x, z)) return -Infinity;
    return this.level - this.terrain.heightAt(x, z);
  }

  /** How far a body standing with its feet at `y` is under the surface. */
  submersionAt(x, z, y) {
    if (!this.covers(x, z)) return 0;
    return Math.max(0, this.level - y);
  }

  /** The drawn surface height, swell included, so splashes land on the wave. */
  surfaceAt(x, z) {
    const [ox, oz] = this.centre;
    const px = x - ox, pz = oz - z;
    const p1 = (px * 0.82 + pz * 0.57) * 0.115 + this.time * 0.72;
    const p2 = (px * -0.44 + pz * 0.90) * 0.207 - this.time * 1.13;
    const a1 = this.uniforms.uSwell.value;
    const a2 = a1 * 0.46 * this.uniforms.uChoppy.value;
    return this.level + Math.sin(p1) * a1 + Math.sin(p2) * a2;
  }

  update(dt) {
    this.time += dt * this.flow;
    this.uniforms.uTime.value = this.time;
    // The fine chop scrolls across the swell rather than with it.
    this.normalMap.offset.set(this.time * 0.014, this.time * -0.023);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.depthTexture.dispose();
    this.normalMap.dispose();
  }
}
