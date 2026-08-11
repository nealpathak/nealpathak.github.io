// Loss Development & Aggregate Erosion — interface layer. All actuarial
// calculation lives in model.js.

import { analyse, fromLongRows } from './model.js';
import { SAMPLES, loadSample, toLongRows, IMPORT_COLUMNS } from './samples.js';
import { buildMemo } from './memo.js';
import { money, moneyShort, num, pct, parseNum, clamp } from '../../assets/js/fmt.js';
import { parseObjects, toCSV, download } from '../../assets/js/csv.js';
import { pairedBars, stackedBars, multiLine } from '../../assets/js/chart.js';

const $ = id => document.getElementById(id);

let config = loadSample(SAMPLES[0].id);
let view = 'incurred'; // which triangle the grid is showing
let latest = null;

const METHOD_KEYS = ['volume-all', 'simple-all', 'volume-3', 'simple-3'];
const METHOD_HEADS = { 'volume-all': 'Vol. all', 'simple-all': 'Simple all', 'volume-3': 'Vol. 3', 'simple-3': 'Simple 3' };

/* ------------------------------------------------------------- scaffold -- */

function buildSampleOptions() {
  const sel = $('sample');
  sel.innerHTML = '';
  for (const s of SAMPLES) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    sel.appendChild(o);
  }
  if (SAMPLES.some(s => s.id === config.id)) sel.value = config.id;
}

/** The editable cumulative triangle for whichever basis is on screen. */
function buildTriangle() {
  const ages = config.program.ages;
  const head = $('tri-head');
  const body = $('tri-body');

  head.innerHTML = `<tr><th>Accident year</th>${
    ages.map(a => `<th>${a} mo</th>`).join('')}</tr>`;

  body.innerHTML = '';
  for (const y of config.years) {
    const tr = document.createElement('tr');
    const first = document.createElement('td');
    first.textContent = y.year;
    tr.appendChild(first);

    ages.forEach((age, i) => {
      const td = document.createElement('td');
      const v = y[view][i];
      if (v === null || v === undefined) {
        td.textContent = '';
        td.style.background = 'var(--surface-sunk)';
      } else {
        td.className = 'cell-input';
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '1000';
        input.value = String(v);
        input.dataset.year = y.year;
        input.dataset.index = i;
        input.setAttribute('aria-label', `${view} for accident year ${y.year} at ${age} months`);
        td.appendChild(input);
      }
      tr.appendChild(td);
    });

    body.appendChild(tr);
  }
}

/** Read-only age-to-age view. */
function buildRatioTable(r) {
  const ages = config.program.ages;
  const head = $('ratio-head');
  const body = $('ratio-body');

  head.innerHTML = `<tr><th>Accident year</th>${
    r.links.map(l => `<th>${l.fromAge}–${l.toAge}</th>`).join('')}</tr>`;

  body.innerHTML = '';
  for (const y of config.years) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${y.year}</td>${r.links.map(l => {
      const hit = l.ratios.find(x => x.year === y.year);
      if (!hit) return '<td style="background:var(--surface-sunk)"></td>';
      const gap = Math.abs(hit.value - r.selected[l.index].selected) /
                  (r.selected[l.index].selected || 1);
      const tone = gap > 0.4 ? ' style="color:var(--signal);font-weight:600"' : '';
      return `<td${tone}>${hit.value.toFixed(3)}</td>`;
    }).join('')}`;
    body.appendChild(tr);
  }

  const foot = $('ratio-foot');
  foot.innerHTML = `<tr><td>Selected</td>${
    r.selected.map(s =>
      `<td${s.overridden ? ' style="color:var(--accent);font-weight:600"' : ''}>` +
      `${s.selected.toFixed(3)}</td>`).join('')}</tr>` +
    `<tr><td>Cumulative to ultimate</td>${
      r.selected.map(s => `<td>${r.cdf[s.index].toFixed(3)}</td>`).join('')}</tr>`;
  void ages;
}

/** Factor-selection workbench: every candidate, side by side, with overrides. */
function buildFactorTable(r) {
  const body = $('factors');
  body.innerHTML = '';

  for (const s of r.selected) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${s.fromAge}–${s.toAge} months</td>` +
      `<td>${s.count}</td>` +
      METHOD_KEYS.map(k => {
        const v = s.candidates[k];
        const active = k === config.program.method;
        return `<td${active ? ' style="color:var(--ink);font-weight:600"' : ' style="color:var(--ink-muted)"'}>` +
               `${v === null ? '—' : v.toFixed(3)}</td>`;
      }).join('');

    const td = document.createElement('td');
    td.className = 'cell-input';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.001';
    input.value = s.selected.toFixed(3);
    input.dataset.ldf = s.index;
    input.setAttribute('aria-label', `Selected factor for ${s.fromAge} to ${s.toAge} months`);
    if (s.overridden) input.style.color = 'var(--accent)';
    td.appendChild(input);
    tr.appendChild(td);

    const cdfCell = document.createElement('td');
    cdfCell.textContent = r.cdf[s.index].toFixed(3);
    tr.appendChild(cdfCell);

    body.appendChild(tr);
  }
}

