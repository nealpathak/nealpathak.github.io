// Run: node engines/contract-requirements/selftest.mjs
import { generateContracts, gaps, analyseContracts, buyUpPlan, certificate, PROGRAMME, BUYUPS } from './engine.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('contract requirements');
const R = generateContracts();
check('register is reproducible', JSON.stringify(generateContracts().contracts) === JSON.stringify(R.contracts));
check('register has live contracts only', R.contracts.length > 40 && R.contracts.every(c => c.term >= R.asOf), String(R.contracts.length));

const base = { id: 'X', type: 'Subcontract', counterparty: 'T', entity: 'HFD', value: 100000, start: '2026-01-01', term: '2027-01-01', req: { glOcc: 1000000, glAgg: 2000000, al: 1000000, el: 1000000, umbrella: 5000000, professional: 0, pollution: 0, cyber: 0, ai: true, wos: true, pnc: true, notice: 30, indemnity: 'mutual' } };
check('a contract the programme meets has no gaps', gaps(base).length === 0);
const umb = { ...base, req: { ...base.req, umbrella: 10000000 } };
check('a higher umbrella requirement is a limit gap with the right shortfall', gaps(umb).length === 1 && gaps(umb)[0].kind === 'limit' && gaps(umb)[0].shortfall === 5000000);
check('the same requirement is met by the entity carrying $10m', gaps({ ...umb, entity: 'NLL' }).length === 0);
const poll = { ...base, req: { ...base.req, pollution: 1000000 } };
check('a coverage the programme does not carry is a coverage gap', gaps(poll)[0].kind === 'coverage');
const soft = { ...base, req: { ...base.req, notice: 60, indemnity: 'uncapped' } };
check('notice and indemnity are soft gaps, not limit gaps', gaps(soft).length === 2 && gaps(soft).every(g => ['notice', 'indemnity'].includes(g.kind)));

const A = analyseContracts(R);
check('at-risk contracts are exactly those with hard gaps', A.atRisk.every(r => r.hard.length > 0) && A.rows.filter(r => r.hard.length > 0).length === A.atRisk.length);
check('value at risk sums the at-risk contracts', Math.abs(A.valueAtRisk - A.atRisk.reduce((s, r) => s + r.value, 0)) < 1);
check('some contracts are at risk and some are not', A.atRisk.length > 0 && A.atRisk.length < A.rows.length);
check('drivers are sorted by value', A.drivers.every((d, i, a) => i === 0 || d.value <= a[i - 1].value));

const plan = buyUpPlan(R);
check('the plan reduces value at risk', plan.remaining < plan.start && plan.steps.length > 0);
check('each step clears value and cumulative cost adds up', plan.steps.every(s => s.clears > 0) && Math.abs(plan.spent - plan.steps.reduce((s, x) => s + x.cost, 0)) < 1);
check('roughly a third of contracts are at risk', A.atRisk.length / A.rows.length > 0.2 && A.atRisk.length / A.rows.length < 0.55, String(A.atRisk.length / A.rows.length));
check('the planned programme actually leaves the stated remainder', Math.abs(analyseContracts(R, plan.programme).valueAtRisk - plan.remaining) < 1);
const tight = buyUpPlan(R, { budget: 30000 });
check('a budget caps the spend', tight.spent <= 30000);
check('the base programme is not mutated by planning', PROGRAMME.entities.HFD.umbrella === 5000000 && PROGRAMME.shared.cyber === 1000000);

const cert = certificate(A.atRisk[0]);
check('certificate lists coverages with required limits and flags the failing ones', cert.coverages.length >= 6 && cert.coverages.some(c => !c.ok) && cert.satisfies === false);
check('certificate for a compliant contract satisfies', certificate(base).satisfies === true);

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all contract checks passed');
