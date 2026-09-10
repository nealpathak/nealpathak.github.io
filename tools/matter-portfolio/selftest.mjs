// Run: node tools/matter-portfolio/selftest.mjs
import { generatePortfolio, analysePortfolio, route, FIRMS, GUIDELINE_RATES } from './engine.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('matter portfolio');
const P = generatePortfolio();
const P2 = generatePortfolio();
check('portfolio is reproducible', JSON.stringify(P.matters.map(m => [m.id, m.billed])) === JSON.stringify(P2.matters.map(m => [m.id, m.billed])));
check('portfolio has a sensible size', P.matters.length > 100 && P.matters.length < 160, String(P.matters.length));
check('every matter has a valid handling', P.matters.every(m => FIRMS.some(f => f.id === m.handling)));
check('closed matters carry no reserve; open ones do', P.matters.every(m => m.status === 'Closed' ? m.reserve === 0 : m.reserve > 0));
check('billed equals the sum of invoices', P.matters.every(m => Math.abs(m.billed - m.invoices.reduce((s, i) => s + i.amount, 0)) < 0.02));
check('invoice lines foot to the invoice', P.matters.every(m => m.invoices.every(i => Math.abs(i.amount - i.lines.reduce((s, l) => s + l.amount, 0)) < 0.02)));
check('in-house and administrator matters have no outside invoices', P.matters.filter(m => ['inhouse', 'tpa'].includes(m.handling)).every(m => m.invoices.length === 0));
check('no stage ends after the as-of date', P.matters.every(m => m.stageHistory.every(s => !s.end || s.end <= P.asOf)));

const r1 = route({ type: 'subrogation', exposure: 10000, suit: false, entity: 'NLL' });
check('small subrogation goes to the administrator', r1.handling === 'tpa' && r1.trace.find(t => t.id === 'R1').fired);
const r2 = route({ type: 'auto-bi', exposure: 400000, suit: true, entity: 'CVS' });
check('large suit goes to first-tier counsel with excess notice and litigation hold', r2.handling === 'firm-a' && r2.notices.some(n => n.id === 'N1') && r2.notices.some(n => n.id === 'N3'));
const r3 = route({ type: 'employment', exposure: 30000, suit: false, entity: 'HFD' });
check('employment goes to the employment panel and copies HR', r3.handling === 'firm-c' && r3.notices.some(n => n.id === 'N4'));
const r4 = route({ type: 'contract', exposure: 20000, suit: false, entity: 'SBG' });
check('small pre-suit contract dispute stays in-house', r4.handling === 'inhouse');
check('exactly one routing rule fires', [r1, r2, r3, r4].every(r => r.trace.filter(t => t.fired).length === 1));
const r5 = route({ type: 'premises', exposure: 1500000, suit: true, entity: 'NLL' });
check('million-dollar exposure notifies the board', r5.notices.some(n => n.id === 'N2'));

const A = analysePortfolio(P);
check('projection is at least what has been billed', A.burn.every(b => b.projected >= b.billed - 0.01));
check('over-budget list is exactly the matters projected above budget', A.overBudget.every(b => b.projected > b.budget) && A.burn.filter(b => b.projected > b.budget).length === A.overBudget.length);
check('some matters are projected over budget', A.overBudget.length > 0);
check('rate overbilling is attributed to firms and is positive', A.totalOver > 0 && A.firms.every(f => f.overGuideline >= 0));
check('the least disciplined firm bills the most above guideline per dollar', A.firms.slice().sort((a, b) => b.overShare - a.overShare)[0].firm === 'firm-d');
check('blended rates sit between paralegal and partner guideline', A.firms.every(f => f.blendedRate > GUIDELINE_RATES.Paralegal && f.blendedRate < GUIDELINE_RATES.Partner * 1.4));
check('stuck matters have been in stage longer than the 90th percentile', A.stuck.every(m => m.daysInStage > m.p90));
check('cycle table covers every type', A.cycle.length === 6 && A.cycle.every(c => c.stages.length > 0));

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all matter portfolio checks passed');
