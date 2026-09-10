// The board brief: one page assembled from every engine on the site, the way
// the risk section of a board pack should be produced: automatically, from
// the same numbers reserving and finance use, with the decisions up front.

import { snapshot, POLICY_YEARS, LINES, ENTITIES, policyYearLabel } from '../../data/book.mjs';
import { analyse } from '../loss-development/engine.mjs';
import { derivePaymentPattern, openingPosition, simulate, capitalForTolerance } from '../capital-model/engine.mjs';
import { generatePortfolio, analysePortfolio, FIRMS } from '../matter-portfolio/engine.mjs';
import { simulateDay, coverage, AGENTS, byId } from '../agent-control-plane/engine.mjs';
import { costOfRisk, allocate, subsidy } from '../tcor-allocation/engine.mjs';
import { generateContracts, analyseContracts, buyUpPlan } from '../contract-requirements/engine.mjs';
import { dates } from '../../lib/format.mjs';

export function buildBrief(book, { tolerance = 0.05, startingCapital = 9000000 } = {}) {
  const asOf = book.evaluationDate;
  const snap = snapshot(book);
  const prior30 = snapshot(book, dates.addDays(asOf, -30));
  const priorIds = new Set(prior30.map(c => c.id));
  const open = snap.filter(c => c.status !== 'Closed');
  const claims = {
    count: snap.length, open: open.length,
    incurred: snap.reduce((s, c) => s + c.incurred, 0), outstanding: snap.reduce((s, c) => s + c.outstanding, 0), paid: snap.reduce((s, c) => s + c.paid, 0),
    incurred30: snap.reduce((s, c) => s + c.incurred, 0) - prior30.reduce((s, c) => s + c.incurred, 0),
    new30: snap.filter(c => !priorIds.has(c.id)).length,
    closed30: snap.filter(c => c.status === 'Closed' && priorIds.has(c.id) && prior30.find(p => p.id === c.id).status !== 'Closed').length,
    largeOpen: open.filter(c => c.incurred >= 150000).sort((a, b) => b.incurred - a.incurred).slice(0, 5),
    litigatedOpen: open.filter(c => c.litigated).length,
  };

  const dev = analyse(book);
  const currentPy = POLICY_YEARS[POLICY_YEARS.length - 1];
  const erosion = Object.keys(LINES).map(lc => {
    const yrs = dev.perLine[lc].years;
    return { line: lc, name: LINES[lc].name, current: yrs.find(y => y.py === currentPy), prior: yrs.find(y => y.py === currentPy - 1), breaches: yrs.filter(y => y.excess > 0), near: yrs.filter(y => y.excess === 0 && y.erodedUlt >= 0.9) };
  });

  const pat = derivePaymentPattern(book);
  const opening = openingPosition(book);
  const capParams = { expectedLossRatio: opening.expectedLossRatio, startingCapital, sims: 1500 };
  const cap = simulate(capParams, opening, pat);
  const need = capitalForTolerance({ ...capParams, sims: 600 }, opening, pat, tolerance);
  const noAgg = simulate({ ...capParams, aggregate: false }, opening, pat);

  const portfolio = generatePortfolio();
  const legal = analysePortfolio(portfolio);

  const fleet = simulateDay();
  const cov = coverage();

  const cor = costOfRisk(book);
  const alloc = allocate(book, cor);
  const sub = subsidy(cor, alloc.window);

  const register = generateContracts();
  const contracts = analyseContracts(register);
  const plan = buyUpPlan(register, { budget: 100000 });

  // Decisions the committee is asked to take, derived from the numbers.
  const decisions = [];
  for (const e of erosion) for (const y of e.breaches) decisions.push({ area: 'Renewal', text: `${e.name} ${policyYearLabel(y.py)} is projected to exceed its aggregate by ${money(y.excess)}. Confirm notice to the aggregate carrier and reflect the year in renewal pricing.`, amount: y.excess });
  if (cap.breachAny > tolerance && need.capital) decisions.push({ area: 'Capital', text: `The probability of breaching the capital requirement within three years is ${pct(cap.breachAny)}, above the ${pct(tolerance)} tolerance. Approve a capital contribution of ${money(need.capital - startingCapital)}, or record acceptance of the higher probability.`, amount: need.capital - startingCapital });
  if (noAgg.breachAny < cap.breachAny) decisions.push({ area: 'Reinsurance', text: `The aggregate stop-loss as priced raises the breach probability (${pct(noAgg.breachAny)} without it, ${pct(cap.breachAny)} with it): it costs more certain capital than it protects. Instruct the broker to re-quote at a lower attachment or lower price before binding.`, amount: null });
  if (legal.overBudget.length) decisions.push({ area: 'Legal spend', text: `${legal.overBudget.length} open matters are projected to exceed budget by ${money(legal.overBudget.reduce((s, b) => s + b.overrun, 0))} combined. Approve revised budgets or instruct counsel on strategy for the three largest.`, amount: legal.overBudget.reduce((s, b) => s + b.overrun, 0) });
  const worstFirm = legal.firms[0];
  if (worstFirm && worstFirm.overShare > 0.05) decisions.push({ area: 'Outside counsel', text: `${worstFirm.name} has billed ${money(worstFirm.overGuideline)} above guideline rates (${pct(worstFirm.overShare)} of its invoicing). Authorise a rate conversation with the lines attached, and a hold on new assignments until resolved.`, amount: worstFirm.overGuideline });
  if (alloc.moved > 0) decisions.push({ area: 'Premium allocation', text: `Approve the ${policyYearLabel(alloc.nextPy)} premium allocation: ${money(alloc.moved)} moves between operating companies on experience, with no entity moving more than ${pct(alloc.params.cap)} from its exposure-based share.`, amount: alloc.moved });
  if (plan.steps.length) decisions.push({ area: 'Contracts', text: `${contracts.atRisk.length} live contracts worth ${money(contracts.valueAtRisk)} a year require insurance the programme does not carry. Approve ${plan.steps[0].name.toLowerCase()} at ${money(plan.steps[0].cost)} a year, which clears ${money(plan.steps[0].clears)} of that, and refer the ${contracts.uncapped.length} uncapped indemnities to counsel.`, amount: plan.steps[0].cost });
  if (cov.gaps.length) decisions.push({ area: 'AI governance', text: `${cov.gaps.map(g => `${byId(g.agent).name} lacks ${g.control.toLowerCase()}`).join('; ')}. Note that ${cov.gaps.length === 1 ? 'it remains' : 'they remain'} in pilot until the control passes; no decision required.`, amount: null });

  return { asOf, claims, dev, erosion, cap, need, noAgg, tolerance, startingCapital, opening, legal, fleet, cov, cor, alloc, sub, contracts, plan, decisions, currentPy };
}

function money(v) { const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'm' : Math.round(a / 1e3) + 'k'; return (v < 0 ? '−' : '') + '$' + s; }
function pct(v) { return (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%'; }
