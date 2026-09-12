// The page. Renders the cost and time model from the assumptions, and every
// artifact of the renewal live from the engines on the synthetic book.

import { generateBook, snapshot, ENTITIES, LINES, POLICY_YEARS, policyYearLabel, exposureFor } from './data/book.mjs';
import { buildRawLossRun, runPipeline } from './engines/loss-run-pipeline/engine.mjs';
import { analyse } from './engines/loss-development/engine.mjs';
import { derivePaymentPattern, openingPosition, simulate, capitalForTolerance, DEFAULTS as CAP } from './engines/capital-model/engine.mjs';
import { costOfRisk, allocate, subsidy } from './engines/tcor-allocation/engine.mjs';
import { generateContracts, analyseContracts, certificate } from './engines/contract-requirements/engine.mjs';
import { defaults, compute, STEPS, ROLES, FEES, FLOORS, SYSTEM, DAYS_PER_WEEK } from './renewal/model.mjs';
import { RENEWAL, EXPOSURE_REPLIES, ADJUSTER_NOTES, QUOTES, WORDING } from './renewal/data.mjs';
import { RUNS, byStep } from './renewal/runs.mjs';
import { fmt } from './lib/format.mjs';
import { $, $$, table, escapeHtml } from './lib/dom.mjs';
import { barChart, fanChart, CH } from './lib/svg.mjs';

const py = policyYearLabel;
const m = v => fmt.money(v, { compact: true });
const money = v => fmt.money(v);
const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const weeksText = d => { const w = d / DAYS_PER_WEEK; if (d < 0.75) return 'half a day'; if (d < 1.5) return '1 day'; return w < 1.5 ? `${Math.round(d)} days` : `${Math.round(w)} weeks`; };
const hoursText = h => `${Math.round(h)} hours`;
const costText = v => '$' + (Math.round(v / 1000)).toLocaleString('en-US') + ',000';
const pct = (v, dp = 0) => fmt.pct(v, dp);

// ---------------------------------------------------------------------------
// Step copy. Numbers live in the model; words live here.

const COPY = {
  data: {
    today: 'Email the administrator for the loss run as of the evaluation date. Email five finance teams for payroll, revenue and vehicle counts. Chase the ones that do not reply. Retype what comes back into the exposure workbook, and notice, or fail to notice, that one is in thousands and one is last year\'s.',
    ai: 'The administrator\'s file already lands in the pipeline every morning, so there is nothing to request. An agent sends each company a structured request, reads whatever comes back, builds the schedule, checks it against last year and the payroll register, and lists what a careful person would want confirmed before the number is used.',
    gate: 'Gate 1. The risk manager clears the exceptions. On this book there are four: one reply in thousands, one missing a fleet count, one with an acquisition in it, one with last year\'s numbers.',
  },
  clean: {
    today: 'Open the file. Fix four date formats, three spellings of each company, and amounts with dollar signs, parentheses and stray spaces. Delete the duplicates you notice. Paste into the workbook. Email the totals. Do it again next quarter, differently.',
    ai: 'Parse, standardise, validate against rules that grew out of real defects, reconcile to the prior run, quarantine what cannot be loaded, and export for the actuary. Minutes, and the same every day. This is the pipeline that runs the other eleven months too.',
    gate: 'Gate 2. A named person clears the quarantine. Nothing downstream refreshes until they do, and the exception file already names the rows and what to do with each.',
    nomodel: 'No language model here, on purpose. The same file must produce the same answer every day, and a rule that quarantines a row must be one you can read.',
  },
  actuarial: {
    today: 'Package the data for the consulting actuary. Wait. Answer their questions about the columns. Receive the report a month later: ultimates by year and line, expected loss for the coming year, a funding recommendation.',
    ai: 'The engines run the moment the gate clears: chain-ladder and Bornhuetter-Ferguson ultimates, each year\'s projected use of its aggregate, expected loss for 2026-27, the probability of breaching the capital requirement, and the capital that holds it under the board\'s tolerance. The actuary reviews and opines on that, at a smaller fixed fee, rather than building it.',
    gate: 'External gate. The consulting actuary signs off on the methods and the selections. The statutory opinion at year end is separate and unchanged.',
    nomodel: 'No language model in the numbers. Reserving is arithmetic with judgement on top, and the judgement is the actuary\'s.',
  },
  allocation: {
    today: 'Build the allocation. Write the memo. Hold five meetings with five CFOs, each of whom believes they are subsidising the others. Rework it. Hold two more.',
    ai: 'The allocation engine produces each company\'s premium with the credibility weight and the cap as visible inputs. A model drafts each CFO a one-page memo from the engine\'s output: their number, what moved it, their own record. All five go out the same morning with a five-day comment window.',
    gate: 'Gate 3. The risk manager approves the allocation before the memos go out. Disputes go to one call with the numbers on the table.',
  },
  submission: {
    today: 'Write the narrative. Build the exhibits. Draft a paragraph for each large claim from the adjuster\'s notes. The broker markets it. Quotes arrive; compare them in a spreadsheet; ask the actuary what the attachment point is worth; wait for the answer.',
    ai: 'The submission assembles itself from the pipeline\'s exports and the engines\' tables. A model drafts the narrative and the large-loss paragraphs from the adjuster\'s notes. When quotes arrive, the capital model prices each one as a breach probability and a capital need, and a model reads the term sheets for what the numbers miss.',
    gate: 'The claims manager reads the narratives against the files. The risk manager edits the submission and the broker sends it. From here the market\'s clock runs, and nothing on this page shortens it.',
  },
  board: {
    today: 'Assemble the pack from everyone\'s spreadsheets the week before the meeting. Reconcile the numbers that do not agree. Write the cover note at midnight.',
    ai: 'The brief generates from the same engines the actuary and the CFOs have been reading, with the decisions requested at the top and the basis of preparation at the bottom. Nothing on it is typed. It is ready the day the quotes are compared, and it waits for the meeting.',
    gate: 'Gate 4. The board decides. On this book it has a real decision to make.',
    nomodel: 'No language model. The brief is assembled from engine output by code, so that every number on it is traceable to the tool that produced it.',
  },
  bind: {
    today: 'Bound terms to the captive manager. The contract wording to counsel, who reads both versions. The domicile business-plan filing. A certificate for every counterparty whose contract requires one, typed from the contract.',
    ai: 'The contract wording is compared with the expiring wording and every change listed with its effect, for counsel to read in an hour. The domicile filing drafts from the board minute. Certificates generate from the contract register, with any gap between what a contract requires and what the programme carries flagged before the certificate goes out.',
    gate: 'Counsel advises on the marked clauses. The captive manager binds and files. The risk manager signs each certificate that carries a flag.',
  },
};

