// app.js — wiring.
//
// Nothing is persisted. Closing the tab discards the register, the schedule of
// insurance and the run. That is deliberate: it is the reason this can be
// pointed at a live book without anyone having to ask permission first.

import { short, pct, count, returnPeriod, esc, download, today } from '../../assets/js/fmt.js';
import {
  DEFAULT_SETTINGS, CATEGORIES, CATEGORY_KEYS, PERILS, PERIL_META, coverageLine,
} from './assume.js';
import { loadRegister, loadProgram, buildLedger, money, ceilingFor } from './data.js';
import { prepare, simulate, simulateWithAttribution, withCeilings, withLayers } from './sim.js';
import { landingChart, exceedanceChart, towerChart, contributorChart } from './charts.js';
import { deriveFindings, rankContributors } from './findings.js';
import { boardMemo, contractCSV, findingsCSV, aggregateCSV, exceedanceCSV } from './memo.js';
import { sampleRegisterCSV, SAMPLE_PROGRAM_CSV, SAMPLE_NOTE } from './samples.js';

const $ = (id) => document.getElementById(id);

const state = {
  registerCSV: sampleRegisterCSV(),
  programCSV: SAMPLE_PROGRAM_CSV,
  isSample: true,
  settings: { ...DEFAULT_SETTINGS, trials: 25000 },
  overrides: null,
  calibrationNote: '',
  levers: [],
  leversDone: false,
  leversPending: 0,
  ctx: null,
};

/** Bumped on every run so a lever pass from a stale book abandons itself. */
let leverToken = 0;

/* ------------------------------------------------------------ the run --- */

function busy(on, text = 'Simulating…') {
  $('busyText').textContent = text;
  $('busy').classList.toggle('on', on);
}

/**
 * Yield so the busy state paints before the loop blocks the thread. A hidden or
 * background tab never fires requestAnimationFrame, so the timer has to be able
 * to win the race — otherwise the model simply never starts.
 */
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => requestAnimationFrame(finish));
  setTimeout(finish, 60);
});

async function run() {
  busy(true, 'Reading the register…');
  await nextFrame();

  const { contracts, issues: regIssues } = loadRegister(state.registerCSV);
  const program = loadProgram(state.programCSV);

  if (!contracts.length) {
    busy(false);
    renderEmpty(regIssues, program.issues);
    return;
  }

  busy(true, `Simulating ${count(state.settings.trials)} years across ${count(contracts.length)} contracts…`);
  await nextFrame();

  const ledger = buildLedger(contracts, program);
  const prepared = prepare(contracts, program, ledger, state.settings);
  const t0 = performance.now();
  const result = simulateWithAttribution(prepared, state.settings);
  const elapsed = Math.round(performance.now() - t0);

  const ranked = rankContributors(contracts, result, 25);
  const findings = deriveFindings({ contracts, program, prepared, result, ranked });

  state.ctx = { contracts, program, ledger, prepared, result, ranked, findings, regIssues, elapsed, settings: state.settings };
  state.levers = [];
  state.leversDone = false;
  state.leversPending = 0;

  renderAll();
  busy(false);

  // The levers are three more full simulations. They run on their own without
  // blocking, and each row appears as it lands — no visibility triggers, because
  // a background tab does not fire them and the table would sit at "pricing"
  // forever.
  setTimeout(priceStandardLevers, 250);
}

/* ----------------------------------------------------------- rendering --- */

function renderAll() {
  const c = state.ctx;
  renderRunbar(c);
  renderHeadline(c);
  renderLanding(c);
  renderFindings(c);
  renderQueue(c);
  renderLimits(c);
  renderInputs(c);
  renderMethod(c);
  renderLeverTable();
  populateLineSelect();
}

function renderEmpty(regIssues, progIssues) {
  $('hero').innerHTML = '—<small>no register loaded</small>';
  $('heroWhy').textContent = 'Nothing in the contract register could be read. The problems found are listed below.';
  $('regSummary').innerHTML = issueList(regIssues) || '<p class="empty">Empty.</p>';
  $('progSummary').innerHTML = issueList(progIssues) || '<p class="empty">Empty.</p>';
}

