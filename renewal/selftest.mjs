// Checks for the renewal page: the cost and time model, the demo material,
// and every figure the recorded model runs cite, recomputed from the engines.
// Run: node renewal/selftest.mjs
import { generateBook, snapshot, ENTITIES, exposureFor } from '../data/book.mjs';
import { analyse } from '../engines/loss-development/engine.mjs';
import { derivePaymentPattern, openingPosition, simulate, capitalForTolerance, DEFAULTS as CAP } from '../engines/capital-model/engine.mjs';
import { costOfRisk, allocate, subsidy } from '../engines/tcor-allocation/engine.mjs';
import { defaults, compute, STEPS, ROLES } from './model.mjs';
import { EXPOSURE_REPLIES, ADJUSTER_NOTES, QUOTES, RENEWAL } from './data.mjs';
import { RUNS } from './runs.mjs';
import { computeArtifacts, priceQuotes } from './compute.mjs';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); }
  else console.log(`  ok   ${name}`);
}

console.log('model');
const r = compute();
check('today takes longer than the pipeline', r.today.elapsedDays > r.ai.elapsedDays, `${r.today.elapsedDays} vs ${r.ai.elapsedDays}`);
check('today costs more than the pipeline', r.today.cost > r.ai.cost);
check('every step has both tracks and known roles', STEPS.every(s => ['today', 'ai'].every(t => Object.keys(s[t].hours).every(k => ROLES[k]))));
check('dependencies name real steps', STEPS.every(s => ['today', 'ai'].every(t => s[t].after.every(id => STEPS.some(x => x.id === id)))));
check('critical path is at least the longest chain', r.today.elapsedDays >= r.today.rows.reduce((m, x) => Math.max(m, x.end), 0));
check('waiting on markets and the board is inside the pipeline elapsed', r.waitingDays < r.ai.elapsedDays);
const a = defaults(); a.rates.rm = 300; const r2 = compute(a);
check('raising a rate raises both costs', r2.today.cost > r.today.cost && r2.ai.cost > r.ai.cost);
const a3 = defaults(); a3.floors.marketDays = 40; const r3 = compute(a3);
check('market floor extends both tracks equally', r3.today.elapsedDays - r.today.elapsedDays === 20 && r3.ai.elapsedDays - r.ai.elapsedDays === 20);
check('payback is finite on defaults', r.paybackCycles !== null && r.paybackCycles > 0 && r.paybackCycles < 10, String(r.paybackCycles));

console.log('data');
const book = generateBook();
check('book evaluates at the renewal data date', book.evaluationDate === RENEWAL.dataAsOf);
check('one exposure reply per operating company', ENTITIES.every(e => EXPOSURE_REPLIES.some(x => x.entity === e.code)) && EXPOSURE_REPLIES.length === ENTITIES.length);
const snap = snapshot(book);
for (const n of ADJUSTER_NOTES) {
  const c = snap.find(x => x.id === n.id);
  check(`adjuster notes ${n.id} match an open claim in the book`, c && c.status !== 'Closed' && c.incurred >= 250000, c ? `${c.status} ${c.incurred}` : 'missing');
}
const large = snap.filter(c => c.status !== 'Closed' && c.incurred >= 250000);
check('21 open claims at or above the retention, as the submission says', large.length === 21, String(large.length));
check('five of them are 2024-25 workers\' compensation', large.filter(c => c.py === 2024 && c.line === 'WC').length === 5);
check('notes cover the five largest', ADJUSTER_NOTES.every(n => large.slice().sort((x, y) => y.incurred - x.incurred).slice(0, 5).some(c => c.id === n.id)));
check('three quotes with distinct terms', QUOTES.length === 3 && new Set(QUOTES.map(q => q.attach)).size === 3);

