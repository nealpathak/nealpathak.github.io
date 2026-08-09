// The gun: view model, firing, hitscan, recoil.
//
// The view model lives in its own scene with its own camera and is drawn in a
// second pass over a cleared depth buffer. That's how shooters keep the weapon
// from poking through walls or getting sliced by the near plane, and it lets
// the gun have a different field of view from the world.

import * as THREE from 'three';

const FIRE_INTERVAL = 0.14;
const RELOAD_TIME = 1.5;
const MAG_SIZE = 15;
const START_RESERVE = 90;
const RESERVE_PER_ROUND = 45;
const DAMAGE = 34;
const RANGE = 90;

const SPREAD_BASE = 0.0016;   // radians, standing still
const SPREAD_MOVE = 0.010;

const _ray = new THREE.Raycaster();
const _dirV = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class Weapon {
  constructor(hooks) {
    this.hooks = hooks;          // { onShot, onHit, onKill, onDryFire, onReload }

    this.mag = MAG_SIZE;
    this.reserve = START_RESERVE;
    this.cooldown = 0;
    this.reloading = 0;

    // Recoil springs. `kick` is the view-model offset, `punch` is view rotation.
    this.kick = 0;
    this.kickVel = 0;
    this.punch = 0;
    this.punchVel = 0;
    this.sway = new THREE.Vector2();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 12);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff0dd, 0.9);
    key.position.set(-1, 2, 1.5);
    this.scene.add(key);

    this.model = this._buildModel();
    this.scene.add(this.model);

    this._buildFlash();
    this._buildTracers();
  }

  _buildModel() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.55, metalness: 0.65 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x18191d, roughness: 0.9 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x5c6169, roughness: 0.45, metalness: 0.7 });

    const box = (w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };

    box(0.075, 0.085, 0.36, 0, 0, -0.10, body);       // receiver
    box(0.045, 0.045, 0.30, 0, 0.012, -0.36, body);   // barrel shroud
    box(0.026, 0.026, 0.10, 0, 0.012, -0.54, trim);   // muzzle
    this.slide = box(0.070, 0.030, 0.30, 0, 0.058, -0.14, trim);
    box(0.060, 0.150, 0.09, 0, -0.115, 0.01, grip);   // grip
    box(0.055, 0.030, 0.11, 0, -0.055, -0.04, grip);  // magwell
    box(0.014, 0.020, 0.014, 0, 0.082, -0.47, grip);  // front sight
    box(0.040, 0.018, 0.014, 0, 0.082, -0.02, grip);  // rear sight

    // Sat low and to the right, angled slightly inward — reads as "held".
    // Keep it out of the centre of the screen: this is a shooter, and the
    // crosshair has to stay the busiest thing you look at.
    g.scale.setScalar(0.78);
    g.position.set(0.20, -0.175, -0.46);
    g.rotation.set(0.02, 0.10, 0);
    this.rest = g.position.clone();
    this.restRot = g.rotation.clone();
    return g;
  }

  _buildFlash() {
    const tex = flashTexture();
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0,
      })
    );
    this.flash.position.set(0, 0.012, -0.60);
    this.model.add(this.flash);

    // A real light in the world, so the muzzle actually lights the yard.
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 14, 2);
    this.flashTime = 0;
  }

  _buildTracers() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, -0.5);   // pivot at the near end so we can scale to length
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracers = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      this.tracers.push({ mesh: m, life: 0 });
    }
  }

  /** Tracers live in the world scene, not the view-model scene. */
  attachTo(worldScene) {
    for (const t of this.tracers) worldScene.add(t.mesh);
    worldScene.add(this.flashLight);
  }

  onRoundStart() { this.reserve += RESERVE_PER_ROUND; }

  reset() {
    this.mag = MAG_SIZE;
    this.reserve = START_RESERVE;
    this.reloading = 0;
    this.cooldown = 0;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
  }

  get needsReload() { return this.mag === 0; }
  get magSize() { return MAG_SIZE; }

  startReload() {
    if (this.reloading > 0 || this.mag === MAG_SIZE || this.reserve === 0) return;
    this.reloading = RELOAD_TIME;
    this.hooks.onReload();
  }

  step(dt, ctx) {
    this.cooldown -= dt;
    this.flashTime -= dt;

    if (this.flashTime <= 0) {
      this.flash.material.opacity = 0;
      this.flashLight.intensity = 0;
    }

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const want = MAG_SIZE - this.mag;
        const take = Math.min(want, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }

    // Recoil springs: critically-ish damped, tuned by feel.
    this.kickVel += (-this.kick * 260 - this.kickVel * 26) * dt;
    this.kick += this.kickVel * dt;
    this.punchVel += (-this.punch * 190 - this.punchVel * 22) * dt;
    this.punch += this.punchVel * dt;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; t.mesh.material.opacity = 0; }
      else t.mesh.material.opacity = Math.min(1, t.life / 0.05) * 0.85;
    }

    if (ctx.wantFire) this.tryFire(ctx);
  }

  tryFire(ctx) {
    if (this.reloading > 0 || this.cooldown > 0) return;

    if (this.mag <= 0) {
      this.cooldown = 0.25;
      this.hooks.onDryFire();
      if (this.reserve > 0) this.startReload();
      return;
    }

    this.mag--;
    this.cooldown = FIRE_INTERVAL;
    this.hooks.onShot();

    this.kickVel -= 5.2;
    this.punchVel += 3.4;

    this.flash.material.opacity = 0.9;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flashTime = 0.045;
    this.flashLight.position.copy(ctx.camera.position);
    this.flashLight.intensity = 9;

    // --- the shot ---------------------------------------------------------
    ctx.camera.getWorldDirection(_dirV);
    const spread = SPREAD_BASE + Math.min(1, ctx.speed / 8) * SPREAD_MOVE;
    _dirV.x += (Math.random() - 0.5) * spread;
    _dirV.y += (Math.random() - 0.5) * spread;
    _dirV.z += (Math.random() - 0.5) * spread;
    _dirV.normalize();

    _origin.copy(ctx.camera.position);
    _ray.set(_origin, _dirV);
    _ray.far = RANGE;

    const hits = _ray.intersectObjects(ctx.targets, false);
    const hit = hits.length ? hits[0] : null;

    const end = hit
      ? hit.point
      : _tmp.copy(_origin).addScaledVector(_dirV, RANGE).clone();

    this._tracer(_origin, end, ctx.camera);

    if (hit && hit.object.userData.zombie) {
      ctx.horde.damagePart(hit.object, DAMAGE);
      this.hooks.onHit(hit.object.userData.head === true);
    }
  }

  _tracer(from, to, camera) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    // Start it at the muzzle rather than the eye, or it looks like a laser
    // fired out of your forehead.
    _tmp.set(0.13, -0.10, 0).applyQuaternion(camera.quaternion).add(from);
    const len = _tmp.distanceTo(to);
    t.mesh.position.copy(_tmp);
    t.mesh.lookAt(to);
    t.mesh.scale.set(0.025, 0.025, len);
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.85;
    t.life = 0.06;
  }

  /** Called each rendered frame; `bob` and `speed` come from the player. */
  render(alpha, player, aspect) {
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }

    // Sway lags the mouse a little, so whipping the view throws the gun around.
    const targetX = -player.yaw;
    this.sway.x += (0 - this.sway.x) * 0.12;
    this.sway.y += (0 - this.sway.y) * 0.12;

    const bobX = Math.cos(player.bobPhase) * 0.012 * player.bobAmount;
    const bobY = Math.abs(Math.sin(player.bobPhase)) * 0.010 * player.bobAmount;

    const reloadDrop = this.reloading > 0
      ? Math.sin((1 - this.reloading / RELOAD_TIME) * Math.PI) * 0.14
      : 0;

    this.model.position.set(
      this.rest.x + bobX + this.sway.x,
      this.rest.y - bobY - reloadDrop + this.kick * 0.10,
      this.rest.z - this.kick * 0.55
    );
    this.model.rotation.set(
      this.restRot.x - this.kick * 0.6 - reloadDrop * 2.2,
      this.restRot.y + this.sway.y,
      this.restRot.z + reloadDrop * 0.9
    );

    // The slide cycles on every shot.
    this.slide.position.z = -0.14 + Math.max(0, -this.kick) * 0.45;

    void targetX; void alpha;
  }

  /** Extra pitch from recoil, added to the player's aim. */
  get viewPunch() { return this.punch * 0.04; }
}

// A soft radial star, generated rather than downloaded.
function flashTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.25, 'rgba(255,196,110,0.85)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,220,160,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + Math.cos(a) * s / 2, s / 2 + Math.sin(a) * s / 2);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