function renderRunbar(c) {
  const bookValue = c.contracts.reduce((s, x) => s + x.annualValue, 0);
  const layers = c.prepared.lines.flatMap((l) => l.layers).length;
  $('runbar').innerHTML = `
    <span><b>${count(c.contracts.length)}</b> contracts · <b>${short(bookValue)}</b> annual value</span>
    <span><b>${layers}</b> layer${layers === 1 ? '' : 's'} across <b>${c.prepared.lines.length}</b> line${c.prepared.lines.length === 1 ? '' : 's'}</span>
    <span><b>${count(c.result.trials)}</b> simulated years in ${c.elapsed}ms</span>
    <span>seed <b class="mono">${c.settings.seed}</b></span>
    <span>${state.isSample ? 'Synthetic sample book' : 'Your data — never left this browser'}</span>
    ${state.calibrationNote ? `<span><b>Calibrated</b> — ${esc(state.calibrationNote)}</span>` : '<span>Default assumptions</span>'}`;
}

function renderHeadline(c) {
  const r = c.result;
  $('hero').innerHTML = `${short(r.retained.mean)}<small>expected, per year</small>`;

  const bookValue = c.contracts.reduce((s, x) => s + x.annualValue, 0);
  const capped = c.contracts.filter((x) => isFinite(x.cap));
  const sumCaps = capped.reduce((s, x) => s + x.cap, 0);
  const uncapped = c.contracts.length - capped.length;
  const transferShare = r.gross.mean > 0 ? r.transferred.mean / r.gross.mean : 0;

  $('heroWhy').innerHTML = `
    The book produces <b>${short(r.gross.mean)}</b> of modelled contractual loss a year.
    <b>${short(r.transferred.mean)}</b> of it reaches a third-party carrier — ${pct(transferShare, 0)}.
    The rest stays here.<br><br>
    For contrast, the sum of the liability caps in this register is <b>${short(sumCaps)}</b>${uncapped ? `, and ${uncapped} contracts carry no cap at all` : ''}.
    That figure is what usually gets reported. It answers a question nobody asked.`;

  $('exceedance').innerHTML = exceedanceChart(r.distribution, [
    { rp: 10, value: r.retained.p90, label: `1 in 10 · ${short(r.retained.p90)}` },
    { rp: 100, value: r.retained.p99, label: `1 in 100 · ${short(r.retained.p99)}` },
  ]);

  $('figrow').innerHTML = `
    <div><div class="k">One year in ten</div><div class="v num">${short(r.retained.p90)}</div><div class="n2">${(r.retained.p90 / Math.max(1, r.retained.mean)).toFixed(1)}× the expected year</div></div>
    <div><div class="k">One year in a hundred</div><div class="v num">${short(r.retained.p99)}</div><div class="n2">${(r.retained.p99 / Math.max(1, r.retained.mean)).toFixed(1)}× the expected year</div></div>
    <div><div class="k">Worst 1% average</div><div class="v num">${short(r.retained.tvar99)}</div><div class="n2">What a bad year actually costs</div></div>
    <div><div class="k">Claims a year</div><div class="v num">${r.claimsPerYear.toFixed(1)}</div><div class="n2">Across ${count(c.contracts.length)} agreements</div></div>`;
}

function renderLanding(c) {
  $('landingChart').innerHTML = landingChart(c.result.split);
}

function renderFindings(c) {
  if (!c.findings.length) {
    $('findingsList').innerHTML = '<p class="empty">This run produced no findings above threshold. That is unusual — check the register loaded as intended.</p>';
    return;
  }
  $('findingsList').innerHTML = `<div class="findings">${c.findings.map((f) => `
    <article class="finding">
      <div class="sev ${f.severity}">${f.severity === 'note' ? 'Observation' : f.severity}</div>
      <div>
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.detail)}</p>
        <p class="act"><b>What to do.</b> ${esc(f.action)}</p>
      </div>
    </article>`).join('')}</div>`;
}

