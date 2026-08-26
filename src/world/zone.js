// A zone: terrain, architecture, foliage, spawn points and its mood, built from
// a declarative description.
//
// Zone data lives in src/data/zones.js. This file is the machine that reads it.

import * as THREE from 'three';
import { Terrain, plateau, ridge, basin, path, escarpment } from './terrain.js';
import { CollisionWorld, BoxCollider } from './collision.js';
import { FoliageField } from './foliage.js';
import * as PROPS from './props.js';
import { makeRng } from '../core/rng.js';
import { settings } from '../core/settings.js';

const SHAPERS = { plateau, ridge, basin, path, escarpment };

export class Zone {
  /**
   * @param {object} def   a zone definition from data/zones.js
   * @param {THREE.Scene} scene
   */
  constructor(def, scene) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.mood = def.mood;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = `zone:${def.id}`;
    scene.add(this.group);

    this.props = [];
    this.shrines = [];
    this.spawns = [];
    this.interactables = [];
    this.rng = makeRng(def.seed ?? 1);

    this._buildTerrain();
    this._buildProps();
    this._buildFoliage();
    this._collectSpawns();
  }

  _buildTerrain() {
    const t = this.def.terrain;
    const shapers = (t.shapers ?? []).map((spec) => {
      const fn = SHAPERS[spec[0]];
      if (!fn) { console.warn(`[zone] unknown shaper "${spec[0]}"`); return () => 0; }
      return fn(...spec.slice(1));
    });

    this.terrain = new Terrain({ ...t, shapers, seed: this.def.seed ?? 1 });
    const preset = settings.preset;
    const lod = preset.foliage < 0.4 ? 2 : 1;
    this.group.add(this.terrain.build({ lodStep: lod }));

    this.collision = new CollisionWorld(this.terrain, { cellSize: 8 });

    // An invisible wall around the playable area, so the player cannot walk off
    // the edge of the heightfield into empty space.
    const half = this.terrain.size / 2 - 2;
    const [ox, oz] = this.terrain.origin;
    const h = 30;
    for (const [dx, dz, sx, sz] of [
      [0, -half, half, 1], [0, half, half, 1], [-half, 0, 1, half], [half, 0, 1, half],
    ]) {
      this.collision.add(new BoxCollider(
        new THREE.Vector3(ox + dx, this.terrain.heightAt(ox + dx, oz + dz) + h / 2, oz + dz),
        new THREE.Vector3(sx, h, sz), 0, { tag: 'bounds' },
      ));
    }
  }

  _buildProps() {
    for (const spec of this.def.props ?? []) {
      const build = PROPS[spec.kind];
      if (!build) { console.warn(`[zone] unknown prop "${spec.kind}"`); continue; }

      const instances = spec.at ? spec.at : this._scatter(spec);
      for (const place of instances) {
        const [x, z] = place;
        const rotY = place[2] ?? this.rng() * Math.PI * 2;
        const opts = { ...(spec.opts ?? {}), seed: (spec.opts?.seed ?? 1) + (this.rng() * 1e6 | 0) };
        const built = build(opts);
        const y = (place[3] ?? this.terrain.heightAt(x, z)) + (spec.yOffset ?? 0);
        built.object.position.set(x, y, z);
        built.object.rotation.y = rotY;
        this.group.add(built.object);

        if (built.colliders && spec.collide !== false) {
          const origin = new THREE.Vector3(x, y, z);
          for (const col of built.colliders(origin, rotY)) this.collision.add(col);
        }
        const entry = { spec, built, position: new THREE.Vector3(x, y, z), rotY };
        this.props.push(entry);
        if (spec.kind === 'emberwake') {
          entry.id = spec.id ?? `shrine:${this.id}:${this.shrines.length}`;
          entry.name = spec.name ?? this.name;
          this.shrines.push(entry);
        }
      }
    }
  }

  /** Scatter placements that respect slope, keep-out radii and each other. */
  _scatter(spec) {
    const out = [];
    const count = spec.count ?? 10;
    const area = spec.area ?? { x: 0, z: 0, radius: this.terrain.size * 0.45 };
    const minGap = spec.minGap ?? 3;
    const maxSlope = spec.maxSlope ?? 0.5;
    const avoid = spec.avoid ?? [];
    let attempts = 0;
    while (out.length < count && attempts < count * 60) {
      attempts++;
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * area.radius;
      const x = area.x + Math.cos(a) * r;
      const z = area.z + Math.sin(a) * r;
      if (this.terrain.slopeAt(x, z) > maxSlope) continue;
      const blend = this.terrain.blendAt(x, z);
      if (blend.path > 0.25) continue;
      if (spec.onRock && blend.rock < 0.3) continue;
      let ok = true;
      for (const [ax, az, ar] of avoid) {
        if (Math.hypot(x - ax, z - az) < ar) { ok = false; break; }
      }
      if (!ok) continue;
      for (const p of out) {
        if (Math.hypot(x - p[0], z - p[1]) < minGap) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([x, z]);
    }
    return out;
  }

  _buildFoliage() {
    const f = this.def.foliage;
    if (!f) return;
    const quality = settings.preset.foliage;
    if (quality <= 0.01) return;
    this.foliage = new FoliageField(this.terrain, {
      ...f, quality, seed: (this.def.seed ?? 1) + 991,
      centre: f.centre ?? this.terrain.origin,
    });
    this.group.add(this.foliage.group);
  }

  _collectSpawns() {
    for (const s of this.def.spawns ?? []) {
      this.spawns.push({
        ...s,
        position: new THREE.Vector3(s.at[0], this.terrain.heightAt(s.at[0], s.at[1]), s.at[1]),
      });
    }
  }

  /** Where the player starts, or respawns if no shrine is lit. */
  get startPoint() {
    const s = this.def.start ?? [0, 0];
    return new THREE.Vector3(s[0], this.terrain.heightAt(s[0], s[1]) + 0.1, s[1]);
  }

  shrineById(id) { return this.shrines.find((s) => s.id === id) ?? null; }

  dispose() {
    this.scene.remove(this.group);
    this.terrain?.dispose();
    this.foliage?.dispose();
    this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose?.(); });
  }
}
