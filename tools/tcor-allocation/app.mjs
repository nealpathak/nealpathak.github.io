import { generateBook, ENTITIES, LINES, POLICY_YEARS, policyYearLabel, EXPOSURE_UNITS, exposureFor } from '../../data/book.mjs';
import { costOfRisk, allocate, subsidy, byEntityYear } from './engine.mjs';
import { fmt } from '../../lib/format.mjs';
import { $, table, readParams, bindOutputs } from '../../lib/dom.mjs';
import { barChart, lineChart, CH } from '../../lib/svg.mjs';

const book = generateBook();
const controls = $('#controls');
bindOutputs(controls);
let timer = null;
controls.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 80); });
const name = code => ENTITIES.find(e => e.code === code).name;
const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const signed = v => (v >= 0 ? '+' : '−') + fmt.money(Math.abs(v), { compact: true });
render();

function render() {
  const p = readParams(controls);
  const cor = costOfRisk(book, p);
  const a = allocate(book, cor, p);
  const sub = subsidy(cor, a.window);
  const py = policyYearLabel;
  const up = a.byEntity.slice().sort((x, y) => y.change - x.change)[0];
  const down = a.byEntity.slice().sort((x, y) => x.change - y.change)[0];
  const winLabel = `${py(a.window[0])} to ${py(a.window[a.window.length - 1])}`;
  const bookLR = sub.reduce((s, e) => s + e.losses, 0) / sub.reduce((s, e) => s + e.premium, 0);
  const bestSub = sub.slice().sort((x, y) => x.lossRatio - y.lossRatio)[0];
  const worstSub = sub.slice().sort((x, y) => y.lossRatio - x.lossRatio)[0];

  $('#next-py').textContent = `Premium for ${py(a.nextPy)} by operating company`;
  $('#finding').innerHTML = `
    <p>For ${py(a.nextPy)}, the captive has ${fmt.money(a.total, { compact: true })} of premium to allocate. On exposure alone, ${name(up.entity)} would pay ${fmt.money(up.exposureBased, { compact: true })}; its own record over ${winLabel} warrants more, and the credibility-weighted allocation charges it ${fmt.money(up.allocated, { compact: true })} (${signed(up.change)}). ${name(down.entity)} moves the other way (${signed(down.change)}). In total ${fmt.money(a.moved, { compact: true })} changes hands, ${fmt.pct(a.moved / a.total, 1)} of the premium.</p>
    <p>Over the window the book ran at a ${fmt.pct(bookLR)} loss ratio. ${name(bestSub.entity)} paid ${fmt.money(bestSub.premium, { compact: true })} against ${fmt.money(bestSub.losses, { compact: true })} of losses (${fmt.pct(bestSub.lossRatio)}); ${name(worstSub.entity)} paid ${fmt.money(worstSub.premium, { compact: true })} against ${fmt.money(worstSub.losses, { compact: true })} (${fmt.pct(worstSub.lossRatio)}). Whether that subsidy is intended is the owners' decision; whether it is visible is now settled.</p>`;
  $('#stats').innerHTML =
    stat(fmt.money(a.total, { compact: true }), `Premium to allocate, ${py(a.nextPy)}`, 'all three lines') +
    stat(fmt.money(a.moved, { compact: true }), 'Moves on experience', `${fmt.pct(a.moved / a.total, 1)} of premium`, a.moved / a.total > 0.05 ? 'accent' : '') +
    stat(signed(up.change), name(up.entity), `largest increase, ${fmt.pct(up.changePct, 1)}`, 'accent') +
    stat(signed(down.change), name(down.entity), `largest decrease, ${fmt.pct(down.changePct, 1)}`);

  $('#alloc-chart').innerHTML = barChart({ items: a.byEntity.map(e => ({ label: e.name, value: e.allocated, marker: e.exposureBased, color: e.change > 0 ? CH.accent : CH.ink })), valueFormat: v => fmt.money(v, { compact: true }), max: Math.max(...a.byEntity.map(e => Math.max(e.allocated, e.exposureBased))) * 1.15, title: 'Proposed premium against exposure-based premium' }) + '<figcaption>Proposed premium by operating company; the mark is the exposure-based figure. Red bars pay more than their exposure share.</figcaption>';
  $('#alloc').innerHTML = table([
    { key: 'name', label: 'Operating company' },
    { key: 'claims', label: 'Claims in window', num: true },
    { key: 'exposureBased', label: 'Exposure-based', num: true, render: v => fmt.money(v) },
    { key: 'allocated', label: 'Proposed', num: true, render: v => `<strong>${fmt.money(v)}</strong>` },
    { key: 'change', label: 'Change', num: true, render: (v, r) => `${signed(v)} <span class="muted small">${(r.changePct >= 0 ? '+' : '−') + fmt.pct(Math.abs(r.changePct), 1)}</span>` },
    { key: 'lines', label: 'By line', render: v => v.map(r => `${r.line} ${(r.changePct >= 0 ? '+' : '−')}${fmt.pct(Math.abs(r.changePct), 0)}${r.capped ? ' <span class="badge">capped</span>' : ''}`).join(' · ') },
  ], a.byEntity.map(e => ({ ...e, _class: e.change > 0 ? 'flag' : '' })), { caption: `Allocation for ${py(a.nextPy)}`, footer: { name: 'Total', claims: a.byEntity.reduce((s, e) => s + e.claims, 0), exposureBased: fmt.money(a.byEntity.reduce((s, e) => s + e.exposureBased, 0)), allocated: fmt.money(a.total), change: '' } });
  const lineRows = Object.values(a.perLine).flatMap(l => l.rows.map(r => ({ ...r, lineName: LINES[l.line].name, unit: EXPOSURE_UNITS[LINES[l.line].exposure] })));
  $('#alloc-lines').innerHTML = table([
    { key: 'lineName', label: 'Line' },
    { key: 'entity', label: 'Company', render: v => name(v) },
    { key: 'exposure', label: 'Exposure', num: true, render: (v, r) => `${fmt.num(v, 0)} <span class="muted small">${r.unit.replace('$1m ', '$m ')}</span>` },
    { key: 'rate', label: 'Loss rate', num: true, render: (v, r) => `${fmt.money(v)} <span class="muted small">vs ${fmt.money(r.lineRate)}</span>` },
    { key: 'relativity', label: 'Relativity', num: true, render: v => v.toFixed(2) },
    { key: 'credibility', label: 'Credibility', num: true, render: v => fmt.pct(v) },
    { key: 'adjusted', label: 'Applied', num: true, render: v => v.toFixed(2) },
    { key: 'changePct', label: 'Change', num: true, render: (v, r) => `${(v >= 0 ? '+' : '−')}${fmt.pct(Math.abs(v), 1)}${r.capped ? ' <span class="badge">cap</span>' : ''}` },
  ], lineRows, { caption: 'How each line arrives at its allocation: loss rate per unit of exposure, relativity to the line, credibility, and the relativity actually applied' });

  $('#subsidy').innerHTML = table([
    { key: 'name', label: 'Operating company' },
    { key: 'premium', label: 'Premium paid', num: true, render: v => fmt.money(v) },
    { key: 'losses', label: 'Losses generated', num: true, render: v => fmt.money(v) },
    { key: 'expected', label: 'Priced expectation', num: true, render: v => fmt.money(v) },
    { key: 'lossRatio', label: 'Loss ratio', num: true, render: v => fmt.pct(v) },
    { key: 'ratioToExpected', label: 'Actual ÷ expected', num: true, render: v => v.toFixed(2) },
    { key: 'balance', label: 'Premium less losses', num: true, render: v => signed(v) },
  ], sub.map(e => ({ ...e, _class: e.ratioToExpected > 1.1 ? 'flag' : '' })), { caption: `${winLabel}, losses developed to ultimate`, footer: { name: 'Book', premium: fmt.money(sub.reduce((s, e) => s + e.premium, 0)), losses: fmt.money(sub.reduce((s, e) => s + e.losses, 0)), expected: fmt.money(sub.reduce((s, e) => s + e.expected, 0)), lossRatio: fmt.pct(bookLR), balance: signed(sub.reduce((s, e) => s + e.balance, 0)) } });

  // TCOR
  const ey = byEntityYear(cor);
  const latestPy = POLICY_YEARS[POLICY_YEARS.length - 2]; // last year with enough development to be meaningful
  $('#tcor-title').textContent = `Total cost of risk by operating company, ${py(latestPy)}`;
  const rows = ENTITIES.map(e => {
    const r = ey.find(x => x.entity === e.code && x.py === latestPy);
    // exposure index: payroll $m as the common denominator
    const payroll = exposureFor(e.code, 'WC', latestPy);
    return { name: e.name, ...r, perPayroll: r.tcor / payroll, lossShare: r.selected / r.tcor, vsPremium: r.tcor / r.premium };
  });
  $('#tcor').innerHTML = table([
    { key: 'name', label: 'Operating company' },
    { key: 'claims', label: 'Claims', num: true },
    { key: 'selected', label: 'Retained losses, ultimate', num: true, render: v => fmt.money(v) },
    { key: 'excess', label: 'Excess premium', num: true, render: v => fmt.money(v) },
    { key: 'handling', label: 'Handling', num: true, render: v => fmt.money(v) },
    { key: 'admin', label: 'Administration', num: true, render: v => fmt.money(v) },
    { key: 'tcor', label: 'Total cost of risk', num: true, render: v => `<strong>${fmt.money(v)}</strong>` },
    { key: 'perPayroll', label: 'Per $1m payroll', num: true, render: v => fmt.money(v) },
    { key: 'vsPremium', label: 'Against premium', num: true, render: v => fmt.pct(v) },
  ], rows, { caption: `${py(latestPy)}; costs allocated to the company that generated them` });
  const series = ENTITIES.map((e, i) => ({ name: e.name, values: POLICY_YEARS.slice(0, -1).map(y => { const r = ey.find(x => x.entity === e.code && x.py === y); return { x: y, y: r.tcor / exposureFor(e.code, 'WC', y) / 1000 }; }), color: CH.series[i % CH.series.length], dots: false, width: 1.5 }));
  $('#tcor-chart').innerHTML = lineChart({ series, yFormat: v => '$' + fmt.num(v) + 'k', xFormat: v => py(v), height: 280, title: 'Total cost of risk per $1m payroll by company and year' }) + '<figcaption>Total cost of risk per $1m of payroll, by company and policy year, on the same exposure path the book grows along. The greenest year is omitted; it is mostly expectation.</figcaption>';
}
