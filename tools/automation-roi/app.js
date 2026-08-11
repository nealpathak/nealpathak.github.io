// Automation ROI & Capacity — interface layer. All calculation lives in
// model.js; this file only reads the DOM, writes the DOM, and draws.

import { evaluate, sensitivity, hourlyRate } from './model.js';
import { SAMPLES, loadSample } from './samples.js';
import { buildMemo } from './memo.js';
import { money, money2, moneyShort, num, pct, duration, months, parseNum, clamp }
  from '../../assets/js/fmt.js';
import { toCSV, download } from '../../assets/js/csv.js';
import { pairedBars, cumulativeLine, tornado } from '../../assets/js/chart.js';

const $ = id => document.getElementById(id);

let config = loadSample(SAMPLES[0].id);
let swing = 0.25;
let latest = null;

// Editable per-step drivers. `scale` converts between the stored fraction and
// the whole number shown in the cell.
const DRIVER_COLUMNS = [
  { field: 'applicability',  scale: 100, step: 1,    min: 0, max: 100 },
  { field: 'touchMinutes',   scale: 1,   step: 1,    min: 0 },
  { field: 'waitHours',      scale: 1,   step: 1,    min: 0 },
  { field: 'reworkRate',     scale: 100, step: 1,    min: 0, max: 95 },
  { field: 'automatable',    scale: 100, step: 5,    min: 0, max: 100 },
  { field: 'waitReduction',  scale: 100, step: 5,    min: 0, max: 100 },
  { field: 'buildCost',      scale: 1,   step: 1000, min: 0 },
  { field: 'runCostMonthly', scale: 1,   step: 50,   min: 0 },
];

const derived = new Map(); // step id -> { hours, cost, net, payback, verdict }

/* ------------------------------------------------------------ scaffold -- */

function buildSampleOptions() {
  const sel = $('sample');
  sel.innerHTML = '';
  for (const s of SAMPLES) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    sel.appendChild(opt);
  }
  sel.value = config.id;
}

