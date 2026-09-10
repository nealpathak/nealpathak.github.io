import { generatePortfolio, analysePortfolio, route, MATTER_TYPES, FIRMS } from './engine.mjs';
import { ENTITIES } from '../../data/book.mjs';
import { fmt } from '../../lib/format.mjs';
import { $, table, readParams, bindOutputs, escapeHtml } from '../../lib/dom.mjs';
import { barChart, CH } from '../../lib/svg.mjs';

const P = generatePortfolio();
const A = analysePortfolio(P);
const firmName = id => FIRMS.find(f => f.id === id).name;
const entityName = code => ENTITIES.find(e => e.code === code)?.name || code;
const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

// finding
const worstFirm = A.firms[0];
const overSum = A.overBudget.reduce((s, b) => s + b.overrun, 0);
$('#finding').innerHTML = `
  <p>${A.overBudget.length} open matters are projected to exceed budget by ${fmt.money(overSum, { compact: true })} between them, ${fmt.pct(overSum / A.totals.budgetOpen)} of the open budget. ${A.overBudget[0] ? `The largest is ${A.overBudget[0].typeName.toLowerCase()} matter ${A.overBudget[0].id}, in ${A.overBudget[0].stage.toLowerCase()} with ${firmName(A.overBudget[0].handling)}, projected at ${fmt.money(A.overBudget[0].projected, { compact: true })} against ${fmt.money(A.overBudget[0].budget, { compact: true })}.` : ''}</p>
  <p>${worstFirm.name} has billed ${fmt.money(worstFirm.overGuideline, { compact: true })} above guideline rates, ${fmt.pct(worstFirm.overShare, 1)} of everything it has invoiced, and ${fmt.pct(worstFirm.vagueShare)} of its billing carries a description that would fail the guidelines. That is the number to open the rate conversation with.</p>`;
$('#stats').innerHTML =
  stat(String(A.totals.open), 'Open matters', `${A.totals.closed} closed; ${fmt.money(A.totals.exposure, { compact: true })} open exposure`) +
  stat(fmt.money(A.totals.projectedOpen, { compact: true }), 'Projected outside spend, open', `against ${fmt.money(A.totals.budgetOpen, { compact: true })} budgeted`, A.totals.projectedOpen > A.totals.budgetOpen ? 'accent' : '') +
  stat(fmt.money(A.totalOver, { compact: true }), 'Billed above guideline', `${fmt.pct(A.totalOver / A.totalBilled, 1)} of ${fmt.money(A.totalBilled, { compact: true })}`) +
  stat(String(A.stuck.length), 'Stalled matters', 'beyond the 90th percentile for their stage', A.stuck.length ? 'accent' : '');

// over budget
$('#overbudget').innerHTML = table([
  { key: 'id', label: 'Matter', class: 'mono' },
  { key: 'typeName', label: 'Type' },
  { key: 'entity', label: 'Entity', render: v => entityName(v) },
  { key: 'handling', label: 'Counsel', render: v => firmName(v) },
  { key: 'stage', label: 'Stage' },
  { key: 'billed', label: 'Billed', num: true, render: v => fmt.money(v) },
  { key: 'budget', label: 'Budget', num: true, render: v => fmt.money(v) },
  { key: 'projected', label: 'Projected', num: true, render: v => `<strong>${fmt.money(v)}</strong>` },
  { key: 'overrun', label: 'Overrun', num: true, render: (v, r) => `${fmt.money(v)} <span class="muted small">${fmt.pct(r.overrunPct)}</span>` },
], A.overBudget.map(b => ({ ...b, _class: b.overrunPct > 0.5 ? 'flag' : '' })), { caption: `${A.overBudget.length} open matters projected over budget, largest overrun first` });

