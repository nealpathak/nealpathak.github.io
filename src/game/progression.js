// Progression: cinders, levelling, shrines, and the death loop.
//
// The death loop is the load-bearing system of the genre. Dying costs you
// everything you were carrying, drops it where you fell, and gives you exactly
// one chance to walk back and pick it up. Everything else — respawning enemies,
// refilling the flask, the shrine as the only safe place — exists to make that
// walk back mean something.

import * as THREE from 'three';
import { bus } from '../core/events.js';
import { StatBlock, STAT_KEYS } from '../combat/stats.js';
import { makeGlowMaterial } from '../render/materials.js';
import { saveGame, loadGame } from '../core/save.js';

export class Progression {
  constructor(game) {
    this.game = game;
    this.player = game.player;

    this.bloodstain = null;        // { position, cinders, mesh }
    this.lastShrine = null;
    // Kindled shrines are tracked by id across every zone, not by walking the
    // zone that happens to be loaded: the other one is not in memory.
    this.litShrines = new Set();
    this.lastShrineId = null;
    this.deaths = 0;
    this.bindsAttempted = 0;
    this.bindsSucceeded = 0;
    this.enemiesFelled = 0;
    this.playTime = 0;

    this._wire();
  }

  _wire() {
    bus.on('enemy:died', ({ enemy }) => {
      this.enemiesFelled++;
      // Recovering your own dropped cinders should not double-count as income.
      void enemy;
    });
    bus.on('player:died', () => this.onPlayerDeath());
    bus.on('player:interact', ({ target }) => {
      if (target?.type === 'shrine') this.restAt(target.shrine);
      if (target?.type === 'bloodstain') this.recoverBloodstain();
      if (target?.type === 'gate') {
        this.game.travelTo(target.gate.to, { arrive: target.gate.arrive });
      }
    });
  }

  // --- death ----------------------------------------------------------------

  onPlayerDeath() {
    this.deaths++;
    const dropped = this.player.cinders;
    this.player.cinders = 0;

    // A second death before recovery loses the first stain for good.
    if (this.bloodstain) this._clearBloodstain();
    if (dropped > 0) this._placeBloodstain(this.player.position, dropped);

    bus.emit('ui:announce', { text: 'You Died', kind: 'death' });
    this.game.beginDeathSequence(dropped);
  }