/* ---------------------------------------------------------------- paint -- */

function paint() {
  const r = analyse(config);
  latest = r;

  paintMetrics(r);
  buildRatioTable(r);
  buildFactorTable(r);
  paintProjection(r);
  paintDiagnostics(r);
  paintCharts(r);

  $('memo').textContent = buildMemo(config, r);
  $('tail-label').textContent = config.program.tailFactor.toFixed(3);
  $('apriori-label').textContent = pct(config.program.aprioriLossRatio, 0);
  $('trend-label').textContent = pct(config.program.trend, 1);
  $('rate-label').textContent = pct(config.program.rateLevelTrend, 1);
  $('maturity-label').textContent = pct(config.program.maturityThreshold, 0);
  $('weight-row').style.display = config.program.blend === 'manual' ? '' : 'none';
  $('weight-label').textContent = pct(config.program.blendWeight, 0);
}

function setMetric(id, value, sub, tone) {
  const n = $(id);
  n.querySelector('.metric__value').textContent = value;
  n.querySelector('.metric__sub').textContent = sub;
  n.classList.toggle('metric--good', tone === 'good');
  n.classList.toggle('metric--warn', tone === 'warn');
}

function paintMetrics(r) {
  const t = r.totals;
  setMetric('m-ultimate', money(t.ultimate), `${money(t.incurred)} reported to date`);
  setMetric('m-ibnr', money(t.ibnr),
    `${pct(t.ultimate > 0 ? t.ibnr / t.ultimate : 0, 0)} of ultimate still unreported`);
  setMetric('m-lr', pct(t.lossRatio),
    `ultimate loss ratio on ${money(t.earnedPremium)} earned`,
    t.lossRatio > config.program.aprioriLossRatio ? 'warn' : 'good');
  setMetric('m-funding', money(t.surplus),
    t.surplus < 0 ? 'funding shortfall against ultimate' : 'funding held above ultimate',
    t.surplus < 0 ? 'warn' : 'good');

  const worst = [...r.years].filter(y => y.erosionUltimate !== null)
    .sort((a, b) => b.erosionUltimate - a.erosionUltimate)[0];
  setMetric('m-erosion', worst ? pct(worst.erosionUltimate, 0) : '—',
    worst ? `${worst.year} — worst year against its aggregate` : 'no aggregate stated',
    worst && worst.erosionUltimate >= 0.85 ? 'warn' : 'good');

  const ind = r.indication;
  setMetric('m-indication',
    ind.insufficient || ind.change === null
      ? '—'
      : `${ind.change >= 0 ? '+' : ''}${pct(ind.change, 1)}`,
    ind.insufficient
      ? 'no year mature enough to rate on'
      : `${ind.next} indication vs a priori, ${ind.used.length} years used`,
    ind.change !== null && ind.change > 0 ? 'warn' : 'good');
}