function buildRoleTable() {
  const body = $('roles');
  body.innerHTML = '';
  for (const role of config.roles) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${escape(role.name)}</td>` +
      `<td>${money(role.loadedAnnualCost)}</td>` +
      `<td>${num(role.productiveHoursPerYear)}</td>` +
      `<td>${money2(hourlyRate(role))}</td>`;
    body.appendChild(tr);
  }
}

function buildGrid() {
  const body = $('steps');
  body.innerHTML = '';
  derived.clear();

  for (const step of config.steps) {
    const tr = document.createElement('tr');
    tr.dataset.step = step.id;

    const check = document.createElement('td');
    check.className = 'cell-input';
    check.style.textAlign = 'center';
    check.innerHTML =
      `<input type="checkbox" data-step="${step.id}" data-field="selected"` +
      `${step.selected ? ' checked' : ''}` +
      ` aria-label="Include ${escapeAttr(step.name)} in the scenario">`;
    tr.appendChild(check);

    const name = document.createElement('td');
    name.textContent = step.name;
    tr.appendChild(name);

    const role = document.createElement('td');
    role.style.textAlign = 'left';
    role.style.color = 'var(--ink-muted)';
    role.textContent = (config.roles.find(r => r.id === step.roleId) || {}).name || '—';
    tr.appendChild(role);

    for (const col of DRIVER_COLUMNS) {
      const td = document.createElement('td');
      td.className = 'cell-input';
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(Math.round(step[col.field] * col.scale));
      input.step = col.step;
      if (col.min !== undefined) input.min = col.min;
      if (col.max !== undefined) input.max = col.max;
      input.dataset.step = step.id;
      input.dataset.field = col.field;
      input.dataset.scale = col.scale;
      input.setAttribute('aria-label', `${col.field} for ${step.name}`);
      td.appendChild(input);
      tr.appendChild(td);
    }

    const cells = {};
    for (const key of ['hours', 'cost', 'net', 'payback', 'verdict']) {
      const td = document.createElement('td');
      tr.appendChild(td);
      cells[key] = td;
    }
    derived.set(step.id, cells);

    body.appendChild(tr);
  }
}

/* --------------------------------------------------------------- paint -- */

function paint() {
  const r = evaluate(config);
  const sens = sensitivity(config, swing);
  latest = { r, sens };

  paintMetrics(r);
  paintGrid(r);
  paintFooter(r);
  paintRanked(r);
  paintCharts(r, sens);

  $('memo').textContent = buildMemo(config, r, sens);
  $('scenario-count').textContent =
    `${r.selectedCount} of ${config.steps.length} steps in scenario`;
}

function paintMetrics(r) {
  const positive = r.horizonNet > 0;
  setMetric('m-net', money(r.horizonNet),
    `over ${config.process.horizonMonths} months`, positive ? 'good' : 'warn');
  setMetric('m-payback', months(r.paybackMonths),
    r.buildCost > 0 ? `on ${money(r.buildCost)} build` : 'nothing selected',
    Number.isFinite(r.paybackMonths) && r.paybackMonths <= 18 ? 'good' : 'warn');
  setMetric('m-monthly', `${money(r.monthlyNet)}`,
    `${money(r.monthlyGross)} gross less ${money(r.runCost)} run`);
  setMetric('m-capacity', `${num(r.fteReleased, 1)} FTE`,
    Number.isFinite(r.headroom)
      ? `+${num(r.headroom)} instances/mo of headroom`
      : 'all touch time removed');
  setMetric('m-cycle', duration(r.cycleNext),
    `from ${duration(r.cycleNow)} · ${pct(r.cycleSavedPct, 0)} faster`);
  setMetric('m-unit', money(r.costPerInstanceNext),
    `per instance, from ${money(r.costPerInstanceNow)}`);
}

function setMetric(id, value, sub, tone) {
  const node = $(id);
  node.querySelector('.metric__value').textContent = value;
  node.querySelector('.metric__sub').textContent = sub;
  node.classList.toggle('metric--good', tone === 'good');
  node.classList.toggle('metric--warn', tone === 'warn');
}

const VERDICT_COPY = { go: 'Build', watch: 'Watch', hold: 'Hold' };

function paintGrid(r) {
  for (const d of r.detail) {
    const cells = derived.get(d.id);
    if (!cells) continue;
    cells.hours.textContent = num(d.hours);
    cells.cost.textContent = money(d.cost);
    cells.net.textContent = d.monthlyNet > 0 ? money(d.monthlyNet) : '—';
    cells.payback.textContent = Number.isFinite(d.payback) ? months(d.payback) : '—';
    cells.verdict.innerHTML =
      `<span class="tag tag--${d.verdict === 'go' ? 'go' : d.verdict === 'watch' ? 'watch' : 'hold'}">` +
      `${VERDICT_COPY[d.verdict]}</span>`;
  }
}

function paintFooter(r) {
  $('f-hours').textContent = num(r.hoursNow);
  $('f-cost').textContent = money(r.costNow);
  $('f-net').textContent = money(r.monthlyNet);
  $('f-fte').textContent = `${num(r.fteNow, 1)} FTE today`;
}

function paintRanked(r) {
  const body = $('ranked');
  body.innerHTML = '';
  const selected = new Set(config.steps.filter(s => s.selected).map(s => s.id));

  if (!r.ranked.length) {
    body.innerHTML =
      '<tr><td colspan="6" style="color:var(--ink-muted)">No step in this process ' +
      'has a positive automatable share.</td></tr>';
    return;
  }

  r.ranked.forEach((d, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><span class="rank">${i + 1}</span>${escape(d.name)}` +
      `${selected.has(d.id) ? ' <span class="tag tag--quiet">in scenario</span>' : ''}</td>` +
      `<td>${money(d.buildCost)}</td>` +
      `<td>${money(d.runCostMonthly)}</td>` +
      `<td>${money(d.annualNet)}</td>` +
      `<td>${Number.isFinite(d.payback) ? months(d.payback) : 'never'}</td>` +
      `<td><span class="tag tag--${d.verdict === 'go' ? 'go' : d.verdict === 'watch' ? 'watch' : 'hold'}">` +
      `${VERDICT_COPY[d.verdict]}</span></td>`;
    body.appendChild(tr);
  });
}

function paintCharts(r, sens) {
  const selected = new Set(config.steps.filter(s => s.selected).map(s => s.id));

  replace('chart-hours', pairedBars(
    r.detail.map(d => ({
      label: d.name.length > 34 ? `${d.name.slice(0, 33)}…` : d.name,
      a: d.hours,
      b: selected.has(d.id) ? d.hoursAfter : d.hours,
    })),
    { format: n => `${num(n)} h`, title: 'Monthly labour hours by step, before and after' },
  ));

  replace('chart-cash', cumulativeLine(r.cumulative, {
    breakeven: r.breakeven,
    format: moneyShort,
    title: 'Cumulative net cash position by month',
  }));

  replace('chart-tornado', tornado(sens, {
    format: moneyShort,
    title: 'Sensitivity of horizon net value to each driver',
  }));

  $('swing-label').textContent = `±${Math.round(swing * 100)}%`;
}

