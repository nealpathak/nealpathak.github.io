// Loading the world's saved state.
//
// world/state.json is the save file — the world boots from it, so growth
// persists across days instead of being re-invented on each load.
// world/chronicle.json is the visible history of that growth.

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

export async function loadWorld() {
  const [state, chronicle] = await Promise.all([
    loadJson('world/state.json'),
    loadJson('world/chronicle.json'),
  ]);

  // Newest first for display, without mutating the on-disk order (which stays
  // chronological so daily updates can simply append).
  const entries = [...chronicle].sort((a, b) => b.day - a.day);

  return { state, chronicle: entries };
}