// ---------------------------------------------------------------------------
// Model: assumptions, headline, calendar, per-step cost lines.

let A = defaults();
let R = compute(A);

function renderModel() {
  R = compute(A);
  const T = R.today, P = R.ai;
  for (const el of $$('[data-out]')) {
    const k = el.dataset.out;
    el.textContent = k === 'today.weeks' ? weeksText(T.elapsedDays) : k === 'ai.weeks' ? weeksText(P.elapsedDays)
      : k === 'today.cost' ? costText(T.cost) : k === 'ai.cost' ? costText(P.cost)
      : k === 'ai.days' ? String(Math.round(P.elapsedDays)) : k === 'waiting' ? String(Math.round(R.waitingDays))
      : k === 'payback' ? (R.paybackCycles === null ? 'never' : (Math.round(R.paybackCycles * 10) / 10).toString()) : '';
  }
  const row = (label, a, b, change, sub) => `<div class="cmp"><div class="cmp-label">${label}</div><div class="cmp-today"><span class="v">${a}</span><span class="k">as usually run</span></div><div class="cmp-ai"><span class="v">${b}</span><span class="k">with the pipeline</span></div><div class="cmp-change"><span class="v">${change}</span><span class="k">${sub}</span></div></div>`;
  $('#compare').innerHTML =
    row('Elapsed, data call to bound', weeksText(T.elapsedDays), weeksText(P.elapsedDays), '−' + pct(R.elapsedPct), `${Math.round(R.waitingDays)} of ${Math.round(P.elapsedDays)} pipeline days are waiting`) +
    row('People\'s time', hoursText(T.hours), hoursText(P.hours), '−' + pct(R.hoursPct), 'in-house and operating company hours') +
    row('Cost per renewal', costText(T.cost), costText(P.cost), '−' + pct(R.savingPct), `${costText(T.fees)} of the left figure is the actuary's fee; ${costText(P.fees)} on the right`);
  $('#compare-note').textContent = `Elapsed is business days on the critical path. Cost is hours times rate plus external fees, from the assumptions below. Commission, fronting and taxes are excluded from both; the cost of building the pipeline is shown separately.`;
  $('#gantt').innerHTML = gantt(T, P) + `<figcaption>Business days from the first data request. Each step's bar runs from when it can start to when it ends; the pipeline's reinsurance step is almost entirely the market's quote window.</figcaption>`;
  for (const s of STEPS) {
    const t = T.rows.find(r => r.id === s.id), p = P.rows.find(r => r.id === s.id);
    const who = (hours) => Object.entries(hours).filter(([, h]) => h > 0).map(([k, h]) => `${ROLES[k].name} ${h % 1 ? h.toFixed(1) : h}h`).join(' · ');
    const el = $(`#step-${s.id}`); if (!el) continue;
    $('.t-who', el).textContent = who(t.hours) + (t.fees ? ` · ${money(t.fees)} fee` : '');
    $('.t-meter', el).innerHTML = `<span>${weeksText(t.days)}</span><span>${money(t.cost)}</span>`;
    $('.a-who', el).textContent = who(p.hours) + (p.fees ? ` · ${money(p.fees)} fee` : '');
    $('.a-meter', el).innerHTML = `<span>${weeksText(p.days)}${p.floorDays ? ` <small>(${p.floorDays} waiting)</small>` : ''}</span><span>${money(p.cost)}</span>`;
    $('.clock', el).innerHTML = `<span class="c-today">Day ${Math.round(t.start)} to ${Math.round(t.end)} as usually run</span><span class="c-ai">Day ${Math.round(p.start)} to ${Math.round(p.end)} with the pipeline</span>`;
  }
  $('#payback').textContent = R.paybackCycles === null ? 'On these numbers the pipeline does not pay for itself on the renewal alone.' : `Saving per renewal ${money(R.saving)}, less ${money(A.system.run)} a year to run, against ${money(A.system.build)} to build: pays back in about ${Math.round(R.paybackCycles * 10) / 10} renewals on this workflow alone. The monthly claims reporting it also produces is not counted.`;
}

