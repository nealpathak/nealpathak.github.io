// Invariants of the synthetic book. Run: node data/selftest.mjs
import { generateBook, snapshot, triangles, trueUltimates, POLICY_YEARS, RETENTION } from './book.mjs';
import { hashSeed } from '../lib/rng.mjs';

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); }
  else console.log(`  ok   ${name}`);
}

console.log('book');
const a = generateBook();
const b = generateBook();
const fingerprint = book => hashSeed(JSON.stringify(book.claims.map(c => [c.id, c.retainedUltimate, c.events.length])));
check('same seed reproduces the same book', fingerprint(a) === fingerprint(b));
check('different seed produces a different book', fingerprint(a) !== fingerprint(generateBook({ seed: 'other' })));
check('claim count is in the expected band', a.claims.length > 2200 && a.claims.length < 3000, String(a.claims.length));

const snap = snapshot(a);
check('every reported claim is in the snapshot', snap.length === a.claims.filter(c => c.reportDate <= a.evaluationDate).length);
check('incurred equals paid plus outstanding', snap.every(c => Math.abs(c.incurred - (c.paid + c.outstanding)) < 0.011));
check('closed claims carry no outstanding reserve', snap.filter(c => c.status === 'Closed').every(c => c.outstanding === 0));
check('paid never exceeds the retained ultimate', a.claims.every(c => c.events.every(e => e.cumPaid <= c.retainedUltimate + 0.011)));
check('retained ultimate never exceeds retention plus reopen', a.claims.every(c => c.retainedUltimate <= RETENTION * 1.13));
check('events are date-ordered', a.claims.every(c => c.events.every((e, i) => i === 0 || e.date >= c.events[i - 1].date)));
check('report date is never before loss date', a.claims.every(c => c.reportDate >= c.lossDate));
check('loss date falls inside the policy year', a.claims.every(c => c.lossDate >= `${c.py}-09-01` && c.lossDate <= `${c.py + 1}-08-31`));

const openShare = py => { const s = snap.filter(c => c.py === py); return s.filter(c => c.status !== 'Closed').length / s.length; };
check('oldest year is mostly closed', openShare(2018) < 0.1, openShare(2018).toFixed(2));
check('newest year is mostly open', openShare(2025) > 0.8, openShare(2025).toFixed(2));

const paid = triangles(a, { measure: 'paid' });
check('paid triangle is non-decreasing across development', paid.rows.every(r => r.values.every((v, i) => v === null || i === 0 || v >= r.values[i - 1] - 0.01)));
check('triangle is a triangle', paid.rows.every((r, i) => r.values.filter(v => v !== null).length === POLICY_YEARS.length - i));
const tu = trueUltimates(a);
check('true ultimate exceeds paid to date for every year', paid.rows.every(r => tu[r.py] >= Math.max(...r.values.filter(v => v !== null))));

const prior = snapshot(a, '2026-08-30');
check('a prior-day snapshot is not larger than the current one', prior.length <= snap.length);
check('policies exist for every year and line', a.policies.length === POLICY_YEARS.length * 3 && a.policies.every(p => p.premium > p.expectedLoss && p.aggregate > p.expectedLoss));

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all book checks passed');
