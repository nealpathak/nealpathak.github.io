// Post-processing. Order is: scene -> bloom -> tonemap/encode -> grade -> AA.
//
// The grade pass runs after tone mapping, in display space, because vignette,
// grain and chromatic aberration are display-space effects — doing them in
// linear HDR makes the vignette look like a black hole.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse:     { value: null },
    uTime:        { value: 0 },
    uVignette:    { value: 0.34 },
    uGrain:       { value: 0.035 },
    uAberration:  { value: 0.0022 },
    uSaturation:  { value: 0.99 },
    uContrast:    { value: 1.03 },
    uLift:        { value: new THREE.Vector3(0.020, 0.017, 0.030) },
    uGain:        { value: new THREE.Vector3(1.01, 1.00, 0.98) },
    uShadowTint:  { value: new THREE.Color(0x707189) },
    uHighlightTint:{ value: new THREE.Color(0xffe6c8) },
    uSplitAmount: { value: 0.10 },
    uDamageFlash: { value: 0.0 },
    uDamageColor: { value: new THREE.Color(0xb4241e) },
    uDeathFade:   { value: 0.0 },
    uResolution:  { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uSaturation, uContrast;
    uniform vec3 uLift, uGain, uShadowTint, uHighlightTint;
    uniform float uSplitAmount, uDamageFlash, uDeathFade;
    uniform vec3 uDamageColor;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }

    void main() {
      vec2 uv = vUv;
      vec2 centred = uv - 0.5;
      float r2 = dot( centred, centred );

      // Chromatic aberration, scaled by distance from centre.
      float ab = uAberration * ( 1.0 + uDamageFlash * 6.0 );
      vec3 col;
      col.r = texture2D( tDiffuse, uv + centred * ab ).r;
      col.g = texture2D( tDiffuse, uv ).g;
      col.b = texture2D( tDiffuse, uv - centred * ab ).b;

      // Lift / gain, then contrast around mid grey.
      col = col * uGain + uLift;
      col = ( col - 0.5 ) * uContrast + 0.5;

      // Split toning: cool shadows, warm highlights.
      float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 split = mix( uShadowTint, uHighlightTint, smoothstep( 0.15, 0.85, luma ) );
      col = mix( col, col * split * 2.0, uSplitAmount );

      // Saturation.
      luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( luma ), col, uSaturation );

      // Damage flash pushes the frame red and desaturates the edges.
      if ( uDamageFlash > 0.001 ) {
        float edge = smoothstep( 0.05, 0.36, r2 );
        col = mix( col, uDamageColor, uDamageFlash * ( 0.25 + edge * 0.75 ) );
      }

      // Vignette.
      float vig = 1.0 - uVignette * smoothstep( 0.08, 0.62, r2 );
      col *= vig;

      // Animated grain, weighted toward the shadows where it reads as film.
      float g = hash( uv * uResolution + fract( uTime ) * 137.0 ) - 0.5;
      col += g * uGrain * ( 1.0 - luma * 0.6 );

      // Death fade to black-red.
      col = mix( col, vec3( 0.06, 0.01, 0.01 ), uDeathFade );

      gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
    }
  `,
};

export class PostFX {
  constructor(renderer) {
    this.r = renderer;
    this.enabled = true;

    this.composer = new EffectComposer(renderer.gl);
    this.composer.setPixelRatio(renderer.dpr);

    this.renderPass = new RenderPass(renderer.scene, renderer.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.62, 0.82);
    this.composer.addPass(this.bloom);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    this._flash = 0;
    this._flashDecay = 4.0;
  }

  applyQuality(preset) {
    this.bloom.enabled = preset.bloom;
    this.fxaa.enabled = preset.fxaa;
    this.composer.setPixelRatio(this.r.dpr);
    this.resize(this.r.width, this.r.height);
  }

  resize(width, height) {
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    const dpr = this.r.dpr;
    this.fxaa.material.uniforms.resolution.value.set(1 / (width * dpr), 1 / (height * dpr));
    this.grade.uniforms.uResolution.value.set(width * dpr, height * dpr);
  }

  /** Red screen pulse on taking damage. `amount` 0..1. */
  damageFlash(amount = 0.6) {
    this._flash = Math.max(this._flash, amount);
  }

  setDeathFade(v) { this.grade.uniforms.uDeathFade.value = v; }

  tick(dt, elapsed) {
    this._flash = Math.max(0, this._flash - dt * this._flashDecay);
    this.grade.uniforms.uDamageFlash.value = this._flash;
    this.grade.uniforms.uTime.value = elapsed;
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.r.gl.render(this.r.scene, this.r.camera);
  }
}
