import { generateBook, snapshot, ENTITIES } from '../../data/book.mjs';
import { buildRawLossRun, runPipeline, CANONICAL } from './engine.mjs';
import { fmt, dates } from '../../lib/format.mjs';
import { $, el, table, download, readParams, bindOutputs, escapeHtml } from '../../lib/dom.mjs';

const book = generateBook();
const raw = buildRawLossRun(book);
let uploaded = null;
let last = null;

bindOutputs($('#controls'));
$('#source').addEventListener('change', () => { $('#drop').hidden = $('#source').value !== 'upload'; });
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  uploaded = { name: f.name, text: await f.text() };
  $('#status').textContent = `${f.name} loaded (${Math.round(f.size / 1024)} KB). Run the pipeline.`;
});
$('#dl-raw').addEventListener('click', () => download(`tpa-loss-run-${book.evaluationDate}.csv`, raw.text));
$('#run').addEventListener('click', run);

const STEP_NAMES = ['Parse', 'Standardise', 'Validate', 'Reconcile with prior run', 'Export', 'Release gate'];
function renderSteps(done = 0, held = false) {
  $('#steps').innerHTML = STEP_NAMES.map((n, i) => `<div class="${i < done ? 'done' : ''} ${i === 5 && held && done > 5 ? 'held' : ''}"><span class="n">0${i + 1}</span>${n}</div>`).join('');
}
renderSteps();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const p = readParams($('#controls'));
  const asOf = book.evaluationDate;
  const priorAsOf = dates.addDays(asOf, -p.priorDays);
  const prior = snapshot(book, priorAsOf);
  let text = raw.text, sourceLabel = 'synthetic TPA file';
  if (p.source === 'upload') {
    if (!uploaded) { $('#status').textContent = 'Choose a CSV first.'; return; }
    text = uploaded.text; sourceLabel = uploaded.name;
  }
  $('#run').disabled = true;
  $('#results').hidden = true;
  const log = $('#log'); log.hidden = false; log.innerHTML = '';
  const t0 = performance.now();
  const out = runPipeline(text, { prior: p.source === 'upload' ? [] : prior, asOf, priorAsOf, thresholds: { reserveMove: p.reserveMove, largeNew: p.largeNew } });
  const elapsed = Math.round(performance.now() - t0);
  let stamp = 0;
  const line = (cls, msg) => { log.insertAdjacentHTML('beforeend', `<div><span class="t">+${String(stamp).padStart(4, ' ')} ms</span>  <span class="${cls}">${escapeHtml(msg)}</span></div>`); log.scrollTop = log.scrollHeight; };
  line('step', `run ${asOf} · source: ${sourceLabel}`);
  for (let i = 0; i < out.steps.length; i++) {
    const s = out.steps[i];
    line('step', `── ${s.name}`);
    for (const l of s.log) { line(l.level, l.msg); }
    stamp += Math.round(elapsed / out.steps.length);
    renderSteps(i + 1, out.gate?.held);
    await sleep(140);
  }
  if (out.fatal) { line('err', out.fatal); $('#run').disabled = false; return; }
  line('ok', `done in ${elapsed} ms`);
  last = out;
  renderResults(out, p);
  $('#run').disabled = false;
  $('#results').hidden = false;
}

