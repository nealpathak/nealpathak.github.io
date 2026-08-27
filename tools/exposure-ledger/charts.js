// charts.js — inline SVG, no libraries.
//
// Four pictures, each earning its place: where the loss lands, how bad a bad
// year gets, how much tower is left, and which agreements are in the room when
// it goes wrong.

import { short, pct, limitLabel } from '../../assets/js/fmt.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ordered best-to-worst, so the colour itself carries the argument. */
export const LANDING = [
  { key: 'transferred', label: 'Transferred to carriers', cls: 'f1', note: 'Somebody else pays.' },
  { key: 'captive', label: 'Paid by the captive', cls: 'f2', note: 'Funded, but still the group’s money.' },
  { key: 'retention', label: 'Inside the retention', cls: 'f3', note: 'Budgeted and expected.' },
  { key: 'aboveProgram', label: 'Above the programme', cls: 'f4', note: 'The tower ran out or a gap caught it.' },
  { key: 'uninsuredByForm', label: 'No form responds', cls: 'f5', note: 'Never insured in the first place.' },
];

/* ------------------------------------------------- where the loss lands --- */

export function landingChart(split) {
  const total = LANDING.reduce((s, l) => s + Math.max(0, split[l.key] || 0), 0);
  if (!(total > 0)) return '<p class="empty">No modelled loss to allocate.</p>';

  const W = 100;
  let x = 0;
  const bars = LANDING.map((l) => {
    const v = Math.max(0, split[l.key] || 0);
    const w = (v / total) * W;
    const seg = `<rect class="seg ${l.cls}" x="${x.toFixed(3)}%" y="0" width="${w.toFixed(3)}%" height="34" rx="1">
        <title>${esc(l.label)}: ${short(v)} a year (${pct(v / total)})</title></rect>`;
    x += w;
    return seg;
  }).join('');

  const rows = LANDING.map((l) => {
    const v = Math.max(0, split[l.key] || 0);
    return `<tr>
      <td><span class="swatch ${l.cls}"></span>${esc(l.label)}</td>
      <td class="n num">${short(v)}</td>
      <td class="n num dim">${pct(v / total)}</td>
      <td class="dim note">${esc(l.note)}</td>
    </tr>`;
  }).join('');

  return `
    <svg class="stackbar" viewBox="0 0 100 34" preserveAspectRatio="none" role="img"
         aria-label="Where each dollar of modelled annual loss lands">${bars}</svg>
    <table class="legend">
      <thead><tr><th>Where it lands</th><th class="n">Per year</th><th class="n">Share</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ------------------------------------------------------- defence split ---- */

/** What the claims cost to settle, against what they cost to fight. */
export function defenceStrip(result) {
  const d = result.defence;
  if (!d || !(d.total > 0)) return '';
  const gross = result.gross.mean;
  const settle = Math.max(0, gross - d.total);
  const defShare = d.total / gross;

  return `
  <div class="defence">
    <svg class="stackbar" viewBox="0 0 100 26" preserveAspectRatio="none" role="img"
         aria-label="Defence is ${pct(defShare, 0)} of gross annual loss">
      <rect class="seg dsettle" x="0" y="0" width="${((settle / gross) * 100).toFixed(2)}%" height="26" rx="1">
        <title>Settling the claims: ${short(settle)} a year</title></rect>
      <rect class="seg ddefend" x="${((settle / gross) * 100).toFixed(2)}%" y="0" width="${(defShare * 100).toFixed(2)}%" height="26" rx="1">
        <title>Defending the claims: ${short(d.total)} a year</title></rect>
    </svg>
    <div class="dlegend">
      <span><span class="swatch dsettle"></span>Settling ${short(settle)}</span>
      <span><span class="swatch ddefend"></span>Defending <b>${short(d.total)}</b> · ${pct(defShare, 0)} of gross</span>
      <span class="dnote">${short(d.retained)} of the defence bill is retained${d.erodingLimits > 0 ? `, and ${short(d.erodingLimits)} of purchased limit is eaten by it` : ''}.</span>
    </div>
  </div>`;
}

/* --------------------------------------------------- exceedance curve ----- */

/**
 * Retained loss against return period. The chart an actuary reads first and the
 * only honest way to show that the average year and the bad year are different
 * animals.
 */
export function exceedanceChart(sortedDistribution, marks = []) {
  const d = sortedDistribution;
  const n = d.length;
  if (!n) return '';

  const W = 720;
  const H = 300;
  const M = { t: 16, r: 88, b: 44, l: 74 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const minRP = 1.02;
  const maxRP = Math.min(1000, n / 5);
  const lx = (rp) => M.l + ((Math.log10(rp) - Math.log10(minRP)) / (Math.log10(maxRP) - Math.log10(minRP))) * iw;

  const at = (rp) => {
    const q = 1 - 1 / rp;
    return d[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  };

  const yMax = at(maxRP) * 1.06 || 1;
  const ly = (v) => M.t + ih - (Math.min(v, yMax) / yMax) * ih;

  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const rp = Math.pow(10, Math.log10(minRP) + (i / 160) * (Math.log10(maxRP) - Math.log10(minRP)));
    pts.push(`${lx(rp).toFixed(2)},${ly(at(rp)).toFixed(2)}`);
  }
  const path = `M${pts.join(' L')}`;
  const area = `M${lx(minRP).toFixed(2)},${(M.t + ih).toFixed(2)} L${pts.join(' L')} L${lx(maxRP).toFixed(2)},${(M.t + ih).toFixed(2)} Z`;

  const rpTicks = [2, 5, 10, 25, 50, 100, 250, 500].filter((r) => r <= maxRP);
  const xAxis = rpTicks.map((r) => `
    <line class="grid" x1="${lx(r).toFixed(1)}" y1="${M.t}" x2="${lx(r).toFixed(1)}" y2="${M.t + ih}"/>
    <text class="tick" x="${lx(r).toFixed(1)}" y="${M.t + ih + 17}" text-anchor="middle">1 in ${r}</text>`).join('');

  const yTicks = 4;
  const yAxis = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (yMax / yTicks) * i;
    return `<line class="grid" x1="${M.l}" y1="${ly(v).toFixed(1)}" x2="${M.l + iw}" y2="${ly(v).toFixed(1)}"/>
      <text class="tick" x="${M.l - 10}" y="${(ly(v) + 4).toFixed(1)}" text-anchor="end">${short(v)}</text>`;
  }).join('');

  const markers = marks.map((m) => {
    const y = ly(m.value);
    const inside = lx(m.rp) < M.l + iw - 4;
    return `
      <line class="mark" x1="${M.l}" y1="${y.toFixed(1)}" x2="${(M.l + iw).toFixed(1)}" y2="${y.toFixed(1)}"/>
      ${inside ? `<circle class="dot" cx="${lx(m.rp).toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>` : ''}
      <text class="marklbl" x="${(M.l + iw + 8).toFixed(1)}" y="${(y + 4).toFixed(1)}">${esc(m.label)}</text>`;
  }).join('');

  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
       aria-label="Retained loss by return period. The one in one hundred year retained loss is ${short(at(100))}.">
    ${yAxis}${xAxis}
    <path class="area" d="${area}"/>
    <path class="curve" d="${path}"/>
    ${markers}
    <text class="axis" x="${M.l + iw / 2}" y="${H - 6}" text-anchor="middle">Return period — how often a year this bad or worse turns up</text>
    <text class="axis" transform="translate(16,${M.t + ih / 2}) rotate(-90)" text-anchor="middle">Retained loss</text>
  </svg>`;
}