function replace(id, node) {
  const host = $(id);
  host.innerHTML = '';
  host.appendChild(node);
}

/* --------------------------------------------------------------- input -- */

function onGridInput(event) {
  const t = event.target;
  const stepId = t.dataset.step;
  const field = t.dataset.field;
  if (!stepId || !field) return;

  const step = config.steps.find(s => s.id === stepId);
  if (!step) return;

  if (field === 'selected') {
    step.selected = t.checked;
  } else {
    const scale = Number(t.dataset.scale) || 1;
    const col = DRIVER_COLUMNS.find(c => c.field === field);
    let v = parseNum(t.value, step[field] * scale);
    if (col && col.min !== undefined) v = Math.max(col.min, v);
    if (col && col.max !== undefined) v = Math.min(col.max, v);
    step[field] = v / scale;
  }
  paint();
}

function setAll(fn) {
  config.steps.forEach(s => { s.selected = fn(s); });
  buildGrid();
  paint();
}

function exportCSV() {
  const rows = latest.r.detail.map(d => {
    const step = config.steps.find(s => s.id === d.id);
    return {
      step: d.name,
      role: d.role,
      in_scenario: step.selected ? 'yes' : 'no',
      applicability_pct: (step.applicability * 100).toFixed(0),
      touch_minutes: step.touchMinutes,
      wait_hours: step.waitHours,
      rework_pct: (step.reworkRate * 100).toFixed(0),
      expected_passes: d.passes.toFixed(3),
      automatable_pct: (step.automatable * 100).toFixed(0),
      hours_per_month: d.hours.toFixed(1),
      hours_after: d.hoursAfter.toFixed(1),
      cost_per_month: d.cost.toFixed(0),
      cost_after: d.costAfter.toFixed(0),
      build_cost: step.buildCost,
      run_cost_monthly: step.runCostMonthly,
      net_monthly: d.monthlyNet.toFixed(0),
      annual_net: d.annualNet.toFixed(0),
      payback_months: Number.isFinite(d.payback) ? d.payback.toFixed(1) : '',
      verdict: d.verdict,
    };
  });
  download(`automation-roi-${config.id}.csv`, toCSV(rows));
  toast('CSV downloaded');
}

async function copyMemo() {
  try {
    await navigator.clipboard.writeText($('memo').textContent);
    toast('Summary copied to clipboard');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('memo'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Summary selected — press Ctrl/Cmd + C');
  }
}

let toastTimer;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2400);
}

function loadInto(sampleId) {
  config = loadSample(sampleId);
  $('volume').value = config.process.volumePerMonth;
  $('horizon').value = config.process.horizonMonths;
  $('process-name').textContent = config.process.name;
  $('process-note').textContent = config.note;
  buildRoleTable();
  buildGrid();
  paint();
}

/* --------------------------------------------------------------- start -- */

function escape(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) {
  return escape(s).replace(/"/g, '&quot;');
}

function init() {
  buildSampleOptions();
  loadInto(config.id);

  $('sample').addEventListener('change', e => loadInto(e.target.value));

  $('volume').addEventListener('input', e => {
    config.process.volumePerMonth = Math.max(0, parseNum(e.target.value, 0));
    paint();
  });
  $('horizon').addEventListener('input', e => {
    config.process.horizonMonths = clamp(Math.round(parseNum(e.target.value, 36)), 6, 120);
    paint();
  });
  $('swing').addEventListener('input', e => {
    swing = clamp(parseNum(e.target.value, 25), 5, 75) / 100;
    paint();
  });

  $('steps').addEventListener('input', onGridInput);
  $('steps').addEventListener('change', onGridInput);

  $('btn-go').addEventListener('click', () => {
    const verdicts = new Map(evaluate(config).detail.map(d => [d.id, d.verdict]));
    setAll(s => verdicts.get(s.id) === 'go');
  });
  $('btn-all').addEventListener('click', () => setAll(() => true));
  $('btn-none').addEventListener('click', () => setAll(() => false));
  $('btn-reset').addEventListener('click', () => loadInto(config.id));
  $('btn-csv').addEventListener('click', exportCSV);
  $('btn-copy').addEventListener('click', copyMemo);
}

init();
