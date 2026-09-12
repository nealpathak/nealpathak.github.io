// Run: node engines/tcor-allocation/selftest.mjs
import { generateBook, ENTITIES, POLICY_YEARS } from '../../data/book.mjs';
import { analyse } from '../loss-development/engine.mjs';
import { costOfRisk, byEntityYear, allocate, subsidy } from './engine.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('tcor and allocation');
const book = generateBook();
const cor = costOfRisk(book);
check('one cell per entity, line and year', cor.cells.length === ENTITIES.length * 3 * POLICY_YEARS.length);
check('exposure shares sum to one within each line-year', POLICY_YEARS.every(py => ['WC', 'GL', 'AL'].every(lc => Math.abs(cor.cells.filter(c => c.py === py && c.line === lc).reduce((s, c) => s + c.share, 0) - 1) < 1e-9)));
const dev = analyse(book);
check('entity ultimates sum to the line ultimates', ['WC', 'GL', 'AL'].every(lc => POLICY_YEARS.every(py => { const cells = cor.cells.filter(c => c.py === py && c.line === lc); const line = dev.perLine[lc].years.find(y => y.py === py); return Math.abs(cells.reduce((s, c) => s + c.latest, 0) - line.latest) < 1 && Math.abs(cells.reduce((s, c) => s + c.selected, 0) - line.selected) / line.selected < 0.02; })));
check('premium allocated by exposure sums to the policy premium', POLICY_YEARS.every(py => ['WC', 'GL', 'AL'].every(lc => Math.abs(cor.cells.filter(c => c.py === py && c.line === lc).reduce((s, c) => s + c.premium, 0) - book.policies.find(p => p.py === py && p.line === lc).premium) < 1)));
check('tcor is the sum of its components', cor.cells.every(c => Math.abs(c.tcor - (c.selected + c.excess + c.handling + c.admin)) < 1e-6));
const ey = byEntityYear(cor);
check('entity-year roll-up has one row per entity and year', ey.length === ENTITIES.length * POLICY_YEARS.length);

const a = allocate(book, cor);
check('allocation fully allocates each line premium', Object.values(a.perLine).every(l => Math.abs(l.rows.reduce((s, r) => s + r.allocated, 0) - l.premium) < 1));
check('no entity moves more than the cap from exposure-based', Object.values(a.perLine).every(l => l.rows.every(r => Math.abs(r.changePct) <= a.params.cap + 0.01)));
const noCred = allocate(book, cor, { credibilityK: 1e12 });
check('with no credibility the allocation is pure exposure', Object.values(noCred.perLine).every(l => l.rows.every(r => Math.abs(r.allocated - r.exposureBased) < 1)));
const full = allocate(book, cor, { credibilityK: 0, cap: 10 });
check('with full credibility and no cap, allocation follows relativity', Object.values(full.perLine).every(l => l.rows.every(r => Math.abs(r.allocated / r.exposureBased - r.relativity / (l.rows.reduce((s, x) => s + x.share * x.relativity, 0))) < 1e-6)));
check('credibility is between zero and one and rises with claims', a.perLine.WC.rows.every(r => r.credibility >= 0 && r.credibility <= 1) && a.perLine.WC.rows.slice().sort((x, y) => x.claims - y.claims).every((r, i, arr) => i === 0 || r.credibility >= arr[i - 1].credibility));
check('money moved is positive and below total premium', a.moved > 0 && a.moved < a.total);
check('entity changes net to zero', Math.abs(a.byEntity.reduce((s, e) => s + e.change, 0)) < 1);
const sub = subsidy(cor, a.window);
check('subsidy balances net to premium less losses', Math.abs(sub.reduce((s, e) => s + e.balance, 0) - (sub.reduce((s, e) => s + e.premium, 0) - sub.reduce((s, e) => s + e.losses, 0))) < 1e-6);
check('allocation is deterministic', JSON.stringify(allocate(book, cor).byEntity) === JSON.stringify(a.byEntity));

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all tcor checks passed');
