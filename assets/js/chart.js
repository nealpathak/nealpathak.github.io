// Hand-rolled SVG charts. No library, no canvas — every mark is a DOM node that
// inherits the page's colour tokens, so light and dark mode come for free.

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function frame(width, height, label) {
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'chart',
    role: 'img',
    'aria-label': label ?? '',
    preserveAspectRatio: 'xMinYMin meet',
  });
  svg.style.width = '100%';
  svg.style.height = 'auto';
  return svg;
}

/** Round a maximum up to a clean axis bound. */
function niceMax(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Horizontal paired bars — one row per item, two bars per row.
 * @param {{label:string, a:number, b:number}[]} rows
 * @param {{aName:string, bName:string, format:(n:number)=>string, title:string}} opts
 */
export function pairedBars(rows, opts = {}) {
  const format = opts.format ?? (n => String(Math.round(n)));
  const labelW = 200;
  const valueW = 78;
  const rowH = 34;
  const barH = 11;
  const padTop = 8;
  const width = 720;
  const height = padTop + rows.length * rowH + 8;
  const plotW = width - labelW - valueW - 16;
  const max = niceMax(Math.max(1, ...rows.flatMap(r => [r.a, r.b])));

  const svg = frame(width, height, opts.title);

  rows.forEach((r, i) => {
    const y = padTop + i * rowH;
    svg.appendChild(el('text', {
      x: 0, y: y + 14, 'font-size': 12.5,
    }, r.label));

    const bars = [
      { v: r.a, fill: 'var(--ink-faint)', dy: 2 },
      { v: r.b, fill: 'var(--accent)', dy: 2 + barH + 3 },
    ];
    for (const b of bars) {
      const w = Math.max(b.v > 0 ? 1.5 : 0, (b.v / max) * plotW);
      svg.appendChild(el('rect', {
        x: labelW, y: y + b.dy, width: w, height: barH,
        fill: b.fill, rx: 1,
      }));
    }

    svg.appendChild(el('text', {
      x: width, y: y + 14, 'text-anchor': 'end',
      'font-size': 12.5, class: 'chart__value',
    }, format(r.b)));
    const delta = r.a - r.b;
    svg.appendChild(el('text', {
      x: width, y: y + 27, 'text-anchor': 'end', 'font-size': 11,
      fill: delta > 0 ? 'var(--positive)' : 'var(--ink-faint)',
    }, delta > 0 ? `−${format(delta)}` : '—'));
  });

  svg.appendChild(el('line', {
    x1: labelW, y1: padTop, x2: labelW, y2: height - 6,
    class: 'chart__axis--strong', stroke: 'var(--rule-strong)',
  }));

  return svg;
}

/**
 * Cumulative cash-flow line with a zero baseline and a breakeven marker.
 * @param {number[]} values  cumulative value at each month index
 * @param {{breakeven:number|null, format:(n:number)=>string, title:string}} opts
 */
export function cumulativeLine(values, opts = {}) {
  const format = opts.format ?? (n => String(Math.round(n)));
  const width = 720;
  const height = 250;
  const padL = 62, padR = 12, padT = 14, padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const top = niceMax(hi || 1);
  const bottom = lo < 0 ? -niceMax(-lo) : 0;
  const span = top - bottom || 1;

  const x = i => padL + (i / Math.max(1, values.length - 1)) * plotW;
  const y = v => padT + (1 - (v - bottom) / span) * plotH;

  const svg = frame(width, height, opts.title);

  // Horizontal gridlines at quarter intervals of the value span.
  for (let t = 0; t <= 4; t++) {
    const v = bottom + (span * t) / 4;
    const yy = y(v);
    svg.appendChild(el('line', {
      x1: padL, y1: yy, x2: width - padR, y2: yy,
      stroke: 'var(--rule)', 'stroke-width': 1,
    }));
    svg.appendChild(el('text', {
      x: padL - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 11,
    }, format(v)));
  }

  // Zero line, drawn stronger.
  svg.appendChild(el('line', {
    x1: padL, y1: y(0), x2: width - padR, y2: y(0),
    stroke: 'var(--rule-strong)', 'stroke-width': 1,
  }));

  // Filled area between the curve and zero.
  const area = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join('');
  svg.appendChild(el('path', {
    d: `${area}L${x(values.length - 1).toFixed(2)},${y(0).toFixed(2)}L${x(0).toFixed(2)},${y(0).toFixed(2)}Z`,
    fill: 'var(--accent)', opacity: .09,
  }));
  svg.appendChild(el('path', {
    d: area, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
    'stroke-linejoin': 'round',
  }));

  // Month ticks — every 6 months, plus the final month.
  for (let i = 0; i < values.length; i += 6) {
    svg.appendChild(el('text', {
      x: x(i), y: height - 8, 'text-anchor': 'middle', 'font-size': 11,
    }, `M${i}`));
  }

  if (opts.breakeven !== null && opts.breakeven !== undefined && opts.breakeven >= 0) {
    const bx = x(opts.breakeven);
    svg.appendChild(el('line', {
      x1: bx, y1: padT, x2: bx, y2: padT + plotH,
      stroke: 'var(--signal)', 'stroke-width': 1, 'stroke-dasharray': '3 3',
    }));
    svg.appendChild(el('circle', {
      cx: bx, cy: y(0), r: 3.5, fill: 'var(--signal)',
    }));
    const flip = bx > width * 0.7;
    svg.appendChild(el('text', {
      x: bx + (flip ? -7 : 7), y: padT + 11,
      'text-anchor': flip ? 'end' : 'start',
      'font-size': 11, fill: 'var(--signal)',
    }, `breakeven M${Math.ceil(opts.breakeven)}`));
  }

  return svg;
}

/**
 * Tornado chart — diverging bars around a centre baseline, sorted by span.
 * @param {{label:string, low:number, high:number}[]} items  deltas from base
 * @param {{format:(n:number)=>string, title:string}} opts
 */
export function tornado(items, opts = {}) {
  const format = opts.format ?? (n => String(Math.round(n)));
  const labelW = 168;
  const rowH = 30;
  const barH = 15;
  const width = 720;
  const height = items.length * rowH + 22;
  const plotL = labelW;
  const plotW = width - labelW - 8;
  const centre = plotL + plotW / 2;
  const max = niceMax(Math.max(1, ...items.flatMap(d => [Math.abs(d.low), Math.abs(d.high)])));
  const scale = v => (v / max) * (plotW / 2);

  const svg = frame(width, height, opts.title);

  items.forEach((d, i) => {
    const y = 6 + i * rowH;
    svg.appendChild(el('text', { x: 0, y: y + barH - 2, 'font-size': 12.5 }, d.label));

    // Colour by the sign of the effect, not by which direction of the driver
    // produced it — for inverse drivers such as build cost, a downward move is
    // the favourable one.
    for (const v of [d.low, d.high]) {
      const w = scale(v);
      svg.appendChild(el('rect', {
        x: w < 0 ? centre + w : centre,
        y, width: Math.abs(w), height: barH, rx: 1, opacity: .8,
        fill: v >= 0 ? 'var(--positive)' : 'var(--signal)',
      }));
    }

    const lo = Math.min(d.low, d.high);
    const hi = Math.max(d.low, d.high);
    svg.appendChild(el('text', {
      x: centre + scale(Math.min(lo, 0)) - 6,
      y: y + barH - 3, 'text-anchor': 'end', 'font-size': 11,
    }, format(lo)));
    svg.appendChild(el('text', {
      x: centre + scale(Math.max(hi, 0)) + 6,
      y: y + barH - 3, 'font-size': 11,
    }, format(hi)));
  });

  svg.appendChild(el('line', {
    x1: centre, y1: 0, x2: centre, y2: height - 14,
    stroke: 'var(--rule-strong)', 'stroke-width': 1,
  }));
  svg.appendChild(el('text', {
    x: centre, y: height - 2, 'text-anchor': 'middle', 'font-size': 11,
  }, 'base case'));

  return svg;
}
