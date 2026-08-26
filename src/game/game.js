// Temporary animation lab. Replaced by the real game shell once the world and
// player controller land; for now it is how the rig gets looked at.

import * as THREE from 'three';
import { makeMaterial } from '../render/materials.js';
import { Character } from '../actors/character.js';
import { clip } from '../anim/library.js';
import { equipWeapon } from '../actors/weapons.js';
import { skyUniforms } from '../render/atmosphere.js';

const POSE_ROW = [
  { name: 'idle', kind: 'blend', speed: 0 },
  { name: 'walk', kind: 'blend', speed: 1.42 },
  { name: 'run', kind: 'blend', speed: 3.9 },
  { name: 'sprint', kind: 'blend', speed: 5.6 },
  { name: 'idleGuard', kind: 'clip' },
  { name: 'attackLight1', kind: 'clip' },
  { name: 'attackHeavy1', kind: 'clip' },
  { name: 'roll', kind: 'clip' },
  { name: 'guard', kind: 'clip' },
  { name: 'stagger', kind: 'clip' },
  { name: 'death', kind: 'clip' },
  { name: 'rest', kind: 'clip' },
];

export class Game {
  static async create(engine) {
    const g = new Game(engine);
    await g.init();
    return g;
  }

  constructor(engine) {
    this.engine = engine;
    this.scene = engine.renderer.scene;
    this.camera = engine.renderer.camera;
    this.time = 0;
    this.characters = [];
    this.params = new URLSearchParams(location.search);
  }

  async init() {
    if (this.params.has('studio')) this._studio();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      makeMaterial({ color: 0x9a8468, surface: 'dirt', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const single = this.params.get('clip');
    const specs = single
      ? [{ name: single, kind: 'clip' }]
      : POSE_ROW;

    const spacing = 1.9;
    specs.forEach((spec, i) => {
      const c = new Character({
        scale: 1,
        look: {
          helm: i % 4 === 1 ? 'hood' : i % 4 === 2 ? 'none' : 'greathelm',
          pauldrons: i % 3 === 2 ? 'cloth' : 'plate',
          cape: true,
        },
      });
      const weap = this.params.get('weapon') ?? 'longsword';
      if (weap !== 'none') equipWeapon(c, weap);
      if (this.params.get('shield') !== '0') equipWeapon(c, 'shield');
      c.addTo(this.scene);
      c.root.position.set((i - (specs.length - 1) / 2) * spacing, 0, 0);
      c.root.rotation.y = Math.PI;    // face the camera (+Z is forward)
      if (spec.kind === 'blend') c.setSpeed(spec.speed);
      else c.playFull(clip(spec.name), { fade: 0, loop: true });
      c.label = spec.name;
      this.characters.push(c);
    });

    this.focus = this.characters[Math.floor(this.characters.length / 2)];
    this._forward = new THREE.Vector3();
  }

  // Neutral three-point lighting for judging silhouette and proportion without
  // the zone's art direction in the way.
  _studio() {
    const r = this.engine.renderer;
    r.hemi.intensity = 1.15;
    r.hemi.color.set(0xc6d6f2);
    r.hemi.groundColor.set(0x7a6a58);
    r.sun.intensity = 2.4;
    r.sun.color.set(0xfff4e4);
    r.fill.intensity = 0.7;
    r.fill.color.set(0xa8c4ff);
    r.scene.fog.density = 0.0016;
    r.scene.fog.color.set(0x8a93a4);
    // A neutral sky so nothing about the character is judged through a sunset.
    skyUniforms.uTopColor.value.set(0x6d7e9c);
    skyUniforms.uHorizon.value.set(0xa9b3c2);
    skyUniforms.uBottomColor.value.set(0x4a4f58);
    skyUniforms.uSunColor.value.set(0xfff0d8);
    skyUniforms.uSunIntensity.value = 0.35;
    skyUniforms.uSunDir.value.set(0.42, 0.62, -0.66).normalize();
    this.engine.post.grade.uniforms.uVignette.value = 0.18;
    this.engine.post.grade.uniforms.uSplitAmount.value = 0.04;
    this.engine.renderer.gl.toneMappingExposure = 1.15;
  }

  fixedUpdate(dt) { this.time += dt; }

  update(realDt, alpha, dt) {
    for (const c of this.characters) {
      // Non-looping clips restart so the lab keeps showing them.
      if (c.base.finished) c.base.play(c.base.motion, { fade: 0, restart: true });
      c.update(dt);
    }

    const p = this.params;
    const orbit = p.has('orbit') ? this.time * 0.35 : Number(p.get('angle') ?? 0);
    const dist = Number(p.get('dist') ?? (this.characters.length > 3 ? 13 : 4.2));
    const height = Number(p.get('height') ?? 1.9);
    const cx = this.focus.root.position.x;
    this.camera.position.set(cx + Math.sin(orbit) * dist, height, Math.cos(orbit) * dist);
    this.camera.lookAt(cx, 0.95, 0);

    this._forward.set(0, 0, 0).sub(this.camera.position).setY(0).normalize();
    this.engine.renderer.updateShadows(new THREE.Vector3(cx, 0.9, 0), this._forward);
  }

  debugStats() {
    return { characters: this.characters.length, clips: this.characters.map((c) => c.label) };
  }
}
