// The game shell. For now: a lit test scene so the render path can be verified
// end to end. The world, actors and systems land on top of this.

import * as THREE from 'three';
import { makeMaterial } from '../render/materials.js';

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
  }

  async init() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400, 1, 1),
      makeMaterial({ color: 0x8f7a5e, surface: 'dirt', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const pillarMat = makeMaterial({
      color: 0x9c968c, surface: 'stone', roughness: 0.92,
      rimColor: 0xffc38a, rimStrength: 0.16, rimPower: 3.2,
    });
    const group = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = 4 + (i % 4) * 1.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), pillarMat);
      m.position.set(Math.cos(a) * 14, h / 2, Math.sin(a) * 14);
      m.rotation.y = a;
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    this.scene.add(group);

    this.probe = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1.0, 6, 14),
      makeMaterial({ color: 0xc8b49a, roughness: 0.6, rimColor: 0xffd7a0, rimStrength: 0.5 }),
    );
    this.probe.position.set(0, 1.0, 0);
    this.probe.castShadow = true;
    this.scene.add(this.probe);
  }

  fixedUpdate(dt) {
    this.time += dt;
  }

  update(realDt) {
    const t = this.time;
    const r = 11;
    this.camera.position.set(Math.cos(t * 0.18) * r, 4.2, Math.sin(t * 0.18) * r);
    this.camera.lookAt(0, 1.4, 0);
    this.engine.renderer.updateShadows(
      this.probe.position,
      new THREE.Vector3().subVectors(this.probe.position, this.camera.position).setY(0).normalize(),
    );
  }
}
