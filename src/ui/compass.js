// The compass strip.
//
// A 240-metre valley in heavy fog is easy to get lost in, and a full map screen
// would be a bigger promise than this game keeps. A thin strip of bearings
// along the top gives you the shrine, the boss, your bloodstain and your party
// without ever taking the camera away from you.

import * as THREE from 'three';
import { bus } from '../core/events.js';
import { shortestAngle, clamp01 } from '../core/math.js';

const HALF_FOV = 1.15;   // radians either side of centre that the strip covers

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

export class Compass {
  constructor(root, game) {
    this.game = game;
    this.el = el('div', 'compass', root);
    this.ticks = el('div', 'compass__ticks', this.el);
    this.marks = el('div', 'compass__marks', this.el);
    this._marks = new Map();
    this._v = new THREE.Vector3();

    for (const [label, bearing] of [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]]) {
      const t = el('span', 'compass__card', this.ticks, label);
      t.dataset.bearing = String(bearing);
    }
    const wipe = () => { this._marks.forEach((m) => m.node.remove()); this._marks.clear(); };
    bus.on('progression:respawned', wipe);
    // Marks are keyed by id, and ids from the zone you just left mean nothing
    // in the one you arrived in.
    bus.on('game:zoneChanged', wipe);
  }

  /** Points of interest worth a bearing, rebuilt each frame — there are few. */
  _points() {
    const g = this.game;
    const out = [];
    for (const s of g.zone.shrines) {
      out.push({ id: s.id, kind: 'shrine', position: s.position, label: s.name, lit: s.built.flame.visible });
    }
    for (const gate of g.zone.gates) {
      out.push({ id: gate.id ?? `gate:${gate.name}`, kind: 'gate', position: gate.position, label: gate.name });
    }
    if (g.progression?.bloodstain) {
      out.push({ id: 'stain', kind: 'stain', position: g.progression.bloodstain.position, label: 'Cinders' });
    }
    if (g.boss?.alive && g.boss.engaged) {
      out.push({ id: 'boss', kind: 'boss', position: g.boss.position, label: g.boss.name });
    } else if (g.boss?.alive) {
      out.push({ id: 'boss', kind: 'bossIdle', position: g.boss.arena?.centre ?? g.boss.position, label: 'Something waits' });
    }
    for (const a of g.allies) {
      if (a.alive) out.push({ id: `ally:${a.id}`, kind: 'ally', position: a.position, label: a.name });
    }
    return out;
  }

  update() {
    const g = this.game;
    const camYaw = g.camera.yaw;

    // Cardinal ticks slide with the camera.
    for (const t of this.ticks.children) {
      const rel = shortestAngle(camYaw + Math.PI, Number(t.dataset.bearing));
      const x = rel / HALF_FOV;
      if (Math.abs(x) > 1.05) { t.style.opacity = '0'; continue; }
      t.style.opacity = String(clamp01(1.15 - Math.abs(x)));
      t.style.transform = `translateX(${(x * 50).toFixed(1)}%) translateX(-50%)`;
    }

    const seen = new Set();
    for (const p of this._points()) {
      const dx = p.position.x - g.player.position.x;
      const dz = p.position.z - g.player.position.z;
      const dist = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, dz);
      const rel = shortestAngle(camYaw + Math.PI, bearing);
      seen.add(p.id);

      let mark = this._marks.get(p.id);
      if (!mark) {
        const node = el('div', `cmark cmark--${p.kind}`, this.marks);
        el('i', 'cmark__pip', node);
        const dnode = el('span', 'cmark__dist', node);
        mark = { node, dnode };
        this._marks.set(p.id, mark);
      }
      if (mark.node.className !== `cmark cmark--${p.kind}`) mark.node.className = `cmark cmark--${p.kind}`;
      mark.node.classList.toggle('cmark--dim', p.kind === 'shrine' && !p.lit);

      const x = rel / HALF_FOV;
      // Marks outside the strip clamp to its edge rather than vanishing, so you
      // always know which way to turn.
      const clamped = Math.max(-1, Math.min(1, x));
      mark.node.style.transform = `translateX(${(clamped * 50).toFixed(1)}%) translateX(-50%)`;
      mark.node.style.opacity = String(Math.abs(x) > 1 ? 0.45 : 1);
      mark.node.title = p.label;
      mark.dnode.textContent = dist > 999 ? '' : `${Math.round(dist)}m`;
    }

    for (const [id, mark] of this._marks) {
      if (seen.has(id)) continue;
      mark.node.remove();
      this._marks.delete(id);
    }
  }

  setVisible(v) { this.el.style.display = v ? '' : 'none'; }
}