function paintProjection(r) {
  const body = $('projection');
  body.innerHTML = '';

  for (const y of r.years) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${y.year}</td>` +
      `<td>${y.age ?? '—'}</td>` +
      `<td>${money(y.earnedPremium)}</td>` +
      `<td>${money(y.paid)}</td>` +
      `<td>${money(y.caseReserve)}</td>` +
      `<td>${money(y.incurred)}</td>` +
      `<td>${pct(y.reportedShare, 0)}</td>` +
      `<td>${y.cdf.toFixed(3)}</td>` +
      `<td>${money(y.clUlt)}</td>` +
      `<td>${money(y.bfUlt)}</td>` +
      `<td>${pct(y.weight, 0)}</td>` +
      `<td style="font-weight:600">${money(y.ultimate)}</td>` +
      `<td${y.ibnr < 0 ? ' style="color:var(--signal)"' : ''}>${money(y.ibnr)}</td>` +
      `<td>${pct(y.lossRatio, 0)}</td>` +
      `<td>${money(y.funded)}</td>` +
      `<td style="color:${y.surplus < 0 ? 'var(--signal)' : 'var(--positive)'}">${money(y.surplus)}</td>` +
      `<td>${money(y.limit)}</td>` +
      `<td>${erosionTag(y.erosionUltimate)}</td>`;
    body.appendChild(tr);
  }

  const t = r.totals;
  $('projection-foot').innerHTML =
    `<tr><td>Total</td><td></td><td>${money(t.earnedPremium)}</td>` +
    `<td>${money(t.paid)}</td><td>${money(t.caseReserve)}</td><td>${money(t.incurred)}</td>` +
    `<td></td><td></td><td>${money(t.clUlt)}</td><td>${money(t.bfUlt)}</td><td></td>` +
    `<td>${money(t.ultimate)}</td><td>${money(t.ibnr)}</td><td>${pct(t.lossRatio, 0)}</td>` +
    `<td>${money(t.funded)}</td>` +
    `<td style="color:${t.surplus < 0 ? 'var(--signal)' : 'var(--positive)'}">${money(t.surplus)}</td>` +
    `<td>${money(t.limit)}</td><td>${erosionTag(t.erosionUltimate)}</td></tr>`;
}

function erosionTag(share) {
  if (share === null || !Number.isFinite(share)) return '—';
  const cls = share >= 1 ? 'hold' : share >= 0.85 ? 'watch' : 'go';
  return `<span class="tag tag--${cls}">${pct(share, 0)}</span>`;
}

function paintDiagnostics(r) {
  const host = $('diagnostics');
  host.innerHTML = '';

  if (!r.diagnostics.length) {
    host.innerHTML = '<p class="hint">Nothing flagged. That is itself worth a second look — ' +
      'a triangle with no awkward cells usually means the triangle is too small to argue with.</p>';
    return;
  }

  for (const d of r.diagnostics) {
    const item = document.createElement('div');
    item.className = `finding finding--${d.severity}`;
    item.innerHTML =
      `<p class="finding__head"><span class="tag tag--${
        d.severity === 'high' ? 'hold' : d.severity === 'medium' ? 'watch' : 'go'
      }">${d.severity}</span> ${escape(d.title)}</p>` +
      `<p class="finding__body">${escape(d.detail)}</p>`;
    host.appendChild(item);
  }
  $('diagnostic-count').textContent =
    `${r.diagnostics.filter(d => d.severity === 'high').length} to resolve before circulation`;
}

