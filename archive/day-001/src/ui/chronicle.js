// The chronicle panel.
//
// This is what turns a scene into a story. Someone arriving on day 40 has no
// way of knowing the world has been growing unless it tells them, so every
// daily update leaves an entry here.

export function createChronicle(entries) {
  const panel = document.querySelector('[data-chronicle="panel"]');
  const list = document.querySelector('[data-chronicle="list"]');
  const toggle = document.querySelector('[data-chronicle="toggle"]');

  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'chronicle__entry';

    const head = document.createElement('div');
    head.className = 'chronicle__head';

    const day = document.createElement('span');
    day.className = 'chronicle__day';
    day.textContent = `Day ${entry.day}`;

    const date = document.createElement('time');
    date.className = 'chronicle__date';
    date.dateTime = entry.date;
    date.textContent = entry.date;

    head.append(day, date);

    const title = document.createElement('h3');
    title.className = 'chronicle__title';
    title.textContent = entry.title;

    const text = document.createElement('p');
    text.className = 'chronicle__text';
    text.textContent = entry.text;

    item.append(head, title, text);
    list.append(item);
  }

  let open = false;
  function setOpen(next) {
    open = next;
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Chronicle';
  }

  toggle.addEventListener('click', () => setOpen(!open));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  setOpen(false);
}
