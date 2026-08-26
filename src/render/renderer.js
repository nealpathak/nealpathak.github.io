// Renderer, lights and the shadow rig.
//
// One directional sun with a shadow frustum that is re-centred on the player
// every frame. A single tight cascade beats a huge loose one: the shadow map
// only ever has to cover the ~70m the player can actually see in this fog.

import * as THREE from 'three';
import { settings, QUALITY_PRESETS } from '../core/settings.js';
import { createSky, installHeightFog, skyUniforms, fogUniforms, MOODS } from './atmosphere.js';

export class Renderer {
  constructor(canvasEl) {
    installHeightFog();

    this.canvas = canvasEl;
    this.gl = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: false,          // FXAA in the composer instead
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.gl.setClearColor(0x000000, 1);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.28;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.shadowMap.autoUpdate = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9a7150, 0.012);

    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.12, 3000);
    this.camera.position.set(0, 4, 8);

    this.sky = createSky();
    this.scene.add(this.sky);

    // --- lights ---
    this.hemi = new THREE.HemisphereLight(0x7c93cf, 0x3a2a22, 0.75);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffd2a1, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 220;
    this.shadowRadius = 46;
    this._setShadowExtent(this.shadowRadius);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // A dim opposite-side fill keeps unlit sides from going to pure black
    // without needing a second shadow-casting light.
    this.fill = new THREE.DirectionalLight(0x9fb4ff, 0.35);
    this.fill.position.set(-4, 3, 5);
    this.scene.add(this.fill);

    this.dpr = 1;
    this.width = 1; this.height = 1;
    this._shadowCentre = new THREE.Vector3();
    this._sunOffset = new THREE.Vector3();

    this.applyQuality(settings.get('quality'));
    this.setMood('ashfen', 1);
  }

  _setShadowExtent(r) {
    const c = this.sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.updateProjectionMatrix();
  }

  applyQuality(name) {
    const p = QUALITY_PRESETS[name] ?? QUALITY_PRESETS.high;
    this.quality = p;
    this.gl.shadowMap.enabled = p.shadows;
    this.sun.castShadow = p.shadows;
    if (this.sun.shadow.mapSize.x !== p.shadowSize) {
      this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
    this.camera.far = Math.max(p.drawDistance * 3, 600);
    this.camera.updateProjectionMatrix();
    this.resize(this.width, this.height, true);
  }

  /** Blend the scene toward a named mood. `t` of 1 snaps. */
  setMood(name, t = 1) {
    const m = MOODS[name];
    if (!m) return;
    this.mood = name;
    const lerpCol = (target, hex) => target.lerp(new THREE.Color(hex), t);

    lerpCol(skyUniforms.uTopColor.value, m.top);
    lerpCol(skyUniforms.uHorizon.value, m.horizon);
    lerpCol(skyUniforms.uBottomColor.value, m.bottom);
    lerpCol(skyUniforms.uSunColor.value, m.sunColor);
    skyUniforms.uSunIntensity.value += (m.sunIntensity - skyUniforms.uSunIntensity.value) * t;

    const dir = new THREE.Vector3(...m.sun).normalize();
    skyUniforms.uSunDir.value.lerp(dir, t).normalize();

    lerpCol(this.scene.fog.color, m.fog);
    this.scene.fog.density += (m.fogDensity - this.scene.fog.density) * t;
    fogUniforms.fogHeightFalloff.value += (m.heightFalloff - fogUniforms.fogHeightFalloff.value) * t;
    fogUniforms.fogHeightOffset.value += (m.heightOffset - fogUniforms.fogHeightOffset.value) * t;
    lerpCol(fogUniforms.fogInscatter.value, m.inscatter);
    fogUniforms.fogInscatterAmt.value += (m.inscatterAmt - fogUniforms.fogInscatterAmt.value) * t;

    lerpCol(this.hemi.color, m.ambientSky);
    lerpCol(this.hemi.groundColor, m.ambientGround);
    this.hemi.intensity += (m.ambientIntensity - this.hemi.intensity) * t;
    lerpCol(this.sun.color, m.sunLight);
    this.sun.intensity += (m.sunLightIntensity - this.sun.intensity) * t;
    lerpCol(this.fill.color, m.ambientSky);
  }

  /** Re-centre the shadow frustum ahead of the player, snapped to texels. */
  updateShadows(focus, forward) {
    if (!this.sun.castShadow) return;
    // Bias the centre forward so more of the map covers what we can see.
    this._shadowCentre.copy(focus);
    if (forward) this._shadowCentre.addScaledVector(forward, this.shadowRadius * 0.35);

    // Snapping to whole shadow texels stops shadow edges from crawling as the
    // camera moves. Without this, every fence post shimmers.
    const texel = (this.shadowRadius * 2) / this.sun.shadow.mapSize.x;
    this._shadowCentre.x = Math.round(this._shadowCentre.x / texel) * texel;
    this._shadowCentre.z = Math.round(this._shadowCentre.z / texel) * texel;

    this.sun.target.position.copy(this._shadowCentre);
    this.sun.target.updateMatrixWorld();
    this._sunOffset.copy(skyUniforms.uSunDir.value).multiplyScalar(110);
    this.sun.position.copy(this._shadowCentre).add(this._sunOffset);
    this.sun.updateMatrixWorld();
  }

  resize(width, height, force = false) {
    if (!force && width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setFov(deg) {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  tick(elapsed) {
    skyUniforms.uTime.value = elapsed;
    this.sky.position.copy(this.camera.position);
  }

  dispose() {
    this.gl.dispose();
  }
}