function renderQueue(c) {
  const rows = c.ranked.slice(0, 12);
  $('queueHint').textContent = `Averaged over the ${count(c.result.tailTrials)} simulated years worse than ${short(c.result.attributionThreshold)}`;
  $('queueChart').innerHTML = contributorChart(rows);

  $('queueTable').innerHTML = `<table class="data">
    <thead><tr>
      <th class="rank">#</th><th>Contract</th><th>Category</th>
      <th class="n">Annual value</th><th class="n">Cap applied</th><th>Carve-outs</th>
      <th>Renews</th><th class="n">Expected</th><th class="n">Tail</th>
    </tr></thead>
    <tbody>${c.ranked.slice(0, 15).map((r, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td class="name"><b>${esc(r.id)}</b><br><span class="dim">${esc(r.counterparty)}</span></td>
      <td class="name">${esc(CATEGORIES[r.category] ? CATEGORIES[r.category].label : r.category)}</td>
      <td class="n">${short(r.annualValue)}</td>
      <td class="n">${isFinite(r.cap) ? short(r.cap) : '<span class="uncapped">none</span>'}</td>
      <td class="name mono" style="font-size:11.5px">${esc(r.carveouts || '—')}</td>
      <td class="name">${esc(r.renewal || '—')}</td>
      <td class="n">${short(r.expected)}</td>
      <td class="n"><b>${short(r.tail)}</b></td>
    </tr>`).join('')}</tbody></table>`;
}

function renderLimits(c) {
  const totalPremium = c.prepared.lines.flatMap((l) => l.layers).reduce((s, l) => s + (l.premium || 0), 0);
  $('towerHint').textContent = totalPremium > 0 ? `${short(totalPremium)} of premium as entered` : 'No premium entered';
  $('towerChart').innerHTML = towerChart(c.prepared, c.result);

  $('aggTable').innerHTML = `<table class="data">
    <thead><tr>
      <th>Aggregate pool</th><th>Behind</th><th class="n">Capacity</th><th class="n">Already eroded</th>
      <th class="n">Available</th><th class="n">Spent in an average year</th><th class="n">Exhausted in</th><th></th>
    </tr></thead>
    <tbody>${c.result.aggregates.map((a) => {
      const behind = c.prepared.lines.flatMap((l) => l.layers)
        .filter((l) => c.prepared.aggGroupIds[l.aggIdx] === a.group)
        .map((l) => `${l.code} ${l.name}`);
      const hot = a.exhaustionProb >= 0.25;
      return `<tr>
        <td class="name mono" style="font-size:12px">${esc(a.group)}</td>
        <td class="name" style="font-size:13px">${esc(behind.join('; ') || '—')}</td>
        <td class="n">${short(a.capacity)}</td>
        <td class="n">${a.eroded > 0 ? short(a.eroded) : '—'}</td>
        <td class="n">${short(a.available)}</td>
        <td class="n">${short(a.meanUsed)}</td>
        <td class="n"${hot ? ' style="color:var(--f4); font-weight:600"' : ''}>${pct(a.exhaustionProb, 1)}</td>
        <td class="name dim" style="font-size:12.5px">${esc(returnPeriod(a.exhaustionProb))}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function renderInputs(c) {
  const byCat = {};
  c.contracts.forEach((x) => {
    const b = (byCat[x.category] ||= { n: 0, value: 0, uncapped: 0, carved: 0 });
    b.n++; b.value += x.annualValue;
    if (!isFinite(x.cap)) b.uncapped++;
    if (Object.keys(x.carveouts).some((k) => k !== 'GROSS')) b.carved++;
  });
  const rows = Object.entries(byCat).sort((a, b) => b[1].value - a[1].value);
  const totalValue = c.contracts.reduce((s, x) => s + x.annualValue, 0);

  $('regHint').textContent = `${count(c.contracts.length)} contracts · ${short(totalValue)}`;
  $('regSummary').innerHTML = `<div class="scrollx"><table class="data">
    <thead><tr><th>Category</th><th class="n">Contracts</th><th class="n">Annual value</th><th class="n">No cap</th><th class="n">Cap carved</th></tr></thead>
    <tbody>${rows.map(([k, b]) => `<tr>
      <td class="name">${esc(CATEGORIES[k] ? CATEGORIES[k].label : k)}</td>
      <td class="n">${b.n}</td><td class="n">${short(b.value)}</td>
      <td class="n${b.uncapped ? ' uncapped' : ''}">${b.uncapped || '—'}</td>
      <td class="n">${b.carved || '—'}</td>
    </tr>`).join('')}</tbody></table></div>
    ${issueList(c.regIssues)}`;

  $('progHint').textContent = `${c.prepared.lines.flatMap((l) => l.layers).length} layers`;
  $('progSummary').innerHTML = `<div class="scrollx"><table class="data">
    <thead><tr><th>Line</th><th>Layer</th><th class="n">Attaches</th><th class="n">Limit</th><th>Aggregate pool</th><th class="n">Premium</th></tr></thead>
    <tbody>${c.prepared.lines.flatMap((l) => l.layers.map((x) => `<tr>
      <td class="name">${esc(l.code)}</td>
      <td class="name">${esc(x.name)}${x.captive ? ' <span class="tag" style="font-size:10px; padding:1px 5px">captive</span>' : ''}</td>
      <td class="n">${x.attach > 0 ? short(x.attach) : 'ground up'}</td>
      <td class="n">${short(x.limit)}</td>
      <td class="name mono" style="font-size:11.5px">${esc(c.prepared.aggGroupIds[x.aggIdx])}</td>
      <td class="n">${x.premium ? short(x.premium) : '—'}</td>
    </tr>`)).join('')}</tbody></table></div>
    ${issueList(c.program.issues)}
    ${uncoveredNote(c)}`;
}

function uncoveredNote(c) {
  const missing = [...new Set(c.ledger.filter((u) => !u.covered).map((u) => u.peril))];
  if (!missing.length) return '';
  return `<p class="empty" style="margin-top:16px">
    <b style="color:var(--f5)">No line answers for:</b> ${missing.map((p) => esc(PERIL_META[p].label)).join(', ')}.
    Loss in these classes is retained in full from the first dollar.</p>`;
}

function issueList(issues) {
  if (!issues || !issues.length) return '';
  const shown = issues.slice(0, 12);
  return `<ul class="issues">${shown.map((i) => `<li>
    <span class="${i.level === 'error' ? 'err' : 'warn'}">${i.level === 'error' ? 'Dropped' : 'Check'}</span>
    <span class="dim mono">row ${i.line}</span> — ${esc(i.msg)}</li>`).join('')}
    ${issues.length > shown.length ? `<li class="dim">…and ${issues.length - shown.length} more.</li>` : ''}</ul>`;
}

function renderMethod(c) {
  const s = c.settings;
  const rows = CATEGORY_KEYS.filter((k) => c.contracts.some((x) => x.category === k)).map((k) => {
    const cat = CATEGORIES[k];
    const cells = PERILS.map((p) => {
      const line = coverageLine(k, p);
      return `<td class="n" title="${esc(PERIL_META[p].label)} routes to ${line === 'NONE' ? 'no policy line' : line}">
        ${(cat.freq[p] || 0).toFixed(4)}<br><span class="dim" style="font-size:11.5px">${short(cat.sev[p] || 0)}</span>
        <br><span class="mono" style="font-size:10.5px; color:${line === 'NONE' ? 'var(--f5)' : 'var(--ink-3)'}">${line === 'NONE' ? 'no cover' : line}</span></td>`;
    }).join('');
    return `<tr><td class="name">${esc(cat.label)}</td>${cells}</tr>`;
  }).join('');

  $('methodBody').innerHTML = `
    <p style="font-size:15px; color:var(--ink-2); max-width:74ch">
      Every contract is split into the five ways it can turn into money going out the door. Each gets the
      ceiling that actually applies — the general cap, a carve-out supercap, or none at all where the class
      escapes the cap. Gross negligence is treated as uncapped whether the contract says so or not, because
      no cap survives it. Each class is then routed to the policy line that answers for it, or to no line.
    </p>
    <p style="font-size:15px; color:var(--ink-2); max-width:74ch">
      The whole book is simulated together for ${count(s.trials)} years. Claim counts are Poisson, severities
      lognormal with a coefficient of variation of ${s.severityCV}, both scaled sub-linearly with annual
      contract value. Within each simulated year losses are allocated up the tower layer by layer and shared
      aggregates erode as they are used — so a claim on one contract reduces the limit standing behind every
      other contract in the same pool. Uncapped classes are truncated at ${short(s.uncappedTruncation)} so the
      mean stays finite. The seed is <span class="mono">${s.seed}</span>: the same inputs return the same
      figures on any machine, at any time.
    </p>

    <h3 style="font-size:17px; margin:26px 0 6px">The assumption set</h3>
    <p style="font-size:13.5px; color:var(--ink-3); margin-bottom:14px; max-width:74ch">
      Expected claims a year for a contract carrying $1M of annual value, with the median claim beneath it and
      the policy line that answers. <b>These are a starting position for argument, not a finding.</b>
      Replace them from your own loss history in the assumptions panel.
    </p>
    <div class="scrollx"><table class="data">
      <thead><tr><th>Category</th>${PERILS.map((p) => `<th class="n">${esc(PERIL_META[p].label)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>

    <h3 style="font-size:17px; margin:26px 0 6px">Not modelled</h3>
    <p style="font-size:14.5px; color:var(--ink-2); max-width:74ch; margin-bottom:0">
      Coverage disputes and reservations of rights. Defence costs inside versus outside the limit. Claims-made
      triggers and retroactive dates. Reinstatements. Deductible corridors. Currency. The time value of money on
      a funded retention. Each of these moves the answer, and each is a reason this is an operational model for
      structuring a conversation with the broker and the actuary rather than an actuarial opinion.
    </p>`;
}

/* -------------------------------------------------------------- levers --- */

function leverSettings() {
  // Levers are compared against the base run, so they must not be attributed.
  return state.settings;
}

async function priceStandardLevers() {
  if (!state.ctx || state.leversDone) return;
  state.leversDone = true;
  const token = ++leverToken;

  const { contracts, prepared } = state.ctx;
  const s = leverSettings();

  // A lever may only lower a ceiling. Taking the minimum against what the
  // contract already says keeps a "fix" from accidentally buying exposure.
  const tighten = (map, contract, index, peril, proposed) => {
    const current = ceilingFor(contract, peril);
    const next = Math.min(current, proposed);
    if (next < current) map.set(`${index}|${peril}`, next);
  };

  const capUncapped = new Map();
  contracts.forEach((c, i) => {
    if (isFinite(c.cap)) return;
    PERILS.forEach((p) => { if (p !== 'GROSS') tighten(capUncapped, c, i, p, c.annualValue * 2); });
  });

  const supercapTop = new Map();
  state.ctx.ranked.slice(0, 10).forEach((r) => {
    const c = contracts[r.index];
    PERILS.forEach((p) => { if (p !== 'GROSS') tighten(supercapTop, c, r.index, p, c.annualValue * 3); });
  });

  const supercapAll = new Map();
  contracts.forEach((c, i) => {
    PERILS.forEach((p) => { if (p !== 'GROSS') tighten(supercapAll, c, i, p, c.annualValue * 5); });
  });

  const defs = [
    capUncapped.size ? {
      key: 'cap-uncapped',
      label: `Cap the ${contracts.filter((c) => !isFinite(c.cap)).length} uncapped contracts at 2× annual value`,
      cost: 0, overrides: capUncapped,
      note: 'A redline at renewal. No premium.',
    } : null,
    supercapTop.size ? {
      key: 'top-ten',
      label: 'Convert every carve-out on the top ten to a 3× supercap',
      cost: 0, overrides: supercapTop,
      note: 'Ten conversations, not four hundred.',
    } : null,
    supercapAll.size ? {
      key: 'book-wide',
      label: 'Convert every uncapped carve-out in the book to a 5× supercap',
      cost: 0, overrides: supercapAll,
      note: 'The full playbook change, applied everywhere.',
    } : null,
  ].filter(Boolean);

  state.leversPending = defs.length;
  renderLeverTable();

  for (const d of defs) {
    await nextFrame();
    if (token !== leverToken) return; // a new run started; abandon this one
    const r = simulate(withCeilings(prepared, d.overrides), s);
    state.levers.push({ key: d.key, label: d.label, cost: d.cost, note: d.note, mean: r.retained.mean, p99: r.retained.p99 });
    state.leversPending--;
    renderLeverTable();
  }
  state.leversPending = 0;
  renderLeverTable();
}

function renderLeverTable() {
  if (!state.ctx) return;
  const base = state.ctx.result;
  const rows = state.levers.map((lv) => {
    const removed = base.retained.p99 - lv.p99;
    const meanDelta = base.retained.mean - lv.mean;
    const ratio = removed > 0 && lv.cost > 0 ? lv.cost / removed : null;
    return `<tr>
      <td class="name">${esc(lv.label)}<br><span class="dim" style="font-size:12.5px">${esc(lv.note || '')}</span></td>
      <td class="n">${lv.cost > 0 ? short(lv.cost) : '<span class="free">redline only</span>'}</td>
      <td class="n">${short(lv.mean)}<br><span class="dim" style="font-size:12px">${meanDelta > 0 ? `−${short(meanDelta)}` : '—'}</span></td>
      <td class="n">${short(lv.p99)}</td>
      <td class="n ${removed > 0 ? 'good' : ''}">${removed > 0 ? short(removed) : 'none'}</td>
      <td class="n">${ratio !== null ? `${ratio.toFixed(3)}` : removed > 0 && lv.cost === 0 ? '<span class="free">free</span>' : '—'}</td>
    </tr>`;
  }).join('');

  $('leverTable').innerHTML = `<table class="data">
    <thead><tr>
      <th>Lever</th><th class="n">Annual cost</th><th class="n">Expected retained</th>
      <th class="n">1-in-100 retained</th><th class="n">Tail removed</th><th class="n">Cost per $ removed</th>
    </tr></thead>
    <tbody>
      <tr>
        <td class="name"><b>Base run — the book as it stands</b></td>
        <td class="n">—</td>
        <td class="n">${short(base.retained.mean)}</td>
        <td class="n">${short(base.retained.p99)}</td>
        <td class="n">—</td><td class="n">—</td>
      </tr>
      ${rows}
      ${state.leversPending > 0 ? `<tr><td colspan="6" class="empty" style="padding:14px 0">Pricing ${state.leversPending} more lever${state.leversPending === 1 ? '' : 's'}…</td></tr>` : ''}
      ${!rows && !state.leversPending ? '<tr><td colspan="6" class="empty" style="padding:14px 0">No standard lever applies to this book — every contract is already capped.</td></tr>' : ''}
    </tbody></table>`;

  renderLeverInsight();
}

/**
 * The comparison worth making out loud: how much of a book-wide playbook change
 * is already bought by fixing ten contracts. When most of it is, the work stops
 * being a policy project and becomes a short list of phone calls.
 */
function renderLeverInsight() {
  const el = $('leverInsight');
  if (!el || !state.ctx) return;
  const base = state.ctx.result.retained.p99;
  const top = state.levers.find((l) => l.key === 'top-ten');
  const all = state.levers.find((l) => l.key === 'book-wide');
  if (!top || !all) { el.hidden = true; return; }

  const topRemoved = base - top.p99;
  const allRemoved = base - all.p99;
  if (!(allRemoved > 0) || !(topRemoved > 0)) { el.hidden = true; return; }

  const share = topRemoved / allRemoved;
  el.hidden = false;
  el.innerHTML = share >= 0.6
    ? `Reopening <b>ten contracts</b> removes ${short(topRemoved)} of one-in-a-hundred exposure.
       Rewriting the carve-out language across all ${count(state.ctx.contracts.length)} removes ${short(allRemoved)} —
       only ${short(allRemoved - topRemoved)} more. <b>${pct(share, 0)} of a book-wide playbook change is already
       bought by the ten names in the queue above</b>, and neither version costs a dollar of premium.`
    : `Reopening the top ten removes ${short(topRemoved)} of one-in-a-hundred exposure, against ${short(allRemoved)}
       for the book-wide change — ${pct(share, 0)} of it. The exposure is spread widely enough here that the
       playbook change is worth doing properly rather than contract by contract.`;
}

function populateLineSelect() {
  if (!state.ctx) return;
  const sel = $('lvLine');
  const codes = [...new Set([...state.ctx.prepared.lines.map((l) => l.code), 'GL', 'PROF', 'CYBER'])];
  sel.innerHTML = codes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

async function addCandidateLayer() {
  if (!state.ctx) return;
  const lineCode = $('lvLine').value;
  const attachment = money($('lvAttach').value);
  const limit = money($('lvLimit').value);
  const premium = money($('lvPremium').value) || 0;
  if (!isFinite(limit) || limit <= 0) { alert('The limit needs to be a number — 25M, 25000000, or 25,000,000.'); return; }
  const attach = isFinite(attachment) ? attachment : 0;

  busy(true, 'Pricing the candidate layer…');
  await nextFrame();
  const r = simulate(withLayers(state.ctx.prepared, [{
    lineCode, attachment: attach, limit, aggregate: limit, premium, name: 'candidate',
  }]), leverSettings());
  state.levers.push({
    label: `Buy ${short(limit)}${attach > 0 ? ` excess of ${short(attach)}` : ' primary'} on ${lineCode}`,
    cost: premium,
    note: 'Candidate layer priced against the base run.',
    mean: r.retained.mean,
    p99: r.retained.p99,
  });
  renderLeverTable();
  busy(false);
}

/* --------------------------------------------------------- calibration --- */

/**
 * Fit frequency and severity per category and peril from a pasted loss history.
 * Frequency comes from claim counts over the register's own exposure base;
 * severity from the log-moments of the amounts, de-scaled by the mean contract
 * size in that category so the result plugs back into the same scaling law.
 */
function calibrate(text, years) {
  const rows = String(text || '').trim().split(/\r?\n/).map((l) => l.split(',').map((s) => s.trim())).filter((r) => r.length >= 3);
  if (!rows.length) return { error: 'No usable rows. Each line needs category,peril,amount.' };
  if (!(years > 0)) return { error: 'Years of history must be at least 1.' };
  if (!state.ctx) return { error: 'Load a register first.' };

  const buckets = {};
  let skipped = 0;
  rows.forEach((r) => {
    const cat = String(r[0]).toUpperCase().replace(/[\s-]+/g, '_');
    const peril = String(r[1]).toUpperCase();
    const amt = money(r[2]);
    if (!CATEGORIES[cat] || !PERILS.includes(peril) || !isFinite(amt) || amt <= 0) { skipped++; return; }
    (buckets[`${cat}|${peril}`] ||= []).push(amt);
  });
  if (!Object.keys(buckets).length) return { error: `None of the ${rows.length} rows matched a known category and peril.` };

  const fe = state.settings.freqExponent;
  const se = state.settings.sevExponent;
  const exposure = {};
  const sevScale = {};
  CATEGORY_KEYS.forEach((k) => {
    const cs = state.ctx.contracts.filter((c) => c.category === k);
    exposure[k] = cs.reduce((s, c) => s + Math.pow(Math.max(c.annualValue, 50e3) / 1e6, fe), 0);
    sevScale[k] = cs.length
      ? cs.reduce((s, c) => s + Math.pow(Math.max(c.annualValue, 50e3) / 1e6, se), 0) / cs.length
      : 1;
  });

  const overrides = {};
  const fitted = [];
  const freqOnly = [];
  Object.entries(buckets).forEach(([key, amounts]) => {
    const [cat, peril] = key.split('|');
    if (!exposure[cat]) return;
    const o = (overrides[cat] ||= { freq: {}, sev: {} });
    o.freq[peril] = amounts.length / years / exposure[cat];
    if (amounts.length >= 4) {
      const logs = amounts.map((a) => Math.log(a / Math.max(sevScale[cat], 1e-6)));
      const mu = logs.reduce((s, v) => s + v, 0) / logs.length;
      o.sev[peril] = Math.exp(mu);
      fitted.push(`${cat}/${peril}`);
    } else {
      freqOnly.push(`${cat}/${peril}`);
    }
  });

  if (!Object.keys(overrides).length) return { error: 'No category had both losses and contracts in the register.' };

  const total = Object.values(buckets).reduce((s, a) => s + a.length, 0);
  const note = `${total} claims over ${years} years · frequency fitted for ${fitted.length + freqOnly.length} class${fitted.length + freqOnly.length === 1 ? '' : 'es'}, severity for ${fitted.length}${skipped ? ` · ${skipped} rows skipped` : ''}`;
  return { overrides, note, fitted, freqOnly, skipped };
}

/** Apply calibration by rewriting the assumption tables the model reads. */
function applyOverrides(overrides) {
  CATEGORY_KEYS.forEach((k) => {
    const cat = CATEGORIES[k];
    if (!cat.__orig) cat.__orig = { freq: { ...cat.freq }, sev: { ...cat.sev } };
    cat.freq = { ...cat.__orig.freq };
    cat.sev = { ...cat.__orig.sev };
  });
  if (!overrides) return;
  Object.entries(overrides).forEach(([k, o]) => {
    const cat = CATEGORIES[k];
    if (!cat) return;
    Object.entries(o.freq || {}).forEach(([p, v]) => { cat.freq[p] = v; });
    Object.entries(o.sev || {}).forEach(([p, v]) => { cat.sev[p] = v; });
  });
}

/* --------------------------------------------------------------- wiring -- */

function openSheet(id) { $(id).showModal(); }

function wire() {
  $('btn-data').addEventListener('click', () => {
    $('regText').value = state.registerCSV;
    $('progText').value = state.programCSV;
    $('dataNote').textContent = state.isSample ? SAMPLE_NOTE : 'Your data is loaded. It has not left this browser.';
    openSheet('dataSheet');
  });

  $('btn-assume').addEventListener('click', () => {
    const s = state.settings;
    $('setTrials').value = s.trials;
    $('setSeed').value = s.seed;
    $('setCV').value = s.severityCV;
    $('setLoad').value = s.frequencyLoad;
    $('setTrunc').value = short(s.uncappedTruncation);
    $('setFreqExp').value = s.freqExponent;
    $('calNote').textContent = state.calibrationNote || '';
    openSheet('assumeSheet');
  });

  $('btn-export').addEventListener('click', () => {
    $('expNote').textContent = state.ctx
      ? `Seed ${state.ctx.settings.seed} · ${count(state.ctx.result.trials)} simulated years`
      : '';
    openSheet('exportSheet');
  });

  const readFile = (input, target) => {
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => { $(target).value = String(fr.result || ''); };
      fr.readAsText(f);
    });
  };
  readFile($('regFile'), 'regText');
  readFile($('progFile'), 'progText');

  $('btnSample').addEventListener('click', (e) => {
    e.preventDefault();
    $('regText').value = sampleRegisterCSV();
    $('progText').value = SAMPLE_PROGRAM_CSV;
  });

  $('btnApplyData').addEventListener('click', async (e) => {
    e.preventDefault();
    const reg = $('regText').value.trim();
    const prog = $('progText').value.trim();
    if (!reg) { alert('The contract register is empty.'); return; }
    state.isSample = reg === sampleRegisterCSV() && prog === SAMPLE_PROGRAM_CSV;
    state.registerCSV = reg;
    state.programCSV = prog || SAMPLE_PROGRAM_CSV;
    $('dataSheet').close();
    await run();
  });

  $('btnApplyAssume').addEventListener('click', async (e) => {
    e.preventDefault();
    const s = state.settings;
    s.trials = Math.min(200000, Math.max(1000, parseInt($('setTrials').value, 10) || s.trials));
    s.seed = parseInt($('setSeed').value, 10) || s.seed;
    s.severityCV = Math.min(6, Math.max(0.5, parseFloat($('setCV').value) || s.severityCV));
    s.frequencyLoad = Math.min(5, Math.max(0.1, parseFloat($('setLoad').value) || s.frequencyLoad));
    s.freqExponent = Math.min(1.5, Math.max(0, parseFloat($('setFreqExp').value)));
    const tr = money($('setTrunc').value);
    if (isFinite(tr) && tr > 0) s.uncappedTruncation = tr;
    $('assumeSheet').close();
    await run();
  });

  $('btnResetAssume').addEventListener('click', async (e) => {
    e.preventDefault();
    state.settings = { ...DEFAULT_SETTINGS, trials: 25000 };
    state.overrides = null;
    state.calibrationNote = '';
    applyOverrides(null);
    $('assumeSheet').close();
    await run();
  });

  $('btnCalibrate').addEventListener('click', async (e) => {
    e.preventDefault();
    const out = calibrate($('calText').value, parseInt($('calYears').value, 10));
    if (out.error) { $('calNote').innerHTML = `<span style="color:var(--f5)">${esc(out.error)}</span>`; return; }
    state.overrides = out.overrides;
    state.calibrationNote = out.note;
    applyOverrides(out.overrides);
    $('calNote').textContent = out.note;
    $('assumeSheet').close();
    await run();
  });

  $('lvAdd').addEventListener('click', (e) => { e.preventDefault(); addCandidateLayer(); });

  const exp = (id, fn, name, mime = 'text/csv;charset=utf-8') => {
    $(id).addEventListener('click', (e) => {
      e.preventDefault();
      if (!state.ctx) return;
      download(name, fn(state.ctx), mime);
    });
  };
  exp('expMemo', (c) => boardMemo({ ...c, levers: state.levers }), `retained-contractual-exposure-${today()}.md`, 'text/markdown;charset=utf-8');
  exp('expContracts', (c) => contractCSV(c.contracts, c.result, c.ranked), `contract-exposure-${today()}.csv`);
  exp('expFindings', (c) => findingsCSV(c.findings), `findings-${today()}.csv`);
  exp('expAgg', (c) => aggregateCSV(c.result), `aggregate-erosion-${today()}.csv`);
  exp('expCurve', (c) => exceedanceCSV(c.result), `exceedance-curve-${today()}.csv`);

  // Sub-navigation highlight.
  const links = [...document.querySelectorAll('.subnav a')];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-100px 0px -70% 0px' });
  document.querySelectorAll('main .tsec').forEach((s) => io.observe(s));
}

wire();
run();
