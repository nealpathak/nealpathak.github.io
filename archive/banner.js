// Chrome for archived snapshots.
//
// Loaded by every snapshot's index.html. Reads the day out of that snapshot's
// own state.json, so this file never needs editing when a new one is added.
//
// This is the only part of an archived page that is allowed to change after
// the fact — the world itself stays exactly as it shipped.

(async () => {
  let day = null;
  let date = null;
  try {
    const res = await fetch('world/state.json', { cache: 'no-cache' });
    const state = await res.json();
    day = state.day;
    date = state.updated || state.born;
  } catch {
    // A snapshot that can't read its own state still gets a way home.
  }

  const bar = document.createElement('div');
  bar.className = 'archive-bar';

  const label = document.createElement('span');
  label.className = 'archive-bar__label';
  label.innerHTML = day
    ? `Archived world &middot; <strong>Day ${day}</strong>${date ? ` &middot; ${date}` : ''}`
    : 'Archived world';

  const back = document.createElement('a');
  back.className = 'archive-bar__back';
  back.href = '../../';
  back.textContent = 'Today';

  bar.append(label, back);
  document.body.append(bar);
})();