function renderResults(out, p) {
  const blocks = out.exceptions.filter(e => e.severity === 'block').length;
  const warns = out.exceptions.length - blocks;
  const rowsIn = out.steps[0].counts.rows;
  $('#finding').innerHTML = `
    <p>${out.gate.held ? 'The release is held.' : 'The release went through.'} Of ${fmt.num(rowsIn)} rows in the file, ${fmt.num(out.quarantined.length)} could not be loaded and ${fmt.num(warns)} needed a correction the pipeline could make itself.</p>
    <p>${out.gate.held ? 'Before anything downstream refreshes, someone has to ' + out.gate.reasons.join(', and ') + '. The exception file already names the rows and what to do with each.' : 'No blocking findings, so the actuarial export and the activity report were released to reporting without anyone touching them.'}</p>`;
  const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  $('#stats').innerHTML =
    stat(fmt.num(out.totals.claims), 'Claims loaded', `${fmt.num(out.totals.open)} open`) +
    stat(fmt.num(out.quarantined.length), 'Quarantined', `${blocks} blocking exceptions`, blocks ? 'accent' : '') +
    stat(fmt.num(warns), 'Corrected or noted', 'warnings') +
    stat(fmt.money(out.totals.incurred, { compact: true }), 'Total incurred', `${fmt.money(out.totals.outstanding, { compact: true })} outstanding`);

  const sevOrder = { block: 0, warn: 1 };
  const exc = out.exceptions.slice().sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.rule.localeCompare(b.rule) || a.row - b.row);
  $('#exceptions').innerHTML = table([
    { key: 'severity', label: 'Severity', render: v => `<span class="badge ${v === 'block' ? 'accent' : 'warn'}">${v === 'block' ? 'Blocking' : 'Warning'}</span>` },
    { key: 'rule', label: 'Rule' },
    { key: 'claimId', label: 'Claim', class: 'mono' },
    { key: 'row', label: 'Row', num: true },
    { key: 'detail', label: 'Detail' },
    { key: 'action', label: 'Action taken' },
  ], exc.map(e => ({ ...e, _class: e.severity === 'block' ? 'flag' : '' })), { caption: `${out.exceptions.length} exceptions` });

  const a = out.activity;
  if (a.priorTotals) {
    const d = a.priorTotals;
    $('#activity-stats').innerHTML =
      stat(fmt.num(a.newClaims.length), 'New claims', a.largeNew.length ? `${a.largeNew.length} at or above ${fmt.money(p.largeNew, { compact: true })}` : 'none above the large-claim threshold', a.largeNew.length ? 'accent' : '') +
      stat(fmt.num(a.closed.length), 'Closed', `${a.reopened.length} reopened`) +
      stat(fmt.money(a.payments, { compact: true }), 'Paid since prior run', `${a.paymentsCount} claims`) +
      stat((out.totals.incurred - d.incurred >= 0 ? '+' : '−') + fmt.money(Math.abs(out.totals.incurred - d.incurred), { compact: true }), 'Incurred movement', `from ${fmt.money(d.incurred, { compact: true })} on ${fmt.date(out.priorAsOf)}`);
    const events = [
      ...a.largeNew.map(r => ({ event: 'New large claim', r, detail: `${r.cause}; reported ${fmt.date(r.reportDate)}`, cls: 'flag' })),
      ...a.reserveMoves.map(m => ({ event: 'Reserve change', r: m.rec, detail: `${fmt.money(m.from)} → ${fmt.money(m.to)} (${m.delta > 0 ? '+' : '−'}${fmt.money(Math.abs(m.delta))})`, cls: Math.abs(m.delta) >= 50000 ? 'flag' : '' })),
      ...a.reopened.map(r => ({ event: 'Reopened', r, detail: r.cause, cls: '' })),
      ...a.newClaims.filter(r => !a.largeNew.includes(r)).map(r => ({ event: 'New claim', r, detail: `${r.cause}; reported ${fmt.date(r.reportDate)}`, cls: '' })),
      ...a.closed.map(r => ({ event: 'Closed', r, detail: `closed ${fmt.date(r.closedDate)}`, cls: 'dim' })),
      ...a.missingFromFile.map(r => ({ event: 'Missing from file', r: { claimId: r.id, entity: r.entity, line: r.line, status: r.status, incurred: r.incurred }, detail: 'present in the prior run, absent today', cls: 'flag' })),
    ];
    $('#activity').innerHTML = table([
      { key: 'event', label: 'Event' },
      { key: 'claimId', label: 'Claim', class: 'mono' },
      { key: 'entity', label: 'Entity', render: v => entityName(v) },
      { key: 'line', label: 'Line' },
      { key: 'status', label: 'Status' },
      { key: 'incurred', label: 'Incurred', num: true, render: v => fmt.money(v) },
      { key: 'detail', label: 'Detail' },
    ], events.map(e => ({ event: e.event, claimId: e.r.claimId, entity: e.r.entity, line: e.r.line, status: e.r.status, incurred: e.r.incurred, detail: e.detail, _class: e.cls })), { caption: `${events.length} events since ${fmt.date(out.priorAsOf)}` });
  } else {
    $('#activity-stats').innerHTML = '';
    $('#activity').innerHTML = '<p class="note">No prior run to compare against for an uploaded file; run it twice on consecutive days and the second run reconciles to the first.</p>';
  }

  $('#mapping').innerHTML = table([
    { key: 'label', label: 'Canonical field' },
    { key: 'raw', label: 'Column in file', class: 'mono' },
    { key: 'status', label: '', render: v => v },
  ], CANONICAL.map(f => ({ label: f.label, raw: out.mapping[f.key] || '', status: out.mapping[f.key] ? (f.pii ? '<span class="badge accent">Personal data</span>' : '') : (f.required ? '<span class="badge accent">Missing</span>' : '<span class="badge">Absent</span>') }))
    .concat(out.unmapped.map(u => ({ label: '', raw: u, status: '<span class="badge">Not mapped</span>' }))), { caption: 'Column mapping' });
  const ch = out.steps[1].counts;
  const labels = { entity: 'Entity name variants resolved', line: 'Line codes normalised', state: 'State names normalised', lossDate: 'Loss dates reformatted', reportDate: 'Report dates reformatted', closedDate: 'Closed dates reformatted', status: 'Status labels normalised', paid: 'Paid amounts parsed from text', outstanding: 'Reserve amounts parsed from text', incurred: 'Incurred amounts parsed from text' };
  $('#changes').innerHTML = table([
    { key: 'what', label: 'Conversion' },
    { key: 'n', label: 'Rows', num: true, render: v => fmt.num(v) },
  ], Object.entries(ch).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ what: labels[k] || k, n })), { caption: 'Standardisation counts' });

  const previewRows = out.exports.actuarial.split('\n').slice(0, 9).map(l => l.split(','));
  $('#preview').innerHTML = `<table class="data"><caption>Actuarial export, first eight rows</caption><thead><tr>${previewRows[0].map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${previewRows.slice(1).map(r => `<tr>${r.map(c => `<td class="mono">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('#dl-actuarial').onclick = () => download(`actuarial-export-${out.asOf}.csv`, out.exports.actuarial);
  $('#dl-activity').onclick = () => download(`activity-report-${out.asOf}.csv`, out.exports.activity);
  $('#dl-exceptions').onclick = () => download(`exceptions-${out.asOf}.csv`, out.exports.exceptions);
}

function entityName(code) { const e = ENTITIES.find(e => e.code === code); return e ? e.name : code; }