console.log('recorded runs');
// Recompute every figure the runs cite.
const dev = analyse(book);
const op = openingPosition(book), pat = derivePaymentPattern(book);
const cor = costOfRisk(book); const al = allocate(book, cor); const sub = subsidy(cor, al.window);
const capBase = { ...CAP, expectedLossRatio: op.expectedLossRatio, startingCapital: RENEWAL.startingCapital, sims: 2000 };
const capFor = (over) => { const p = { ...capBase, ...over }; const s = simulate(p, op, pat); const n = capitalForTolerance(p, op, pat, RENEWAL.tolerance); return { breach: s.breachAny, contribution: Math.max(0, n.capital - RENEWAL.startingCapital) }; };
const quoteOpts = id => id === 'none' ? { aggregate: false } : { aggregateAttach: QUOTES.find(q => q.id === id).attach, aggregateCost: QUOTES.find(q => q.id === id).cost };
const capCache = {};
const cap = (id, cv) => { const k = id + (cv || ''); return capCache[k] ??= capFor({ ...quoteOpts(id), ...(cv ? { lossRatioCv: cv } : {}) }); };
const NEXT = al.nextPy;
function engineValue(key) {
  const p = key.split('.');
  switch (p[0]) {
    case 'exposure': return exposureFor(p[1], { payroll: 'WC', revenue: 'GL', vehicles: 'AL' }[p[2]], NEXT) * (p[2] === 'vehicles' ? 1 : 1e6);
    case 'alloc': if (p[1] === 'total') return al.total; { const e = al.byEntity.find(x => x.entity === p[1]); return e[p[2]]; }
    case 'subsidy': return sub.find(x => x.entity === p[1])[p[2]];
    case 'claim': return snap.find(c => c.id === p[1])[p[2]];
    case 'claims': return p[1] === 'count' ? snap.length : p[1] === 'open' ? snap.filter(c => c.status !== 'Closed').length : p[1] === 'largeOpen' ? large.length : snap.filter(c => c.status !== 'Closed' && c.litigated).length;
    case 'dev':
      if (p[1] === 'totals') return dev.totals[p[2]];
      if (p[1] === 'backtest') return dev.backtest.matureError;
      if (p[1] === 'breach') return dev.breaches.find(b => b.line === p[2] && b.py === Number(p[3])).excess;
      return dev.byPy.find(y => y.py === Number(p[1]))[p[2]];
    case 'quote': if (p[2] === 'premium') return al.total * QUOTES.find(q => q.id === p[1]).cost; { const cv = p[3] === 'cv25' ? 0.25 : p[3] === 'cv30' ? 0.30 : null; return cap(p[1], cv)[p[2]]; }
    case 'expectedLoss2026': return al.total * op.expectedLossRatio;
    default: throw new Error('unknown figure key ' + key);
  }
}
for (const run of RUNS) {
  const prompt = run.prompt();
  check(`${run.id}: prompt and output are non-trivial`, prompt.length > 500 && run.output.length > 500);
  for (const f of run.figures) {
    let v = engineValue(f.key);
    if (f.abs) v = Math.abs(v);
    const target = f.abs ? Math.abs(f.value) : f.value;
    const close = Math.abs(v - target) <= f.tol;
    const cited = (f.inPrompt ? prompt : run.output).includes(f.text);
    check(`${run.id}: ${f.key} = ${f.text}`, close && cited, `${close ? '' : `engine says ${v}`} ${cited ? '' : 'text not found'}`);
  }
}
console.log('page computation');
const art = computeArtifacts();
const { _ctx, ...plain } = art;
check('artifacts serialise as plain data for the worker', JSON.stringify(plain).length > 5000 && typeof structuredClone === 'function' && !!structuredClone(plain));
check('artifacts agree with the engines', plain.large.length === large.length && Math.abs(plain.alloc.total - al.total) < 1 && plain.pipeline.gate.held === true);
const priced = priceQuotes(_ctx);
check('quote pricing agrees with the recorded run', ['none', 'A', 'B', 'C'].every(id => Math.abs(priced.find(q => q.id === id).breach - cap(id).breach) < 1e-9));

check('every run names a step that exists', RUNS.every(x => STEPS.some(s => s.id === x.step)));
check('every run has a gate', RUNS.every(x => x.gate && x.gate.length > 40));

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all renewal checks passed');

// The static numbers in index.html (what a crawler sees before JavaScript runs)
// must match the model's defaults.
{
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
  const costText = v => '$' + Math.round(v / 1000).toLocaleString('en-US') + ',000';
  const wk = d => `${Math.round(d / 5)} weeks`;
  for (const [key, text] of [['today.weeks', wk(r.today.elapsedDays)], ['today.cost', costText(r.today.cost)], ['ai.weeks', wk(r.ai.elapsedDays)], ['ai.cost', costText(r.ai.cost)]]) {
    const m = html.match(new RegExp(`data-out="${key.replace('.', '\\.')}">([^<]+)<`));
    if (!m || m[1] !== text) { console.log(`  FAIL index.html static ${key} is "${m ? m[1] : 'missing'}", model says "${text}"`); process.exit(1); }
    console.log(`  ok   index.html static ${key} matches the model`);
  }
}