function gantt(T, P) {
  const width = 760, labelW = 250, rowH = 36, top = 26, right = 16;
  const days = Math.max(T.elapsedDays, P.elapsedDays);
  const wk = Math.ceil(days / DAYS_PER_WEEK);
  const x = d => labelW + (d / (wk * DAYS_PER_WEEK)) * (width - labelW - right);
  const height = top + STEPS.length * rowH + 44;
  let s = `<svg viewBox="0 0 ${width} ${height}" class="chart gantt" role="img" aria-label="Seven steps as usually run and with the pipeline, on one calendar">`;
  for (let w = 0; w <= wk; w += wk > 12 ? 2 : 1) {
    s += `<line x1="${x(w * 5)}" x2="${x(w * 5)}" y1="${top - 6}" y2="${height - 24}" stroke="${CH.rule}"/>`;
    s += `<text x="${x(w * 5)}" y="${top - 10}" text-anchor="middle" class="tick">${w === 0 ? 'week 0' : w}</text>`;
  }
  STEPS.forEach((st, i) => {
    const t = T.rows[i], p = P.rows[i];
    const y = top + i * rowH;
    s += `<text x="${labelW - 12}" y="${y + 14}" text-anchor="end" class="label">${st.n}. ${escapeHtml(st.name)}</text>`;
    s += `<rect x="${x(t.start)}" y="${y + 2}" width="${Math.max(2, x(t.end) - x(t.start))}" height="10" fill="${CH.muted}" opacity="0.55"/>`;
    s += `<rect x="${x(p.start)}" y="${y + 15}" width="${Math.max(2, x(p.end) - x(p.start))}" height="10" fill="${CH.accent}"/>`;
    if (p.floorDays) s += `<rect x="${x(p.end - p.floorDays)}" y="${y + 15}" width="${Math.max(0, x(p.end) - x(p.end - p.floorDays))}" height="10" fill="${CH.accent}" opacity="0.35"/>`;
  });
  const yb = top + STEPS.length * rowH + 4;
  s += `<line x1="${x(T.elapsedDays)}" x2="${x(T.elapsedDays)}" y1="${top - 4}" y2="${yb}" stroke="${CH.muted}" stroke-dasharray="3 3"/>`;
  s += `<text x="${x(T.elapsedDays)}" y="${yb + 28}" text-anchor="end" class="label">${escapeHtml(weeksText(T.elapsedDays))} as usually run</text>`;
  s += `<line x1="${x(P.elapsedDays)}" x2="${x(P.elapsedDays)}" y1="${top - 4}" y2="${yb}" stroke="${CH.accent}" stroke-dasharray="3 3"/>`;
  s += `<text x="${x(P.elapsedDays) + 6}" y="${yb + 14}" class="label" fill="${CH.accent}">${escapeHtml(weeksText(P.elapsedDays))} with the pipeline</text>`;
  return s + '</svg>';
}

// ---------------------------------------------------------------------------
// Assumption inputs.

function inputRow(label, path, value, unit = '', step = 1) {
  return `<tr><td>${label}</td><td class="num"><input type="number" data-path="${path}" value="${value}" min="0" step="${step}"> <span class="unit">${unit}</span></td></tr>`;
}
function renderAssumptions() {
  $('#rates').innerHTML = `<thead><tr><th>Role or fee</th><th class="num">Amount</th></tr></thead><tbody>` +
    Object.entries(ROLES).map(([k, r]) => inputRow(r.name, `rates.${k}`, A.rates[k], '$/h', 5)).join('') +
    Object.entries(FEES).map(([k, f]) => inputRow(f.name, `fees.${k}`, A.fees[k], '$', 1000)).join('') + '</tbody>';
  $('#floors').innerHTML = `<thead><tr><th>Waiting</th><th class="num">Business days</th></tr></thead><tbody>` +
    Object.entries(FLOORS).map(([k, f]) => inputRow(f.name, `floors.${k}`, A.floors[k], '', 1)).join('') + '</tbody>';
  $('#system').innerHTML = `<thead><tr><th>Pipeline</th><th class="num">$</th></tr></thead><tbody>` +
    Object.entries(SYSTEM).map(([k, f]) => inputRow(f.name, `system.${k}`, A.system[k], '', 1000)).join('') + '</tbody>';
  const th = `<thead><tr><th>Step</th><th class="num">Hours today</th><th class="num">Days today</th><th class="num">Hours, pipeline</th><th class="num">Days, pipeline</th></tr></thead>`;
  $('#hours').innerHTML = th + '<tbody>' + STEPS.map(s => {
    const th_ = Object.values(A.steps[s.id].today.hours).reduce((a, b) => a + b, 0);
    const ah = Object.values(A.steps[s.id].ai.hours).reduce((a, b) => a + b, 0);
    const cell = (path, v, step) => `<td class="num"><input type="number" data-path="${path}" value="${v}" min="0" step="${step}"></td>`;
    return `<tr><td>${s.n}. ${s.name}</td>${cell(`hours.${s.id}.today`, th_, 1)}${cell(`days.${s.id}.today`, A.steps[s.id].today.days, 0.5)}${cell(`hours.${s.id}.ai`, ah, 0.5)}${cell(`days.${s.id}.ai`, A.steps[s.id].ai.days, 0.5)}</tr>`;
  }).join('') + '</tbody>';
}
function applyInput(path, raw) {
  const v = Math.max(0, Number(raw) || 0);
  const p = path.split('.');
  if (p[0] === 'rates' || p[0] === 'fees' || p[0] === 'floors' || p[0] === 'system') { A[p[0]][p[1]] = v; return; }
  const track = A.steps[p[1]][p[2]];
  if (p[0] === 'days') { track.days = v; return; }
  const cur = Object.values(track.hours).reduce((a, b) => a + b, 0);
  const base = STEPS.find(s => s.id === p[1])[p[2]].hours;
  const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
  const src = cur > 0 ? track.hours : base, srcTotal = cur > 0 ? cur : baseTotal;
  for (const k of Object.keys(src)) track.hours[k] = src[k] * v / srcTotal;
}
$('#assumptions').addEventListener('input', e => { if (e.target.dataset.path) { applyInput(e.target.dataset.path, e.target.value); renderModel(); } });
$('#reset').addEventListener('click', () => { A = defaults(); renderAssumptions(); renderModel(); });

