// Everything the page computes from the synthetic book, as plain data the
// page can render. Runs in a worker when the browser allows it, on the main
// thread otherwise, and in the tests. Nothing here touches the DOM.

import { generateBook, snapshot, ENTITIES, LINES, exposureFor } from '../data/book.mjs';
import { buildRawLossRun, runPipeline } from '../engines/loss-run-pipeline/engine.mjs';
import { analyse } from '../engines/loss-development/engine.mjs';
import { derivePaymentPattern, openingPosition, simulate, capitalForTolerance, DEFAULTS as CAP } from '../engines/capital-model/engine.mjs';
import { costOfRisk, allocate, subsidy } from '../engines/tcor-allocation/engine.mjs';
import { generateContracts, analyseContracts, certificate } from '../engines/contract-requirements/engine.mjs';
import { RENEWAL, ADJUSTER_NOTES, QUOTES } from './data.mjs';

const PRIOR_DAY = '2026-08-30';

export function computeArtifacts() {
  const book = generateBook();
  const snap = snapshot(book);
  const open = snap.filter(c => c.status !== 'Closed');

  // 1. Exposure schedule.
  const exposure = ENTITIES.map(e => ({ code: e.code, name: e.name, payroll: exposureFor(e.code, 'WC', RENEWAL.policyYear) * 1e6, revenue: exposureFor(e.code, 'GL', RENEWAL.policyYear) * 1e6, vehicles: Math.round(exposureFor(e.code, 'AL', RENEWAL.policyYear)) }));

  // 2. Pipeline.
  const raw = buildRawLossRun(book);
  const out = runPipeline(raw.text, { prior: snapshot(book, PRIOR_DAY), asOf: book.evaluationDate, priorAsOf: PRIOR_DAY });
  const blocks = out.exceptions.filter(e => e.severity === 'block').length;
  const pipeline = {
    rows: out.steps[0].counts.rows, quarantined: out.quarantined.length, blocks, warns: out.exceptions.length - blocks, gate: out.gate, totals: out.totals, exceptionsTotal: out.exceptions.length,
    exceptions: out.exceptions.slice().sort((a, b) => (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1) || a.rule.localeCompare(b.rule)).slice(0, 14).map(e => ({ severity: e.severity, rule: e.rule, claimId: e.claimId, row: e.row, detail: e.detail, action: e.action })),
  };

  // 3. Development and capital.
  const d = analyse(book);
  const dev = {
    totals: d.totals, backtest: { mature: d.backtest.matureError, green: d.backtest.greenError },
    breaches: d.breaches.map(y => ({ line: y.line, py: y.py, excess: y.excess, erodedUlt: y.erodedUlt })),
    perLine: Object.fromEntries(Object.keys(LINES).map(lc => [lc, d.perLine[lc].years.map(y => ({ py: y.py, age: y.age, selected: y.selected, aggregate: y.aggregate, erodedUlt: y.erodedUlt, excess: y.excess }))])),
  };
  const op = openingPosition(book), pat = derivePaymentPattern(book);
  const capBase = { ...CAP, expectedLossRatio: op.expectedLossRatio, startingCapital: RENEWAL.startingCapital, sims: 2000 };
  const s = simulate(capBase, op, pat);
  const need = capitalForTolerance(capBase, op, pat, RENEWAL.tolerance);
  const capital = { breachAny: s.breachAny, need: need.capital, ratio: { p5: s.ratio.p5, p25: s.ratio.p25, p50: s.ratio.p50, p75: s.ratio.p75, p95: s.ratio.p95 }, params: { lossRatioCv: capBase.lossRatioCv, requiredPremiumFactor: capBase.requiredPremiumFactor, requiredReserveFactor: capBase.requiredReserveFactor, horizonQuarters: capBase.horizonQuarters } };

  // 4. Allocation.
  const cor = costOfRisk(book); const al = allocate(book, cor); const sub = subsidy(cor, al.window);
  const alloc = { total: al.total, moved: al.moved, nextPy: al.nextPy, window: al.window, params: { cap: al.params.cap, credibilityK: al.params.credibilityK }, byEntity: al.byEntity.map(e => ({ entity: e.entity, name: e.name, exposureBased: e.exposureBased, allocated: e.allocated, change: e.change, changePct: e.changePct, claims: e.claims, lossRatio: sub.find(x => x.entity === e.entity).lossRatio })) };

  // 5. Large claims and the notes behind them.
  const large = open.filter(c => c.incurred >= 250000).sort((a, b) => b.incurred - a.incurred);
  const notes = ADJUSTER_NOTES.map(n => { const c = snap.find(x => x.id === n.id); return { id: n.id, entity: c.entity, incurred: c.incurred, notes: n.notes }; });

  // 7. Certificates.
  const reg = generateContracts(); const ac = analyseContracts(reg);
  const holders = ac.rows.filter(r => r.holder);
  const sample = holders.find(r => r.atRisk) || holders[0];
  const cert = certificate(sample);
  const contracts = { live: ac.rows.length, holders: holders.length, holdersAtRisk: holders.filter(r => r.atRisk).length, atRisk: ac.atRisk.length, valueAtRisk: ac.valueAtRisk, uncapped: ac.uncapped.length, cert: { insured: cert.insured, holder: cert.holder, contract: cert.contract, type: cert.type, coverages: cert.coverages } };

  const claims = { count: snap.length, open: open.length, litigated: open.filter(c => c.litigated).length };

  return { exposure, pipeline, dev, capital, alloc, large: large.map(c => ({ id: c.id, py: c.py, line: c.line, entity: c.entity, incurred: c.incurred })), notes, contracts, claims, _ctx: { op, pat, capBase, premium: al.total } };
}

// Price the three quotes and the no-cover option. Separate because it is the
// slow part: four bisection searches over simulated paths.
export function priceQuotes(ctx) {
  const { op, pat, capBase, premium } = ctx;
  const options = [{ id: 'none', name: 'No cover', over: { aggregate: false }, cost: 0, attach: null }, ...QUOTES.map(q => ({ id: q.id, name: q.market, over: { aggregateAttach: q.attach, aggregateCost: q.cost }, cost: q.cost, attach: q.attach }))];
  return options.map(o => {
    const p = { ...capBase, ...o.over };
    const s = simulate(p, op, pat); const n = capitalForTolerance(p, op, pat, RENEWAL.tolerance);
    const contribution = n.capital === null ? null : Math.max(0, n.capital - RENEWAL.startingCapital);
    const prem = premium * o.cost;
    return { id: o.id, name: o.name, attach: o.attach, breach: s.breachAny, contribution, premium: prem, annual: contribution === null ? null : prem + 0.1 * contribution };
  });
}
