// Tiny synchronous event bus. Systems talk through this instead of holding
// references to each other, which keeps UI decoupled from simulation.

export class EventBus {
  constructor() { this.map = new Map(); }

  on(type, fn) {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }

  off(type, fn) {
    const set = this.map.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this.map.get(type);
    if (!set) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const fn of [...set]) {
      try { fn(payload); }
      catch (err) { console.error(`[events] handler for "${type}" threw`, err); }
    }
  }

  clear() { this.map.clear(); }
}

export const bus = new EventBus();
