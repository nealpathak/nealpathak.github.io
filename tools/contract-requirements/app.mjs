import { generateContracts, analyseContracts, buyUpPlan, certificate } from './engine.mjs';
import { ENTITIES } from '../../data/book.mjs';
import { fmt } from '../../lib/format.mjs';
import { $, table, readParams, bindOutputs, escapeHtml } from '../../lib/dom.mjs';
import { barChart, CH } from '../../lib/svg.mjs';

const R = generateContracts();
const A = analyseContracts(R);
const name = code => ENTITIES.find(e => e.code === code).name;
const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const lim = v => v === 'Statutory' ? v : v ? fmt.money(v, { compact: true }) : '—';

const controls = $('#controls');
$('#contract').innerHTML = A.rows.slice().sort((a, b) => b.value - a.value).map(c => `<option value="${c.id}" ${c.id === A.atRisk[0]?.id ? 'selected' : ''}>${c.id} · ${escapeHtml(c.counterparty)} · ${fmt.money(c.value, { compact: true })}${c.atRisk ? ' · gap' : ''}</option>`).join('');
bindOutputs(controls);
controls.addEventListener('input', render);
render();

function render() {
  const p = readParams(controls);
  const plan = buyUpPlan(R, { budget: p.budget });
  const top = A.drivers[0];
  const first = plan.steps[0];
  $('#finding').innerHTML = `
    <p>${A.atRisk.length} of ${A.rows.length} live contracts, worth ${fmt.money(A.valueAtRisk, { compact: true })} a year (${fmt.pct(A.valueAtRisk / A.totalValue)} of contracted revenue), require insurance the programme does not carry. ${top ? `The largest single cause is ${top.label.toLowerCase()}: ${top.contracts} contracts worth ${fmt.money(top.value, { compact: true })} ask for more than the group has.` : ''}</p>
    <p>${first ? `${first.name} costs ${fmt.money(first.cost, { compact: true })} a year and clears ${fmt.money(first.clears, { compact: true })} of that on its own. ${plan.steps.length > 1 ? `The full plan spends ${fmt.money(plan.spent, { compact: true })} to clear ${fmt.money(plan.start - plan.remaining, { compact: true })}; ${plan.remaining > 0 ? `${fmt.money(plan.remaining, { compact: true })} remains behind requirements no buy-up on the card reaches, which is a conversation with the counterparty.` : 'nothing remains.'}` : ''}` : 'No buy-up inside the budget clears anything; the gaps are contract terms, not limits.'} ${A.uncapped.length} contracts carry an uncapped indemnity; those need a lawyer, not a broker.</p>`;
  $('#stats').innerHTML =
    stat(fmt.money(A.valueAtRisk, { compact: true }), 'Revenue behind unmet requirements', `${A.atRisk.length} contracts`, 'accent') +
    stat(first ? fmt.money(first.clears, { compact: true }) : '—', 'Cleared by the first buy-up', first ? `${first.name}, ${fmt.money(first.cost, { compact: true })} a year` : '') +
    stat(fmt.money(plan.spent, { compact: true }), 'Plan cost per year', `clears ${fmt.pct((plan.start - plan.remaining) / (plan.start || 1))} of the exposure`) +
    stat(String(A.uncapped.length), 'Uncapped indemnities', `${A.notice.length} need longer notice than the carrier gives`, A.uncapped.length ? 'accent' : '');

  $('#drivers-chart').innerHTML = barChart({ items: A.drivers.map(d => ({ label: d.label, value: d.value, color: CH.ink })), valueFormat: v => fmt.money(v, { compact: true }), title: 'Contract value by unmet requirement' }) + '<figcaption>Annual value of at-risk contracts by the requirement they fail. A contract failing two requirements counts in both.</figcaption>';
  $('#atrisk').innerHTML = table([
    { key: 'id', label: 'Contract', class: 'mono' },
    { key: 'counterparty', label: 'Counterparty' },
    { key: 'type', label: 'Type' },
    { key: 'entity', label: 'Company', render: v => name(v) },
    { key: 'value', label: 'Annual value', num: true, render: v => fmt.money(v) },
    { key: 'monthsLeft', label: 'Months left', num: true },
    { key: 'hard', label: 'Requirement not met', render: v => v.map(g => `${escapeHtml(g.label)}: ${g.have ? fmt.money(g.have, { compact: true }) : 'none'} carried, ${fmt.money(g.want, { compact: true })} required`).join('<br>') },
  ], A.atRisk.map(r => ({ ...r, _class: r.value >= 2000000 ? 'flag' : '' })), { caption: `${A.atRisk.length} contracts at risk, largest first` });

  $('#plan').innerHTML = plan.steps.length ? `<ol class="plan">${plan.steps.map((s, i) => `<li><strong>${escapeHtml(s.name)}</strong> for ${fmt.money(s.cost)} a year clears ${fmt.money(s.clears, { compact: true })} of contract value${i === 0 ? '' : ' beyond the previous step'}; ${fmt.money(s.remaining, { compact: true })} remains. <span class="muted small">${fmt.num(s.clears / s.cost, 0)} dollars of revenue cleared per dollar of premium</span></li>`).join('')}</ol>` : '<p class="note">Nothing on the rate card clears exposure inside this budget.</p>';

  const c = A.rows.find(r => r.id === p.contract) || A.atRisk[0];
  const cert = certificate(c);
  $('#certificate').innerHTML = `<div class="cert">
    <div class="head"><div><p class="kicker">Evidence of insurance · draft</p><strong>${escapeHtml(cert.insured)}</strong><br><span class="muted small">Named insured</span></div><div><p class="kicker">Certificate holder</p><strong>${escapeHtml(cert.holder)}</strong><br><span class="muted small">${escapeHtml(cert.type)} ${cert.contract}</span></div></div>
    ${table([
      { key: 'label', label: 'Coverage' },
      { key: 'limit', label: 'Limit carried', num: true, render: v => lim(v) },
      { key: 'required', label: 'Contract requires', num: true, render: v => v ? fmt.money(v, { compact: true }) : '—' },
      { key: 'extra', label: 'Endorsements' },
      { key: 'ok', label: '', render: v => v ? '' : '<span class="badge accent">Short</span>' },
    ], cert.coverages.map(x => ({ ...x, _class: x.ok ? '' : 'flag' })))}
    <p class="note">Notice of cancellation: ${cert.notice} days${cert.noticeRequired > cert.notice ? ` <span class="badge accent">contract asks ${cert.noticeRequired}</span>` : ''}. Coverages afforded are subject to the terms, exclusions and conditions of the policies.</p>
    <div class="verdict ${cert.satisfies ? '' : 'bad'}">${cert.satisfies ? 'This certificate satisfies the contract as written. Release to the holder.' : `This certificate does not satisfy the contract: ${cert.gaps.filter(g => g.kind !== 'indemnity').map(g => g.label.toLowerCase()).join('; ')}. Hold; resolve with the broker or the counterparty before release.`}</div>
  </div>`;

  const soft = A.rows.filter(r => r.soft.length).sort((a, b) => b.value - a.value);
  $('#soft').innerHTML = table([
    { key: 'id', label: 'Contract', class: 'mono' },
    { key: 'counterparty', label: 'Counterparty' },
    { key: 'entity', label: 'Company', render: v => name(v) },
    { key: 'value', label: 'Annual value', num: true, render: v => fmt.money(v) },
    { key: 'monthsLeft', label: 'Months left', num: true },
    { key: 'soft', label: 'Term', render: v => v.map(g => escapeHtml(g.label)).join(', ') },
  ], soft.map(r => ({ ...r, _class: r.soft.some(g => g.kind === 'indemnity') ? 'flag' : '' })), { caption: `${soft.length} contracts with terms to renegotiate` });
}