// firms
$('#firm-chart').innerHTML = barChart({ items: A.firms.map(f => ({ label: f.name, value: f.overShare, color: f.overShare > 0.05 ? CH.accent : CH.ink })), valueFormat: v => fmt.pct(v, 1), max: Math.max(...A.firms.map(f => f.overShare)) * 1.3, title: 'Share of billing above guideline rates by firm' }) + '<figcaption>Amount billed above guideline rates as a share of each firm\'s total billing.</figcaption>';
$('#firms').innerHTML = table([
  { key: 'name', label: 'Firm' },
  { key: 'matters', label: 'Matters', num: true },
  { key: 'billed', label: 'Billed', num: true, render: v => fmt.money(v) },
  { key: 'blendedRate', label: 'Blended rate', num: true, render: v => '$' + fmt.num(v) + '/h' },
  { key: 'overGuideline', label: 'Above guideline', num: true, render: (v, r) => `${fmt.money(v)} <span class="muted small">${fmt.pct(r.overShare, 1)}</span>` },
  { key: 'vagueAmount', label: 'Vague descriptions', num: true, render: (v, r) => `${fmt.money(v)} <span class="muted small">${fmt.pct(r.vagueShare)}</span>` },
  { key: 'blockAmount', label: 'Block-billed', num: true, render: v => fmt.money(v) },
], A.firms.map(f => ({ ...f, _class: f.overShare > 0.05 ? 'flag' : '' })), { caption: 'Panel firms, three years of invoices' });

// intake
$('#type').innerHTML = Object.entries(MATTER_TYPES).map(([k, t]) => `<option value="${k}" ${k === 'premises' ? 'selected' : ''}>${t.name}</option>`).join('');
$('#entity').innerHTML = ENTITIES.map(e => `<option value="${e.code}">${e.name}</option>`).join('');
const intake = $('#intake');
bindOutputs(intake);
intake.addEventListener('input', renderIntake);
renderIntake();
function renderIntake() {
  const p = readParams(intake);
  const r = route({ type: p.type, exposure: p.exposure, suit: p.suit, entity: p.entity, regulatory: p.regulatory });
  $('#routing').innerHTML = `
    <div class="decision"><p class="kicker">Decision</p><div class="value">${escapeHtml(r.handlingName)}</div>
      <p class="note" style="margin-top:0.4rem">${r.budget ? `Opening budget ${fmt.money(r.budget)}. ` : ''}${r.line ? `Coverage line ${r.line}. ` : 'No insurance line; a business dispute. '}${r.notices.length ? `${r.notices.length} notice${r.notices.length === 1 ? '' : 's'} required.` : 'No notices required.'}</p></div>
    <p class="kicker" style="margin-top:1.2rem">Routing rules, in order</p>
    <ul class="trace">${r.trace.map(t => `<li class="${t.fired ? 'fired' : t.skipped ? 'skipped' : ''}"><span class="mono small muted">${t.id}</span> ${escapeHtml(t.text)}</li>`).join('')}</ul>
    <p class="kicker" style="margin-top:1.2rem">Notices triggered</p>
    ${r.notices.length ? `<ul class="trace">${r.notices.map(n => `<li class="fired"><span class="mono small muted">${n.id}</span> ${escapeHtml(n.text)}</li>`).join('')}</ul>` : '<p class="note">None on these facts.</p>'}`;
}

// stuck + cycle
$('#stuck').innerHTML = A.stuck.length ? table([
  { key: 'id', label: 'Matter', class: 'mono' },
  { key: 'typeName', label: 'Type' },
  { key: 'entity', label: 'Entity', render: v => entityName(v) },
  { key: 'handling', label: 'Counsel', render: v => firmName(v) },
  { key: 'stage', label: 'Stage' },
  { key: 'daysInStage', label: 'Days in stage', num: true },
  { key: 'p90', label: '90th pct', num: true },
  { key: 'reserve', label: 'Reserve', num: true, render: v => fmt.money(v) },
], A.stuck.map(m => ({ ...m, _class: 'flag' })), { caption: `${A.stuck.length} stalled matters` }) : '<p class="note">No matter is beyond the 90th percentile for its stage.</p>';
$('#cycle').innerHTML = table([
  { key: 'name', label: 'Type' },
  { key: 'open', label: 'Open', num: true },
  { key: 'closed', label: 'Closed', num: true },
  { key: 'medianDaysToClose', label: 'Median days to close', num: true },
  { key: 'medianCost', label: 'Median outside cost', num: true, render: v => v ? fmt.money(v) : '—' },
  { key: 'stages', label: 'Stage medians (days), p90 in grey', render: v => v.map(s => `${escapeHtml(s.stage)} ${s.median ?? '—'}<span class="muted small"> / ${s.p90 ?? '—'}</span>`).join(' · ') },
], A.cycle, { caption: 'Cycle time by matter type' });