function paintCharts(r) {
  const withLimit = r.years.filter(y => y.limit > 0);
  replace('chart-erosion', stackedBars(
    withLimit.map(y => ({
      label: String(y.year),
      segs: [y.paid, Math.max(0, y.caseReserve), Math.max(0, y.ibnr)],
      denom: y.limit,
    })),
    {
      fills: ['var(--accent)', 'var(--ink-faint)', 'var(--rule-strong)'],
      markerLabel: 'aggregate limit',
      format: v => pct(v, 0),
      title: 'Aggregate erosion by accident year',
    },
  ));

  // Observed reporting pattern per accident year against the selected pattern.
  const ages = config.program.ages;
  const recent = r.years.slice(-3).map(y => y.year);
  const strokes = ['var(--accent)', 'var(--signal)', 'var(--positive)'];
  const series = r.years.map(y => {
    const row = config.years.find(c => c.year === y.year);
    const values = ages.map((_, i) => {
      const v = row[config.program.basis][i];
      return v === null || v === undefined || y.ultimate <= 0 ? null : v / y.ultimate;
    });
    const idx = recent.indexOf(y.year);
    return {
      label: String(y.year),
      values,
      muted: idx < 0,
      stroke: idx >= 0 ? strokes[idx] : undefined,
    };
  });
  series.push({
    label: 'selected',
    values: r.pattern,
    muted: false,
    dashed: true,
    stroke: 'var(--ink)',
  });

  replace('chart-pattern', multiLine(series, {
    xLabels: ages.map(a => `${a}`),
    format: v => pct(v, 0),
    title: 'Share of ultimate reported by development age',
  }));

  replace('chart-funding', pairedBars(
    r.years.map(y => ({ label: String(y.year), a: y.ultimate, b: y.funded })),
    {
      format: moneyShort,
      delta: 'variance',
      labelWidth: 70,
      aFill: 'var(--ink-faint)',
      bFill: 'var(--accent)',
      title: 'Held funding against selected ultimate by accident year',
    },
  ));
}

function replace(id, node) {
  const host = $(id);
  host.innerHTML = '';
  host.appendChild(node);
}

/* ---------------------------------------------------------------- input -- */

function onTriangleInput(e) {
  const t = e.target;
  if (!t.dataset.year) return;
  const y = config.years.find(x => String(x.year) === t.dataset.year);
  if (!y) return;
  const i = Number(t.dataset.index);
  const v = parseNum(t.value, y[view][i]);
  y[view][i] = Math.max(0, v);
  paint();
}

function onFactorInput(e) {
  const t = e.target;
  if (t.dataset.ldf === undefined) return;
  const i = Number(t.dataset.ldf);
  const v = parseNum(t.value, NaN);
  if (Number.isFinite(v) && v > 0) config.program.ldfOverrides[i] = v;
  paint();
}

function setView(next) {
  view = next;
  for (const b of document.querySelectorAll('[data-view]')) {
    b.classList.toggle('is-active', b.dataset.view === next);
  }
  $('tri-wrap').style.display = next === 'ratios' ? 'none' : '';
  $('ratio-wrap').style.display = next === 'ratios' ? '' : 'none';
  if (next !== 'ratios') buildTriangle();
}

function exportProjection() {
  const rows = latest.years.map(y => ({
    accident_year: y.year,
    age_months: y.age ?? '',
    earned_premium: y.earnedPremium,
    paid: Math.round(y.paid),
    case_reserve: Math.round(y.caseReserve),
    reported_incurred: Math.round(y.incurred),
    share_reported: y.reportedShare.toFixed(4),
    cdf: y.cdf.toFixed(4),
    chain_ladder_ultimate: Math.round(y.clUlt),
    bf_ultimate: Math.round(y.bfUlt),
    weight_on_chain_ladder: y.weight.toFixed(4),
    selected_ultimate: Math.round(y.ultimate),
    ibnr: Math.round(y.ibnr),
    total_reserve: Math.round(y.totalReserve),
    ultimate_loss_ratio: y.lossRatio === null ? '' : y.lossRatio.toFixed(4),
    funded: y.funded,
    surplus_deficit: Math.round(y.surplus),
    aggregate_limit: y.limit,
    erosion_ultimate: y.erosionUltimate === null ? '' : y.erosionUltimate.toFixed(4),
  }));
  download(`loss-development-${config.id}.csv`, toCSV(rows));
  toast('Projection exported');
}

function exportTemplate() {
  download('loss-triangle-template.csv', toCSV(toLongRows(config), IMPORT_COLUMNS));
  toast('Template downloaded — same shape the importer expects');
}

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { rows } = parseObjects(String(reader.result));
      if (!rows.length) throw new Error('no rows');
      const next = fromLongRows(rows, config);
      if (!next.years.length || !next.program.ages.length) throw new Error('no triangle');
      config = next;
      $('sample').value = '';
      $('process-note').textContent = next.note;
      $('program-name').textContent = 'Imported triangle';
      buildTriangle();
      setView('incurred');
      paint();
      toast(`Loaded ${next.years.length} accident years`);
    } catch {
      toast('Could not read that file — check the column names against the template');
    }
  };
  reader.readAsText(file);
}