  _placeBloodstain(position, cinders) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 1),
      makeGlowMaterial(0xffb257, { opacity: 0.55 }),
    );
    core.name = 'core';
    group.add(core);
    const light = new THREE.PointLight(0xffa040, 3.2, 9, 2);
    light.position.y = 0.5;
    group.add(light);
    group.position.set(position.x, this.game.zone.terrain.heightAt(position.x, position.z) + 0.5, position.z);
    this.game.scene.add(group);

    this.bloodstain = { position: group.position.clone(), cinders, mesh: group, core, light };
    bus.emit('ui:toast', { text: `${cinders} cinders lost. Find where you fell.`, kind: 'bad', duration: 5 });
  }

  _clearBloodstain() {
    if (!this.bloodstain) return;
    this.game.scene.remove(this.bloodstain.mesh);
    this.bloodstain.core.geometry.dispose();
    this.bloodstain.core.material.dispose();
    this.bloodstain = null;
  }

  recoverBloodstain() {
    if (!this.bloodstain) return;
    const amount = this.bloodstain.cinders;
    this.player.cinders += amount;
    this.game.fx.deathBurst(this.bloodstain.position, 0xffd08a);
    this._clearBloodstain();
    bus.emit('ui:toast', { text: `+${amount} cinders recovered`, kind: 'gold', duration: 3 });
    bus.emit('progression:recovered', { amount });
  }

  /** Respawn at the last shrine, or the zone start if there isn't one. */
  respawn() {
    // Dying in one zone with your last ember in another sends you back to the
    // ember, not to the mouth of the zone you died in.
    const homeZone = this.lastShrineId?.split(':')[1];
    if (homeZone && homeZone !== this.game.zone.id) {
      this.game.travelTo(homeZone, { announce: false, save: false });
      this.lastShrine = this.game.zone.shrineById(this.lastShrineId);
    }
    const shrine = this.lastShrine;
    const point = shrine ? shrine.position : this.game.zone.startPoint;
    const yaw = shrine ? shrine.rotY + Math.PI : 0;
    const spot = new THREE.Vector3(
      point.x - Math.sin(yaw) * 1.6,
      0,
      point.z - Math.cos(yaw) * 1.6,
    );
    spot.y = this.game.zone.terrain.heightAt(spot.x, spot.z);
    this.player.respawn(spot, yaw);
    this.player.flask.charges = this.player.flask.max;
    this.game.spawnEnemies();
    this.game.camera.snapTo(this.player);
    bus.emit('progression:respawned', { shrine });
  }

  // --- shrines --------------------------------------------------------------

  restAt(shrine) {
    this.lastShrine = shrine;
    this.lastShrineId = shrine.id;
    this.litShrines.add(shrine.id);
    if (!shrine.built.flame.visible) {
      shrine.built.flame.visible = true;
      bus.emit('ui:announce', { text: shrine.name ?? 'Emberwake Kindled', kind: 'area', duration: 3.4 });
    }
    this.player.health = this.player.maxHealth;
    this.player.stamina = this.player.maxStamina;
    this.player.focus = this.player.maxFocus;
    this.player.poise = this.player.maxPoise;
    this.player.status.clear();
    this.player.flask.charges = this.player.flask.max;
    this.game.spawnEnemies();
    this.save();
    bus.emit('progression:rested', { shrine });
  }

  /** Light every shrine in the loaded zone that this player has kindled. */
  applyLitShrines() {
    for (const s of this.game.zone.shrines) {
      s.built.flame.visible = this.litShrines.has(s.id);
      if (s.built.light) s.built.light.intensity = s.built.flame.visible ? 9 : 0;
    }
  }

  // --- levelling ------------------------------------------------------------

  levelCost() { return StatBlock.levelCost(this.player.stats.level); }

  canLevel(stat) {
    return STAT_KEYS.includes(stat)
      && this.player.cinders >= this.levelCost()
      && this.player.stats[stat] < 99;
  }

  levelUp(stat) {
    if (!this.canLevel(stat)) return false;
    const cost = this.levelCost();
    this.player.cinders -= cost;
    this.player.stats[stat] += 1;
    this.player.stats.level += 1;
    this.player.refreshDerived({ keepRatios: true });
    this.player._recomputeLoad();
    bus.emit('progression:levelled', { stat, level: this.player.stats.level, cost });
    this.save();
    return true;
  }

  // --- save -----------------------------------------------------------------

  snapshot() {
    return {
      zone: this.game.zone.id,
      shrine: this.lastShrineId,
      stats: this.player.stats.toJSON(),
      cinders: this.player.cinders,
      flask: { ...this.player.flask },
      bloodstain: this.bloodstain
        ? { position: this.bloodstain.position.toArray(), cinders: this.bloodstain.cinders }
        : null,
      litShrines: [...this.litShrines],
      covenant: this.game.covenant?.snapshot() ?? null,
      inventory: this.game.inventory?.snapshot() ?? null,
      counters: {
        deaths: this.deaths, enemiesFelled: this.enemiesFelled,
        bindsAttempted: this.bindsAttempted, bindsSucceeded: this.bindsSucceeded,
        playTime: Math.round(this.playTime),
      },
    };
  }

  save() { saveGame(this.snapshot()); }

  restore(data = loadGame()) {
    if (!data) return false;
    const p = this.player;
    Object.assign(p.stats, StatBlock.fromJSON(data.stats));
    p.refreshDerived({ keepRatios: false });
    p.cinders = data.cinders ?? 0;
    if (data.flask) Object.assign(p.flask, data.flask);

    this.litShrines = new Set(data.litShrines ?? []);
    this.lastShrineId = data.shrine ?? null;
    // A save made in the far zone reopens there.
    if (data.zone && data.zone !== this.game.zone.id) {
      this.game.travelTo(data.zone, { announce: false, save: false });
    }
    this.applyLitShrines();
    this.lastShrine = this.lastShrineId ? this.game.zone.shrineById(this.lastShrineId) : null;

    if (data.bloodstain) {
      const v = new THREE.Vector3().fromArray(data.bloodstain.position);
      this._placeBloodstain(v, data.bloodstain.cinders);
    }
    if (data.counters) Object.assign(this, data.counters);
    this.game.covenant?.restore(data.covenant);
    this.game.inventory?.restore(data.inventory);
    p._recomputeLoad();
    bus.emit('progression:restored', { data });
    return true;
  }

  update(dt) {
    this.playTime += dt;
    const b = this.bloodstain;
    if (b) {
      const t = this.playTime * 2.2;
      b.core.rotation.y += dt * 0.9;
      b.core.rotation.x += dt * 0.4;
      const k = 0.9 + Math.sin(t) * 0.12;
      b.core.scale.setScalar(k);
      b.light.intensity = 2.8 + Math.sin(t * 1.6) * 0.9;
    }
  }
}