/* --------------------------------------------------------- the towers ----- */

/**
 * Each line drawn to scale from the ground up, with the exhausted share of every
 * shared aggregate shaded out. Gaps are drawn as gaps, because that is what they
 * cost.
 */
export function towerChart(prepared, result) {
  const lines = prepared.lines.filter((l) => l.layers.length);
  if (!lines.length) return '<p class="empty">No programme loaded.</p>';

  const aggByGroup = new Map(result.aggregates.map((a) => [a.group, a]));
  const top = Math.max(...lines.map((l) => Math.max(...l.layers.map((x) => x.top))));
  const H = 300;
  const colW = 128;
  const gap = 46;
  const M = { t: 18, b: 34, l: 76 };
  const W = M.l + lines.length * (colW + gap);
  const y = (v) => M.t + (H - M.t - M.b) * (1 - Math.min(v, top) / top);

  const scaleTicks = [0, top * 0.25, top * 0.5, top * 0.75, top].map((v) => `
    <line class="grid" x1="${M.l - 8}" y1="${y(v).toFixed(1)}" x2="${W - gap + 8}" y2="${y(v).toFixed(1)}"/>
    <text class="tick" x="${M.l - 14}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${short(v)}</text>`).join('');

  const cols = lines.map((line, i) => {
    const x = M.l + i * (colW + gap);
    const layers = line.layers.map((L) => {
      const a = aggByGroup.get(prepared.aggGroupIds[L.aggIdx]);
      const spentShare = a && a.capacity > 0 ? Math.min(1, a.eroded / a.capacity) : 0;
      const yTop = y(L.top);
      const h = Math.max(3, y(L.attach) - yTop);
      const spentH = h * spentShare;
      const exh = a ? a.exhaustionProb : 0;
      const hot = exh >= 0.25;
      return `
        <g>
          <rect class="layer ${L.captive ? 'captive' : ''} ${hot ? 'strained' : ''}" x="${x}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" rx="2">
            <title>${esc(L.name)} — ${limitLabel(L.attach, L.limit)}. Shared aggregate ${esc(prepared.aggGroupIds[L.aggIdx])}: ${short(a ? a.available : L.limit)} available of ${short(a ? a.capacity : L.limit)}. Exhausted in ${pct(exh)} of simulated years.</title>
          </rect>
          ${spentH > 1.5 ? `<rect class="spent" x="${x}" y="${(yTop + h - spentH).toFixed(1)}" width="${colW}" height="${spentH.toFixed(1)}"/>` : ''}
          ${h > 17 ? `<text class="layerlbl" x="${x + colW / 2}" y="${(yTop + h / 2 + 4).toFixed(1)}" text-anchor="middle">${esc(limitLabel(L.attach, L.limit))}</text>` : ''}
          ${hot ? `<text class="exh" x="${x + colW + 5}" y="${(yTop + h / 2 + 4).toFixed(1)}">${pct(exh, 0)} spent</text>` : ''}
        </g>`;
    }).join('');

    const sir = line.sir;
    const sirBand = sir > 0 ? `
      <rect class="sir" x="${x}" y="${y(sir).toFixed(1)}" width="${colW}" height="${(y(0) - y(sir)).toFixed(1)}" rx="2"/>
      ${y(0) - y(sir) > 15 ? `<text class="layerlbl sirlbl" x="${x + colW / 2}" y="${((y(0) + y(sir)) / 2 + 4).toFixed(1)}" text-anchor="middle">retention ${short(sir)}</text>` : ''}` : '';

    return `<g>${sirBand}${layers}
      <text class="collbl" x="${x + colW / 2}" y="${H - 12}" text-anchor="middle">${esc(line.code)}</text></g>`;
  }).join('');

  return `<div class="scrollx"><svg class="chart tower" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Insurance towers drawn to scale, with exhausted aggregate shaded.">${scaleTicks}${cols}</svg></div>`;
}

/* ------------------------------------------------- tail contributors ------ */

export function contributorChart(rows) {
  if (!rows.length) return '<p class="empty">Nothing reached the tail.</p>';
  const max = Math.max(...rows.map((r) => r.tail));
  return `<div class="contribs">${rows.map((r) => `
    <div class="crow">
      <div class="cname" title="${esc(r.counterparty)}">
        <span class="cid mono">${esc(r.id)}</span>${esc(r.counterparty)}
      </div>
      <div class="cbar"><span style="width:${((r.tail / max) * 100).toFixed(2)}%"></span></div>
      <div class="cval num">${short(r.tail)}</div>
    </div>`).join('')}</div>`;
}