async function copyMemo() {
  try {
    await navigator.clipboard.writeText($('memo').textContent);
    toast('Memo copied to clipboard');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('memo'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Memo selected — press Ctrl/Cmd + C');
  }
}

let toastTimer;
function toast(message) {
  const n = $('toast');
  n.textContent = message;
  n.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('is-visible'), 2600);
}

function escape(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function loadInto(id) {
  config = loadSample(id);
  $('program-name').textContent = config.program.name;
  $('process-note').textContent = config.note;
  $('valuation').textContent = config.program.valuation;
  $('basis').value = config.program.basis;
  $('method').value = config.program.method;
  $('blend').value = config.program.blend;
  $('tail').value = String(Math.round(config.program.tailFactor * 1000));
  $('apriori').value = String(Math.round(config.program.aprioriLossRatio * 100));
  $('trend').value = String(Math.round(config.program.trend * 1000) / 10);
  $('rate').value = String(Math.round(config.program.rateLevelTrend * 1000) / 10);
  $('maturity').value = String(Math.round(config.program.maturityThreshold * 100));
  $('weight').value = String(Math.round(config.program.blendWeight * 100));
  buildTriangle();
  setView('incurred');
  paint();
}

/* ---------------------------------------------------------------- start -- */

function init() {
  buildSampleOptions();

  $('factor-heads').innerHTML =
    '<th>Age band</th><th>n</th>' +
    METHOD_KEYS.map(k => `<th>${METHOD_HEADS[k]}</th>`).join('') +
    '<th>Selected</th><th>To ultimate</th>';

  loadInto(config.id);

  $('sample').addEventListener('change', e => { if (e.target.value) loadInto(e.target.value); });
  $('basis').addEventListener('change', e => {
    config.program.basis = e.target.value;
    if (view !== 'ratios') setView(e.target.value);
    paint();
  });
  $('method').addEventListener('change', e => {
    config.program.method = e.target.value;
    config.program.ldfOverrides = {};
    paint();
  });
  $('blend').addEventListener('change', e => { config.program.blend = e.target.value; paint(); });

  $('tail').addEventListener('input', e => {
    config.program.tailFactor = clamp(parseNum(e.target.value, 1000), 900, 3000) / 1000;
    paint();
  });
  $('apriori').addEventListener('input', e => {
    config.program.aprioriLossRatio = clamp(parseNum(e.target.value, 72), 0, 300) / 100;
    paint();
  });
  $('trend').addEventListener('input', e => {
    config.program.trend = clamp(parseNum(e.target.value, 5), -20, 40) / 100;
    paint();
  });
  $('rate').addEventListener('input', e => {
    config.program.rateLevelTrend = clamp(parseNum(e.target.value, 5), -20, 40) / 100;
    paint();
  });
  $('maturity').addEventListener('input', e => {
    config.program.maturityThreshold = clamp(parseNum(e.target.value, 75), 0, 100) / 100;
    paint();
  });
  $('weight').addEventListener('input', e => {
    config.program.blendWeight = clamp(parseNum(e.target.value, 50), 0, 100) / 100;
    paint();
  });

  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => setView(b.dataset.view));
  }

  $('tri-body').addEventListener('input', onTriangleInput);
  $('factors').addEventListener('input', onFactorInput);

  $('btn-clear-ldf').addEventListener('click', () => {
    config.program.ldfOverrides = {};
    paint();
  });
  $('btn-reset').addEventListener('click', () => {
    if (SAMPLES.some(s => s.id === config.id)) loadInto(config.id);
    else loadInto(SAMPLES[0].id);
  });
  $('btn-copy').addEventListener('click', copyMemo);
  $('btn-csv').addEventListener('click', exportProjection);
  $('btn-template').addEventListener('click', exportTemplate);
  $('btn-import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) importCSV(e.target.files[0]);
    e.target.value = '';
  });

  void num;
}

init();
