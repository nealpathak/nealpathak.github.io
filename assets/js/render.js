/* Pure data → DOM helpers.
 *
 * Nothing here knows what a captive is. Renderers take a value and a shape and
 * return an element, which is what keeps a second workflow to a new data file
 * rather than a rewrite.
 */

/* ---------- Formatting ---------- */

export const fmt = {
  money(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US');
  },
  moneyShort(n) {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`;
    return `${sign}$${Math.round(abs)}`;
  },
  pct(n, dp = 1) {
    // An em dash rather than 0%. These formatters are fed by field lookups, and
    // a rename that silently coerces undefined to zero puts a plausible wrong
    // number on a board memo instead of raising anything.
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return `${(Number(n) * 100).toFixed(dp)}%`;
  },
  factor(n) {
    return (Number(n) || 0).toFixed(4);
  },
  int(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString('en-US');
  },
  date(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${d} ${months[m - 1]} ${y}`;
  },
};

const FORMATTERS = {
  money: fmt.money,
  currency: fmt.money,
  moneyShort: fmt.moneyShort,
  percent: (n) => fmt.pct(n, 1),
  factor: fmt.factor,
  int: fmt.int,
};

export function format(value, kind) {
  return (FORMATTERS[kind] || String)(value);
}

/* ---------- Elements ---------- */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v === true ? '' : String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function frag(children) {
  const f = document.createDocumentFragment();
  children.filter(Boolean).forEach((c) => f.append(c));
  return f;
}

/* ---------- Traceability ----------
 * The mechanism behind the claim that every figure links to its source. A
 * traced figure is a button; activating it reveals the method that produced
 * the number and the rows it was computed from.
 */

let traceSeq = 0;

function sourceTable(trace) {
  const rows = trace.rows || [];
  const head = el('tr', {}, [
    el('th', { scope: 'col', text: 'Claim' }),
    el('th', { scope: 'col', text: 'Insured' }),
    el('th', { scope: 'col', text: 'Cov' }),
    el('th', { scope: 'col', text: 'Status' }),
    el('th', { scope: 'col', class: 'num', text: 'Paid' }),
    el('th', { scope: 'col', class: 'num', text: 'Reserve' }),
    el('th', { scope: 'col', class: 'num', text: 'Incurred' }),
  ]);

  const body = rows.map((r) =>
    el('tr', {}, [
      el('td', { class: 'mono', text: r.claimNo }),
      el('td', { text: r.insuredEntity }),
      el('td', { text: r.coverageCode }),
      el('td', { text: r.status }),
      el('td', { class: 'num', text: fmt.money(r.paid) }),
      el('td', { class: 'num', text: fmt.money(r.caseReserve) }),
      el('td', { class: 'num', text: fmt.money(r.incurred) }),
    ])
  );

  return el('div', { class: 'table-wrap' }, [
    el('table', {}, [el('thead', {}, head), el('tbody', {}, body)]),
  ]);
}

/** A figure that can defend itself. */
export function traced(figure, kind, opts = {}) {
  traceSeq += 1;
  const id = `trace-${traceSeq}`;
  const panelId = `${id}-source`;
  const trace = figure.trace || {};

  const btn = el('button', {
    type: 'button',
    class: 'trace',
    id,
    'aria-expanded': 'false',
    'aria-controls': panelId,
    title: 'Show the rows behind this figure',
    text: format(figure.value, kind),
  });

  const shown = (trace.rows || []).length;
  const counted = trace.rowCount || 0;

  const panel = el('div', {
    class: 'trace__source',
    id: panelId,
    hidden: true,
    role: 'region',
    'aria-labelledby': id,
    'data-figure': format(figure.value, kind),
  }, [
    el('p', { class: 'small', style: 'margin-bottom:0.5rem' }, [
      el('strong', { text: 'How this was computed. ' }),
      trace.method || '—',
    ]),
    counted > 0
      ? el('p', { class: 'small muted', style: 'margin-bottom:0.5rem' }, [
          shown < counted
            ? `Computed from ${fmt.int(counted)} rows. The ${shown} largest are shown.`
            : `Computed from ${fmt.int(counted)} row${counted === 1 ? '' : 's'}.`,
        ])
      : null,
    (trace.rows || []).length ? sourceTable(trace) : null,
  ]);

  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.hidden = open;
  });

  const host = opts.host;
  if (host) {
    host.append(panel);
    return btn;
  }
  return frag([btn, panel]);
}

/** A traced figure that drops its source panel into a named host element,
 *  so an inline number in a sentence doesn't split the paragraph. */
export function inlineTraced(figure, kind, host) {
  return traced(figure, kind, { host });
}

/* ---------- Components ---------- */

export function dataTable(columns, rows, opts = {}) {
  const head = el(
    'tr',
    {},
    columns.map((c) => el('th', { scope: 'col', class: c.num ? 'num' : null, text: c.label }))
  );

  const body = rows.map((r) => {
    const tr = el('tr', r.__attrs || {});
    columns.forEach((c) => {
      const raw = typeof c.get === 'function' ? c.get(r) : r[c.key];
      const cell =
        raw instanceof Node
          ? el('td', { class: c.num ? 'num' : c.cls || null }, [raw])
          : el('td', {
              class: c.num ? 'num' : c.cls || null,
              text: c.kind ? format(raw, c.kind) : String(raw ?? '—'),
            });
      tr.append(cell);
    });
    return tr;
  });

  return el('div', { class: `table-wrap ${opts.class || ''}` }, [
    el('table', {}, [el('thead', {}, head), el('tbody', {}, body)]),
  ]);
}

export function badge(text, tone) {
  return el('span', { class: `badge badge--${tone}`, text });
}
