// Hand-rolled SVG charts. Returns markup strings; no dependencies.
// Colours come from CSS custom properties so charts follow the site theme.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function niceTicks(min, max, count = 5) {
  if (max === min) max = min + 1;
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, lo, hi };
}

export function scale(domainLo, domainHi, rangeLo, rangeHi) {
  const k = (rangeHi - rangeLo) / ((domainHi - domainLo) || 1);
  return v => rangeLo + (v - domainLo) * k;
}

export const CH = {
  ink: 'var(--ink)', muted: 'var(--muted)', rule: 'var(--rule)', accent: 'var(--accent)', paper: 'var(--paper)',
  series: ['var(--ink)', 'var(--accent)', 'var(--muted)', 'var(--s4)', 'var(--s5)', 'var(--s6)'],
};

// Line chart. series: [{name, values:[{x,y}], color?, dashed?}], x numeric.
export function lineChart({ series, width = 640, height = 300, margin = { t: 16, r: 16, b: 32, l: 56 }, yFormat = v => v, xFormat = v => v, xTicks = null, yMin = null, yMax = null, annotations = [], title = '' }) {
  const allY = series.flatMap(s => s.values.map(p => p.y)).filter(v => v !== null && v !== undefined);
  const allX = series.flatMap(s => s.values.map(p => p.x));
  if (!allY.length) return `<svg viewBox="0 0 ${width} ${height}" class="chart"></svg>`;
  const yT = niceTicks(yMin === null ? Math.min(0, ...allY) : yMin, yMax === null ? Math.max(...allY) : yMax, 5);
  const xLo = Math.min(...allX), xHi = Math.max(...allX);
  const sx = scale(xLo, xHi, margin.l, width - margin.r);
  const sy = scale(yT.lo, yT.hi, height - margin.b, margin.t);
  let out = `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="${esc(title)}">`;
  for (const t of yT.ticks) {
    out += `<line x1="${margin.l}" x2="${width - margin.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="${CH.rule}" stroke-width="1"/>`;
    out += `<text x="${margin.l - 8}" y="${sy(t) + 4}" text-anchor="end" class="tick">${esc(yFormat(t))}</text>`;
  }
  const xs = xTicks || [...new Set(allX)].sort((a, b) => a - b);
  for (const t of xs) out += `<text x="${sx(t)}" y="${height - margin.b + 18}" text-anchor="middle" class="tick">${esc(xFormat(t))}</text>`;
  series.forEach((s, i) => {
    const color = s.color || CH.series[i % CH.series.length];
    const pts = s.values.filter(p => p.y !== null && p.y !== undefined);
    const d = pts.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${s.width || 1.75}" ${s.dashed ? 'stroke-dasharray="4 3"' : ''}/>`;
    if (s.dots !== false) for (const p of pts) out += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2.5" fill="${color}"/>`;
    if (s.label !== false && pts.length) {
      const last = pts[pts.length - 1];
      out += `<text x="${sx(last.x) + 6}" y="${sy(last.y) + 4}" class="label" fill="${color}">${esc(s.name)}</text>`;
    }
  });
  for (const a of annotations) {
    if (a.y !== undefined) {
      out += `<line x1="${margin.l}" x2="${width - margin.r}" y1="${sy(a.y)}" y2="${sy(a.y)}" stroke="${a.color || CH.accent}" stroke-width="1" stroke-dasharray="2 3"/>`;
      out += `<text x="${width - margin.r}" y="${sy(a.y) - 5}" text-anchor="end" class="label" fill="${a.color || CH.accent}">${esc(a.label || '')}</text>`;
    }
    if (a.x !== undefined) {
      out += `<line y1="${margin.t}" y2="${height - margin.b}" x1="${sx(a.x)}" x2="${sx(a.x)}" stroke="${a.color || CH.accent}" stroke-width="1" stroke-dasharray="2 3"/>`;
      out += `<text x="${sx(a.x) + 4}" y="${margin.t + 10}" class="label" fill="${a.color || CH.accent}">${esc(a.label || '')}</text>`;
    }
  }
  return out + '</svg>';
}

