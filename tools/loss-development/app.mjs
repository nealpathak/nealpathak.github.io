import { generateBook, LINES, policyYearLabel } from '../../data/book.mjs';
import { analyse } from './engine.mjs';
import { fmt } from '../../lib/format.mjs';
import { $, table, readParams, escapeHtml } from '../../lib/dom.mjs';
import { barChart, lineChart, CH } from '../../lib/svg.mjs';

const book = generateBook();
const controls = $('#controls');
controls.addEventListener('change', render);
render();

function render() {
  const p = readParams(controls);
  const opts = { line: p.line || null, measure: p.measure, average: p.average === 'simple' ? 'simple' : 'volume', excludeHighLow: p.average === 'volume-xhl', tailOverride: p.tail === 'fit' ? null : Number(p.tail), bfThroughAge: p.bfThroughAge };
  const a = analyse(book, opts);
  const lines = Object.keys(a.perLine);
  const py = policyYearLabel;
  const lineName = lc => LINES[lc].name;

  // finding
  const worst = a.breaches.slice().sort((x, y) => y.excess - x.excess)[0];
  const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  let f1, f2;
  if (worst) {
    f1 = `${lineName(worst.line)} ${py(worst.py)} is projected to use ${fmt.pct(worst.erodedUlt)} of its aggregate. The captive should expect ${fmt.money(worst.excess, { compact: true })} to fall into the aggregate layer on that year alone${a.breaches.length > 1 ? `, and ${fmt.money(a.totals.excess, { compact: true })} across the ${a.breaches.length} years that breach` : ''}.`;
    f2 = a.nearMisses.length ? `${a.nearMisses.length} more year${a.nearMisses.length === 1 ? '' : 's'} sit within ten per cent of their limit (${a.nearMisses.map(y => `${y.line} ${py(y.py)}`).join(', ')}). ${worst.age <= 24 ? 'The breaching year is green, so its ultimate leans on the priced expectation; the honest range is wide and the number will move.' : 'The breaching year is mature enough that the estimate will not move much.'}` : 'No other year is within ten per cent of its limit.';
  } else {
    f1 = `No policy year is projected to exhaust its aggregate on this basis. The tightest is ${a.nearMisses[0] ? `${lineName(a.nearMisses[0].line)} ${py(a.nearMisses[0].py)} at ${fmt.pct(a.nearMisses[0].erodedUlt)}` : 'well inside its limit'}.`;
    f2 = `Total IBNR across the book is ${fmt.money(a.totals.ibnr, { compact: true })} on a selected ultimate of ${fmt.money(a.totals.selected, { compact: true })}.`;
  }
  $('#finding').innerHTML = `<p>${f1}</p><p>${f2}</p>`;
  $('#stats').innerHTML =
    stat(fmt.money(a.totals.selected, { compact: true }), 'Selected ultimate', `${lines.length === 1 ? lineName(lines[0]) : 'all lines'}, eight policy years`) +
    stat(fmt.money(a.totals.ibnr, { compact: true }), 'IBNR', `${fmt.pct(a.totals.ibnr / a.totals.latest, 1)} of reported ${p.measure}`) +
    stat(fmt.money(a.totals.excess, { compact: true }), 'Into the aggregate layer', a.breaches.length ? `${a.breaches.length} year${a.breaches.length === 1 ? '' : 's'} breach` : 'no year breaches', a.breaches.length ? 'accent' : '') +
    stat(fmt.pct(a.backtest.matureError, 1), 'Mature-year error', 'selected ultimate against the synthetic truth, ages 60+');

  // erosion charts
  $('#erosion').innerHTML = lines.map(lc => {
    const yrs = a.perLine[lc].years;
    const items = yrs.map(y => ({ label: `${py(y.py)} · ${y.age}m`, value: y.selected, marker: y.aggregate, color: y.excess > 0 ? CH.accent : (y.erodedUlt >= 0.9 ? CH.s6 : CH.ink) }));
    const max = Math.max(...yrs.map(y => Math.max(y.selected, y.aggregate))) * 1.12;
    return `<div class="line-block"><h3>${lineName(lc)}</h3><figure style="max-width:760px">${barChart({ items, max, valueFormat: v => fmt.money(v, { compact: true }), title: `${lineName(lc)} projected ultimate against aggregate` })}<figcaption>Selected ultimate by policy year; the mark is that year's aggregate. Red bars breach, amber bars are within ten per cent.</figcaption></figure></div>`;
  }).join('');

  // ultimates table
  const rows = lines.length === 1 ? a.perLine[lines[0]].years : a.byPy;
  $('#ultimates').innerHTML = table([
    { key: 'py', label: 'Policy year', render: (v, r) => `${py(v)} <span class="muted small">${r.age}m</span>` },
    { key: 'paid', label: 'Paid', num: true, render: v => fmt.money(v) },
    { key: 'latest', label: p.measure === 'paid' ? 'Paid (basis)' : 'Incurred', num: true, render: v => fmt.money(v) },
    { key: 'cdf', label: 'CDF', num: true, render: (v, r) => v ? fmt.factor(v) : `<span class="muted">${r.method}</span>` },
    { key: 'chainLadder', label: 'Chain-ladder', num: true, render: v => fmt.money(v) },
    { key: 'bf', label: 'B–F', num: true, render: v => v === null ? '—' : fmt.money(v) },
    { key: 'selected', label: 'Selected', num: true, render: (v, r) => `<strong>${fmt.money(v)}</strong> <span class="muted small">${r.method}</span>` },
    { key: 'ibnr', label: 'IBNR', num: true, render: v => fmt.money(v) },
    { key: 'aggregate', label: 'Aggregate', num: true, render: v => fmt.money(v) },
    { key: 'erodedUlt', label: 'Projected use', num: true, render: (v, r) => `${fmt.pct(v)}${r.excess > 0 ? ` <span class="badge accent">+${fmt.money(r.excess, { compact: true })}</span>` : ''}` },
    { key: 'lossRatio', label: 'Loss ratio', num: true, render: v => fmt.pct(v) },
  ], rows.map(r => ({ ...r, _class: r.excess > 0 ? 'flag' : '' })), {
    caption: lines.length === 1 ? lineName(lines[0]) : 'All lines, summed from per-line projections',
    footer: { py: 'Total', paid: fmt.money(rows.reduce((s, r) => s + r.paid, 0)), latest: fmt.money(a.totals.latest), selected: fmt.money(a.totals.selected), ibnr: fmt.money(a.totals.ibnr), aggregate: fmt.money(rows.reduce((s, r) => s + r.aggregate, 0)), erodedUlt: a.totals.excess ? `+${fmt.money(a.totals.excess, { compact: true })}` : '' },
  });

  // triangles + factors + development chart
  $('#triangles').innerHTML = lines.map(lc => {
    const L = a.perLine[lc]; const tri = L.tri; const pr = L.proj;
    const head = `<tr><th>Policy year</th>${tri.ages.map(g => `<th class="num">${g}</th>`).join('')}</tr>`;
    const body = tri.rows.map(r => `<tr><td>${py(r.py)}</td>${r.values.map(v => v === null ? '<td class="num empty">·</td>' : `<td class="num">${fmt.num(v / 1000)}</td>`).join('')}</tr>`).join('');
    const fac = `<tr><td class="muted">Age-to-age</td>${pr.factors.map(f => `<td class="num">${f.factor === null ? '—' : fmt.factor(f.factor)}</td>`).join('')}<td class="num muted">tail ${fmt.factor(pr.tail)}</td></tr>`;
    const cdf = `<tr><td class="muted">Cumulative</td>${pr.cdf.map(v => `<td class="num">${fmt.factor(v)}</td>`).join('')}</tr>`;
    const chart = lineChart({
      series: tri.rows.map((r, i) => ({ name: py(r.py), values: r.values.map((v, j) => ({ x: tri.ages[j], y: v === null ? null : v / 1000 })), color: i === tri.rows.length - 1 ? CH.accent : i === tri.rows.length - 2 ? CH.s6 : CH.ink, width: i >= tri.rows.length - 2 ? 2 : 1, dots: false })),
      yFormat: v => '$' + fmt.num(v) + 'k', xFormat: v => v + 'm', height: 260, title: `${lineName(lc)} cumulative ${p.measure} by age`,
    });
    return `<div class="line-block"><h3>${lineName(lc)}</h3>
      <div class="table-scroll"><table class="data triangle"><caption>Cumulative ${p.measure}, $ thousands</caption><thead>${head}</thead><tbody>${body}</tbody><tfoot>${fac}${cdf}</tfoot></table></div>
      <figure>${chart}<figcaption>Cumulative ${p.measure} by development age. The two most recent years are highlighted; the question is where they will land once they reach the right-hand edge.</figcaption></figure></div>`;
  }).join('');

  // backtest
  const bt = lines.flatMap(lc => a.perLine[lc].years).map(y => ({ line: y.line, py: y.py, age: y.age, selected: y.selected, truth: y.truth, err: (y.selected - y.truth) / y.truth, method: y.method }));
  $('#backtest-stats').innerHTML =
    stat(fmt.pct(a.backtest.matureError, 1), 'Mean absolute error, ages 60 months and older', `${a.backtest.mature.length} year-lines`) +
    stat(fmt.pct(a.backtest.greenError, 1), 'Mean absolute error, ages 24 months and younger', `${a.backtest.green.length} year-lines; this is where method choice matters`);
  $('#backtest').innerHTML = table([
    { key: 'line', label: 'Line' },
    { key: 'py', label: 'Policy year', render: (v, r) => `${py(v)} <span class="muted small">${r.age}m</span>` },
    { key: 'method', label: 'Method' },
    { key: 'selected', label: 'Selected ultimate', num: true, render: v => fmt.money(v) },
    { key: 'truth', label: 'Synthetic truth', num: true, render: v => fmt.money(v) },
    { key: 'err', label: 'Error', num: true, render: v => (v >= 0 ? '+' : '−') + fmt.pct(Math.abs(v), 1) },
  ], bt.map(r => ({ ...r, _class: Math.abs(r.err) > 0.1 ? 'flag' : '' })), { caption: 'Estimate against the eventual cost every claim will actually reach' });
}