// ---------------------------------------------------------------------------
// Steps: skeleton, then artifacts from the engines.

function mdLite(text) {
  const blocks = text.split(/\n\s*\n/);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (lines[0].trim().startsWith('|')) {
      const rows = lines.filter(l => l.trim().startsWith('|') && !/^\|\s*-+/.test(l.trim())).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      return `<div class="table-scroll"><table class="data"><thead><tr>${rows[0].map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map((c, i) => `<td class="${i > 0 && /^[-+$\d]/.test(c) ? 'num' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (lines.every(l => l.trim().startsWith('- '))) return `<ul>${lines.map(l => `<li>${escapeHtml(l.trim().slice(2))}</li>`).join('')}</ul>`;
    if (b.trim() === '—') return '<hr>';
    if (/^[A-Z0-9 ,'’\-—:]+$/.test(lines[0].trim()) && lines[0].trim().length < 80 && lines.length === 1) return `<p class="md-head">${escapeHtml(lines[0])}</p>`;
    return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
  }).join('');
}

function runBlock(run) {
  return `<details class="run"><summary><span class="badge accent">Model run</span> ${escapeHtml(run.title)} <span class="muted small">· ${run.model}, recorded ${fmt.date(run.recorded)}</span></summary>
    <div class="run-body">
      <details class="prompt"><summary>The prompt, exactly as sent</summary><pre>${escapeHtml(run.prompt())}</pre></details>
      <p class="kicker">Output, recorded</p>
      <div class="md">${mdLite(run.output)}</div>
      <p class="gate"><strong>After it:</strong> ${escapeHtml(run.gate)}</p>
      ${run.figures.length ? `<p class="note">${run.figures.length} figures in this output are recomputed from the engines by the test suite and checked against the text.</p>` : ''}
    </div></details>`;
}

function stepSkeleton(s) {
  const c = COPY[s.id];
  return `<article class="step" id="step-${s.id}">
    <div class="step-head"><p class="kicker">Step ${s.n} of 7</p><h3>${escapeHtml(s.name)}</h3><p class="clock"></p></div>
    <div class="tracks">
      <div class="track today"><p class="kicker">As usually run</p><p>${escapeHtml(c.today)}</p><p class="who t-who"></p><p class="meter t-meter"></p></div>
      <div class="track ai"><p class="kicker">With the pipeline</p><p>${escapeHtml(c.ai)}</p><p class="who a-who"></p><p class="meter a-meter"></p></div>
    </div>
    <p class="gate-line">${/^(Gate \d|External gate)/.test(c.gate) ? `<strong>${escapeHtml(c.gate.split('. ')[0])}.</strong> ${escapeHtml(c.gate.slice(c.gate.indexOf('. ') + 2))}` : `<strong>Where a person signs.</strong> ${escapeHtml(c.gate)}`}</p>
    <div class="artifact" id="art-${s.id}"><p class="note">Computing from the demo book…</p></div>
    ${c.nomodel ? `<p class="nomodel"><span class="badge">No model</span> ${escapeHtml(c.nomodel)}</p>` : ''}
    ${byStep(s.id).map(runBlock).join('')}
  </article>`;
}
$('#steps').innerHTML = STEPS.map(stepSkeleton).join('');
renderAssumptions();
renderModel();

// Where the model is.
const NOMODEL = STEPS.filter(s => COPY[s.id].nomodel);
$('#model-table').innerHTML = table([
  { key: 'step', label: 'Step' },
  { key: 'task', label: 'Task' },
  { key: 'how', label: 'Done by', render: v => v === 'Model' ? '<span class="badge accent">Model</span>' : '<span class="badge">Code</span>' },
  { key: 'gate', label: 'Person after it' },
], [
  ...RUNS.map(r => ({ n: STEPS.find(s => s.id === r.step).n, step: `${STEPS.find(s => s.id === r.step).n}. ${STEPS.find(s => s.id === r.step).name}`, task: r.title, how: 'Model', gate: r.gate.split('. ')[0] + '.' })),
  ...NOMODEL.map(s => ({ n: s.n, step: `${s.n}. ${s.name}`, task: s.id === 'clean' ? 'Standardise, validate, reconcile, export' : s.id === 'actuarial' ? 'Ultimates, erosion, expected loss, capital' : 'Assemble the brief from engine output', how: 'Code', gate: COPY[s.id].gate.split('. ').slice(1, 2).join('') + '.' })),
].sort((a, b) => a.n - b.n), { caption: 'Every task on the pipeline track, and whether a model or code does it' });

// ---------------------------------------------------------------------------
// Artifacts. Heavy work after first paint.

setTimeout(renderArtifacts, 0);

function renderArtifacts() {
  const book = generateBook();
  const snap = snapshot(book);
  const entityName = code => ENTITIES.find(e => e.code === code)?.name || code;

  // 1. Data call: the replies and the schedule the model produced.
  $('#art-data').innerHTML = `
    <p class="kicker">The artifact</p>
    <p class="method">Five replies, five shapes. The model's schedule and exception list are in the run below; the replies themselves are here.</p>
    <details class="replies"><summary>The five replies as received</summary>${EXPOSURE_REPLIES.map(r => `<div class="reply"><p class="kicker">${escapeHtml(r.name)} · ${escapeHtml(r.format)}</p><pre>From: ${escapeHtml(r.from)}\nSubject: ${escapeHtml(r.subject)}\n\n${escapeHtml(r.body)}</pre></div>`).join('')}</details>
    <div class="table-scroll">${table([
      { key: 'name', label: 'Company' }, { key: 'payroll', label: 'Payroll', num: true, render: v => money(v) }, { key: 'revenue', label: 'Revenue', num: true, render: v => money(v) }, { key: 'vehicles', label: 'Vehicles', num: true }, { key: 'note', label: 'What the gate decided' },
    ], ENTITIES.map(e => ({ name: e.name, payroll: exposureFor(e.code, 'WC', RENEWAL.policyYear) * 1e6, revenue: exposureFor(e.code, 'GL', RENEWAL.policyYear) * 1e6, vehicles: Math.round(exposureFor(e.code, 'AL', RENEWAL.policyYear)), note: { NLL: 'As sent', HFD: 'Thousands confirmed with the sender', CVS: 'Fleet count arrived the next day', MHP: 'Existing operations; acquisition endorsed at closing', SBG: 'Trended 4.5% pending the budget' }[e.code] })), { caption: `The exposure schedule released for ${py(RENEWAL.policyYear)}` })}</div>`;

  // 2. Pipeline, run live.
  const raw = buildRawLossRun(book);
  const prior = snapshot(book, '2026-08-30');
  const out = runPipeline(raw.text, { prior, asOf: book.evaluationDate, priorAsOf: '2026-08-30' });
  const blocks = out.exceptions.filter(e => e.severity === 'block');
  const warns = out.exceptions.length - blocks.length;
  const exc = out.exceptions.slice().sort((a, b) => (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1) || a.rule.localeCompare(b.rule)).slice(0, 14);
  $('#art-clean').innerHTML = `
    <p class="kicker">The artifact, run just now in your browser</p>
    <div class="finding"><p>${out.gate.held ? 'The release is held.' : 'The release went through.'} Of ${fmt.num(out.steps[0].counts.rows)} rows in the administrator's file, ${out.quarantined.length} could not be loaded and ${warns} needed a correction the pipeline made itself.</p><p>${out.gate.held ? 'Before anything downstream refreshes, someone has to ' + out.gate.reasons.join(', and ') + '.' : ''} Yesterday's version of this was a spreadsheet nobody checked.</p></div>
    <div class="grid-4">${stat(fmt.num(out.totals.claims), 'Claims loaded', `${fmt.num(out.totals.open)} open`)}${stat(String(out.quarantined.length), 'Quarantined', `${blocks.length} blocking`, 'accent')}${stat(String(warns), 'Corrected or noted')}${stat(m(out.totals.incurred), 'Total incurred', `${m(out.totals.outstanding)} outstanding`)}</div>
    <details><summary>The exception file, first ${exc.length} of ${out.exceptions.length}</summary><div class="table-scroll">${table([
      { key: 'severity', label: 'Severity', render: v => `<span class="badge ${v === 'block' ? 'accent' : 'warn'}">${v === 'block' ? 'Blocking' : 'Warning'}</span>` },
      { key: 'rule', label: 'Rule' }, { key: 'claimId', label: 'Claim', class: 'mono' }, { key: 'row', label: 'Row', num: true }, { key: 'detail', label: 'Detail' }, { key: 'action', label: 'Action taken' },
    ], exc.map(e => ({ ...e, _class: e.severity === 'block' ? 'flag' : '' })))}</div></details>`;

  // 3. Development and capital.
  const dev = analyse(book);
  const op = openingPosition(book), pat = derivePaymentPattern(book);
  const capBase = { ...CAP, expectedLossRatio: op.expectedLossRatio, startingCapital: RENEWAL.startingCapital, sims: 2000 };
  const cap = simulate(capBase, op, pat);
  const need = capitalForTolerance(capBase, op, pat, RENEWAL.tolerance);
  const worst = dev.breaches.slice().sort((a, b) => b.excess - a.excess)[0];
  const H = capBase.horizonQuarters;
  const erosion = Object.keys(LINES).map(lc => {
    const yrs = dev.perLine[lc].years;
    const items = yrs.map(y => ({ label: `${py(y.py)} · ${y.age}m`, value: y.selected, marker: y.aggregate, color: y.excess > 0 ? CH.accent : (y.erodedUlt >= 0.9 ? CH.s6 : CH.ink) }));
    const max = Math.max(...yrs.map(y => Math.max(y.selected, y.aggregate))) * 1.12;
    return `<figure><figcaption class="top">${LINES[lc].name}: selected ultimate by policy year against that year's aggregate (the mark)</figcaption>${barChart({ items, max, barHeight: 16, gap: 6, labelWidth: 150, valueFormat: v => m(v), title: `${LINES[lc].name} projected ultimate against aggregate` })}</figure>`;
  }).join('');
  $('#art-actuarial').innerHTML = `
    <p class="kicker">The artifact, computed just now</p>
    <div class="finding"><p>${worst ? `${LINES[worst.line].name} ${py(worst.py)} is projected to use ${pct(worst.erodedUlt)} of its aggregate; ${m(worst.excess)} falls into the aggregate layer on that year alone, ${m(dev.totals.excess)} across the ${dev.breaches.length} years that breach.` : 'No year is projected to exhaust its aggregate.'} With ${m(RENEWAL.startingCapital)} of capital the captive has a ${pct(cap.breachAny, 1)} chance of falling below its capital requirement within three years; holding ${m(need.capital)} would bring that under ${pct(RENEWAL.tolerance)}.</p><p>Known nine months before the renewal, both are pricing conversations. Discovered at the renewal, they are surprises. On this synthetic book the eventual cost of every claim is known, so the method can be checked: mature-year estimates land within ${pct(dev.backtest.matureError, 1)} of the truth.</p></div>
    <div class="grid-4">${stat(m(dev.totals.selected), 'Selected ultimate', 'all lines, eight years')}${stat(m(dev.totals.ibnr), 'IBNR', `${pct(dev.totals.ibnr / dev.totals.latest, 1)} of reported`)}${stat(m(dev.totals.excess), 'Into the aggregate layer', `${dev.breaches.length} year-lines breach`, 'accent')}${stat(pct(cap.breachAny, 1), 'Capital breach probability', `${m(need.capital - RENEWAL.startingCapital)} more capital holds ${pct(RENEWAL.tolerance)}`, cap.breachAny > RENEWAL.tolerance ? 'accent' : '')}</div>
    <details><summary>Aggregate erosion by line, all eight years</summary>${erosion}</details>
    <details><summary>Capital against the requirement, twelve quarters, 2,000 paths</summary><figure>${fanChart({ x: Array.from({ length: H + 1 }, (_, q) => q), bands: [{ lo: cap.ratio.p5, hi: cap.ratio.p95, opacity: 0.12 }, { lo: cap.ratio.p25, hi: cap.ratio.p75, opacity: 0.2 }], median: cap.ratio.p50, yFormat: v => v.toFixed(1) + '×', xFormat: q => q === 0 ? 'open' : 'Q' + q, reference: 1, referenceLabel: 'requirement', width: 720, height: 240, title: 'Capital adequacy ratio by quarter' })}<figcaption>Capital divided by required capital. Bands are the 5th to 95th and 25th to 75th percentiles of 2,000 simulated paths.</figcaption></figure></details>`;

  // 4. Allocation.
  const cor = costOfRisk(book); const al = allocate(book, cor); const sub = subsidy(cor, al.window);
  $('#art-allocation').innerHTML = `
    <p class="kicker">The artifact, computed just now</p>
    <div class="finding"><p>${m(al.total)} of premium for ${py(al.nextPy)}. ${m(al.moved)} moves between the five companies on their own experience over ${py(al.window[0])} to ${py(al.window[al.window.length - 1])}, capped at ${pct(al.params.cap)} from exposure share. The company that has run at a ${pct(Math.min(...sub.map(s => s.lossRatio)))} loss ratio pays less; the one at ${pct(Math.max(...sub.map(s => s.lossRatio)))} pays more.</p></div>
    <figure style="max-width:680px">${barChart({ items: al.byEntity.map(e => ({ label: e.name, value: e.allocated, marker: e.exposureBased, color: e.change > 0 ? CH.accent : CH.ink })), valueFormat: v => m(v), max: Math.max(...al.byEntity.map(e => Math.max(e.allocated, e.exposureBased))) * 1.15, title: 'Proposed premium by operating company' })}<figcaption>Proposed premium; the mark is what exposure share alone would give.</figcaption></figure>
    <details><summary>The allocation table</summary><div class="table-scroll">${table([
      { key: 'name', label: 'Company' }, { key: 'exposureBased', label: 'Exposure-based', num: true, render: money }, { key: 'allocated', label: 'Allocated', num: true, render: v => `<strong>${money(v)}</strong>` }, { key: 'change', label: 'Change', num: true, render: v => (v >= 0 ? '+' : '−') + money(Math.abs(v)) }, { key: 'changePct', label: '', num: true, render: v => (v >= 0 ? '+' : '−') + pct(Math.abs(v), 1) }, { key: 'claims', label: 'Claims in window', num: true }, { key: 'lr', label: 'Loss ratio in window', num: true, render: v => pct(v) },
    ], al.byEntity.map(e => ({ ...e, lr: sub.find(s => s.entity === e.entity).lossRatio })), { footer: { name: 'Total', exposureBased: money(al.byEntity.reduce((s, e) => s + e.exposureBased, 0)), allocated: money(al.total) } })}</div></details>`;

  // 5. Submission: notes behind the narratives, then quotes priced in the background.
  const large = snap.filter(c => c.status !== 'Closed' && c.incurred >= 250000).sort((a, b) => b.incurred - a.incurred);
  $('#art-submission').innerHTML = `
    <p class="kicker">The artifacts</p>
    <p class="method">Three things go to market: the narrative, one paragraph for each of the ${large.length} open claims at or above the retention, and the exhibits (the pipeline's actuarial export and the engines' tables, attached unchanged). Then three quotes come back and the capital model prices them.</p>
    <details><summary>The adjuster's notes behind the five largest claims, as the model read them</summary>${ADJUSTER_NOTES.map(n => { const c = snap.find(x => x.id === n.id); return `<div class="reply"><p class="kicker">${n.id} · ${entityName(c.entity)} · incurred ${money(c.incurred)}</p><pre>${escapeHtml(n.notes)}</pre></div>`; }).join('')}</details>
    <div id="quotes"><p class="note">Pricing three quotes and the no-cover option, 2,000 paths each…</p></div>`;

  // 6 and 7 need the quote pricing; 7's certificate part does not.
  const reg = generateContracts(); const ac = analyseContracts(reg);
  const needCert = ac.rows.filter(r => r.holder);
  const sample = needCert.find(r => r.gaps.some(g => g.kind === 'limit' || g.kind === 'coverage')) || needCert[0];
  const cert = certificate(sample);
  $('#art-bind').innerHTML = `
    <p class="kicker">The artifacts</p>
    <p class="method">The wording review is the run below. Certificates: ${needCert.length} of the ${ac.rows.length} live contracts name a certificate holder. ${needCert.filter(r => r.atRisk).length} of those require a limit or a coverage the programme does not carry, and the certificate says so before it goes out rather than after.</p>
    <details><summary>The three term sheets as received</summary>${QUOTES.map(q => `<div class="reply"><p class="kicker">${escapeHtml(q.market)}</p><pre>${escapeHtml(q.terms)}</pre></div>`).join('')}</details>
    <details><summary>The expiring and drafted contract wording the model compared</summary><div class="grid-2"><div><p class="kicker">Expiring</p><pre>${escapeHtml(WORDING.expiring)}</pre></div><div><p class="kicker">Drafted</p><pre>${escapeHtml(WORDING.bound)}</pre></div></div></details>
    <details><summary>A generated certificate with a gap flagged: ${escapeHtml(cert.insured)} for ${escapeHtml(cert.holder)}</summary><div class="table-scroll">${table([
      { key: 'label', label: 'Coverage' }, { key: 'limit', label: 'Limit carried', num: true, render: v => typeof v === 'number' ? money(v) : v }, { key: 'required', label: 'Contract requires', num: true, render: v => v ? money(v) : '—' }, { key: 'ok', label: '', render: v => v ? '' : '<span class="badge accent">Gap</span>' }, { key: 'extra', label: 'Endorsement' },
    ], cert.coverages.map(c => ({ ...c, _class: c.ok ? '' : 'flag' })), { caption: `${cert.type}, contract ${cert.contract}` })}</div></details>`;

  setTimeout(() => priceQuotes({ book, snap, dev, op, pat, capBase, cap, need, al, sub, ac, large }), 30);
}

function priceQuotes(ctx) {
  const { dev, op, pat, capBase, al, sub, ac, large, snap } = ctx;
  const prem = al.total;
  const options = [{ id: 'none', name: 'No cover', over: { aggregate: false }, cost: 0 }, ...QUOTES.map(q => ({ id: q.id, name: q.market, over: { aggregateAttach: q.attach, aggregateCost: q.cost }, cost: q.cost, attach: q.attach }))];
  const priced = options.map(o => {
    const p = { ...capBase, ...o.over };
    const s = simulate(p, op, pat); const n = capitalForTolerance(p, op, pat, RENEWAL.tolerance);
    const contribution = n.capital === null ? null : Math.max(0, n.capital - RENEWAL.startingCapital);
    const premium = prem * o.cost;
    return { ...o, breach: s.breachAny, contribution, premium, annual: contribution === null ? null : premium + 0.1 * contribution };
  });
  const cheapest = priced.slice().sort((a, b) => a.annual - b.annual)[0];
  $('#quotes').innerHTML = `
    <div class="finding"><p>On premium plus a 10% cost of capital, the cheapest way to hold the ${pct(RENEWAL.tolerance)} tolerance on this book is ${cheapest.id === 'none' ? 'not to buy the cover at all' : cheapest.name}: ${money(cheapest.annual)} a year. The cover being renewed on autopilot, Market A at expiring terms, costs ${money(priced[1].annual - cheapest.annual)} a year more than that for a higher breach probability at today's capital.</p><p>The capital model prices the numbers. It does not read the wording, and two of the three term sheets give less than they appear to. That is the model's job, in the run below.</p></div>
    <div class="table-scroll">${table([
      { key: 'name', label: 'Option' }, { key: 'attach', label: 'Attachment', num: true, render: v => v ? pct(v) + ' of expected' : '—' }, { key: 'premium', label: 'Premium', num: true, render: money }, { key: 'breach', label: 'Breach probability at $9.0m', num: true, render: v => pct(v, 1) }, { key: 'contribution', label: `Capital to hold ${pct(RENEWAL.tolerance)}`, num: true, render: v => v === null ? 'out of range' : money(v) }, { key: 'annual', label: 'Premium + 10% of capital', num: true, render: v => v === null ? '—' : `<strong>${money(v)}</strong>` },
    ], priced.map(p => ({ ...p, _class: p === cheapest ? '' : '' })), { caption: 'Three quotes and the no-cover option, priced by the capital model (2,000 paths each)' })}</div>`;

  // 6. The brief.
  const B = priced.find(p => p.id === 'B'), N = priced.find(p => p.id === 'none');
  const worst = dev.breaches.slice().sort((a, b) => b.excess - a.excess)[0];
  const decisions = [
    ['Reinsurance', `Do not renew the aggregate stop-loss at expiring terms. Choose between no cover with a capital contribution of ${money(N.contribution)}, and ${B.name} at ${money(B.premium)} subject to removal of the sunset clause and acceptance of the Meridian acquisition at a stated premium. The recommendation is ${B.name} unless the parent will commit up to $4.5m of capital at plausible volatility.`],
    ['Capital', `Approve a contribution of ${money(B.contribution)} if ${B.name} is bound, or ${money(N.contribution)} if no cover is bought, to hold the breach probability under ${pct(RENEWAL.tolerance)} over three years.`],
    ['Renewal', worst ? `${LINES[worst.line].name} ${py(worst.py)} is projected to exceed its aggregate by ${money(worst.excess)}. Confirm notice to the expiring aggregate carrier and reflect the year in the pricing conversation.` : 'No policy year is projected to exhaust its aggregate.'],
    ['Premium allocation', `Approve the ${py(al.nextPy)} allocation: ${money(al.total)} in total, ${money(al.moved)} moving between operating companies on experience, no company more than ${pct(al.params.cap)} from its exposure-based share.`],
    ['Acquisition', `Note that Meridian Health Partners expects to close Red River Clinics on 1 December 2026, about $10.9m of payroll. It is excluded from the allocation and must be declared to the reinsurer within 30 days of closing if ${B.name} is bound.`],
    ['Contracts', `${ac.atRisk.length} of ${ac.rows.length} live contracts, worth ${m(ac.valueAtRisk)} a year, require insurance the programme does not carry. Refer the ${ac.uncapped.length} uncapped indemnities to counsel; the buy-up plan follows separately.`],
  ];
  const open = snap.filter(c => c.status !== 'Closed');
  $('#art-board').innerHTML = `
    <p class="kicker">The artifact, generated just now</p>
    <div class="brief">
      <div class="brief-head"><div><p class="kicker">Risk committee · Captive programme</p><h4>Renewal brief, ${fmt.date(RENEWAL.boardMeeting)}</h4></div><div class="meta">Prepared automatically from the daily claims pipeline<br>Data through ${fmt.date(RENEWAL.dataAsOf)} · ${fmt.num(snap.length)} claims · eight policy years</div></div>
      <h5>Decisions requested</h5>
      <ol class="decision-list">${decisions.map(([area, text]) => `<li><span class="area">${area}</span><p>${escapeHtml(text)}</p></li>`).join('')}</ol>
      <h5>Position at a glance</h5>
      <div class="glance">${stat(fmt.num(open.length), 'Open claims', `of ${fmt.num(snap.length)}`)}${stat(m(dev.totals.latest), 'Incurred to date', `${m(dev.totals.ibnr)} IBNR`)}${stat(m(dev.totals.excess), 'Into aggregate layer', `${dev.breaches.length} year-lines`, 'accent')}${stat(pct(ctx.cap.breachAny, 1), 'Breach probability', `at ${m(RENEWAL.startingCapital)} capital, expiring cover`, 'accent')}${stat(money(al.total), `Premium ${py(al.nextPy)}`, `${money(al.moved)} reallocated`)}${stat(String(large.length), 'Open claims at retention', 'narratives in the submission')}</div>
      <p class="basis">Basis of preparation. Claims are the administrator's loss run at ${fmt.date(RENEWAL.dataAsOf)}, standardised and validated by the pipeline; quarantined rows excluded. Ultimates are chain-ladder with a fitted tail, Bornhuetter-Ferguson at or under 24 months. Capital is simulated over twelve quarters with a lognormal loss ratio at ${pct(capBase.lossRatioCv)} volatility; the requirement is ${pct(capBase.requiredPremiumFactor)} of premium plus ${pct(capBase.requiredReserveFactor)} of reserves. Allocation uses classical credibility with ${al.params.credibilityK} claims for half weight. Every figure is reproducible from the seed in the repository.</p>
    </div>`;
}