// Horizontal bars. items: [{label, value, color?, marker?}] with optional reference line.
export function barChart({ items, width = 640, barHeight = 22, gap = 8, labelWidth = 170, valueFormat = v => v, max = null, reference = null, referenceLabel = '', title = '' }) {
  const height = items.length * (barHeight + gap) + 24;
  const m = max === null ? Math.max(...items.map(i => i.value), reference || 0) * 1.08 : max;
  const sx = scale(0, m || 1, labelWidth, width - 80);
  let out = `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="${esc(title)}">`;
  items.forEach((it, i) => {
    const y = i * (barHeight + gap);
    out += `<text x="${labelWidth - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" class="label">${esc(it.label)}</text>`;
    out += `<rect x="${labelWidth}" y="${y}" width="${Math.max(0, sx(it.value) - labelWidth)}" height="${barHeight}" fill="${it.color || CH.ink}"/>`;
    if (it.marker !== undefined && it.marker !== null) out += `<line x1="${sx(it.marker)}" x2="${sx(it.marker)}" y1="${y - 2}" y2="${y + barHeight + 2}" stroke="${CH.accent}" stroke-width="2"/>`;
    out += `<text x="${sx(it.value) + 6}" y="${y + barHeight / 2 + 4}" class="label num">${esc(valueFormat(it.value))}</text>`;
  });
  if (reference !== null) {
    const H = items.length * (barHeight + gap) - gap;
    out += `<line x1="${sx(reference)}" x2="${sx(reference)}" y1="-4" y2="${H + 4}" stroke="${CH.accent}" stroke-width="1" stroke-dasharray="2 3"/>`;
    out += `<text x="${sx(reference)}" y="${H + 18}" text-anchor="middle" class="label" fill="${CH.accent}">${esc(referenceLabel)}</text>`;
  }
  return out + '</svg>';
}

// Fan chart for simulation percentiles: bands = [{lo:[], hi:[], opacity}], median = [], x labels.
export function fanChart({ x, bands, median, width = 640, height = 300, margin = { t: 16, r: 16, b: 32, l: 60 }, yFormat = v => v, xFormat = v => v, reference = null, referenceLabel = '', title = '' }) {
  const allY = bands.flatMap(b => [...b.lo, ...b.hi]).concat(median, reference === null ? [] : [reference]);
  const yT = niceTicks(Math.min(...allY), Math.max(...allY), 5);
  const sx = scale(0, x.length - 1, margin.l, width - margin.r);
  const sy = scale(yT.lo, yT.hi, height - margin.b, margin.t);
  let out = `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="${esc(title)}">`;
  for (const t of yT.ticks) {
    out += `<line x1="${margin.l}" x2="${width - margin.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="${CH.rule}"/>`;
    out += `<text x="${margin.l - 8}" y="${sy(t) + 4}" text-anchor="end" class="tick">${esc(yFormat(t))}</text>`;
  }
  x.forEach((lbl, i) => { if (i % Math.ceil(x.length / 8) === 0 || i === x.length - 1) out += `<text x="${sx(i)}" y="${height - margin.b + 18}" text-anchor="middle" class="tick">${esc(xFormat(lbl))}</text>`; });
  for (const b of bands) {
    const top = b.hi.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`);
    const bot = b.lo.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).reverse();
    out += `<polygon points="${top.concat(bot).join(' ')}" fill="${CH.ink}" opacity="${b.opacity}"/>`;
  }
  out += `<path d="${median.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${CH.ink}" stroke-width="2"/>`;
  if (reference !== null) {
    out += `<line x1="${margin.l}" x2="${width - margin.r}" y1="${sy(reference)}" y2="${sy(reference)}" stroke="${CH.accent}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    out += `<text x="${width - margin.r}" y="${sy(reference) - 5}" text-anchor="end" class="label" fill="${CH.accent}">${esc(referenceLabel)}</text>`;
  }
  return out + '</svg>';
}

// Small inline sparkline.
export function sparkline(values, { width = 120, height = 28, color = CH.ink } = {}) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const sx = scale(0, values.length - 1, 2, width - 2), sy = scale(lo, hi === lo ? lo + 1 : hi, height - 2, 2);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" class="spark" width="${width}" height="${height}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}
