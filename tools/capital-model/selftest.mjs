// Run: node tools/capital-model/selftest.mjs
import { generateBook } from '../../data/book.mjs';
import { derivePaymentPattern, openingPosition, simulate, simulatePath, capitalForTolerance, DEFAULTS } from './engine.mjs';
import { makeRng } from '../../lib/rng.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('capital model');
const book = generateBook();
const pat = derivePaymentPattern(book);
check('payment pattern starts at zero and ends at one', pat[0] === 0 && pat[pat.length - 1] === 1);
check('payment pattern is non-decreasing', pat.every((v, i) => i === 0 || v >= pat[i - 1] - 1e-12));
check('a fifth to a half is paid by twelve months from inception', pat[4] > 0.15 && pat[4] < 0.5, String(pat[4].toFixed(2)));
const opening = openingPosition(book);
check('opening reserves are positive and below total ultimate', opening.unpaid > 0 && opening.unpaid < 30000000, String(Math.round(opening.unpaid)));
check('expected loss ratio comes from the book pricing', opening.expectedLossRatio > 0.6 && opening.expectedLossRatio < 0.85, String(opening.expectedLossRatio));

const base = { ...DEFAULTS, expectedLossRatio: opening.expectedLossRatio, sims: 400 };
// Deterministic path: no volatility, no yield, no expenses; capital changes only by premium less losses
const det = simulatePath({ ...base, lossRatioCv: 0, reserveCv: 0, investmentYield: 0, expenseRatio: 0, aggregate: false, sims: 1 }, opening, pat, makeRng('x'));
const annualPremium = opening.latestPremium * (1 + base.premiumGrowth);
const expectedGain = annualPremium * (1 - opening.expectedLossRatio); // year one, ultimate-basis reserving
check('capital after four quarters equals premium less ultimate loss, with nothing else on', Math.abs(det.capital[4] - (base.startingCapital + expectedGain)) < 1, `${det.capital[4]} vs ${base.startingCapital + expectedGain}`);
check('reserves fall as the opening book runs off with no new business', (() => { const p = simulatePath({ ...base, lossRatioCv: 0, reserveCv: 0, expectedLossRatio: 0.000001, investmentYield: 0, expenseRatio: 0, aggregate: false }, opening, pat, makeRng('x')); return p.reserves[12] < p.reserves[0]; })());
check('accounting identity: capital equals assets less reserves every quarter', det.capital.every((c, q) => Math.abs(c - (det.assets[q] - det.reserves[q])) < 1e-6));

const r1 = simulate(base, opening, pat);
const r2 = simulate(base, opening, pat);
check('simulation is deterministic for a seed', r1.breachAny === r2.breachAny && r1.endCapitalMedian === r2.endCapitalMedian);
check('breach probability is a probability', r1.breachAny >= 0 && r1.breachAny <= 1 && r1.breachEnd <= r1.breachAny + 1e-9);
check('percentile bands are ordered', r1.capital.p5.every((v, q) => v <= r1.capital.p50[q] && r1.capital.p50[q] <= r1.capital.p95[q]));
const rich = simulate({ ...base, startingCapital: 30000000 }, opening, pat);
const poor = simulate({ ...base, startingCapital: 2000000 }, opening, pat);
check('more capital means fewer breaches', rich.breachAny <= poor.breachAny && rich.breachAny < 0.05);
const noAgg = simulate({ ...base, aggregate: false }, opening, pat);
const agg = simulate({ ...base, aggregate: true, aggregateCost: 0 }, opening, pat);
check('free aggregate cover can only help the downside', agg.capital.p5[12] >= noAgg.capital.p5[12] - 1e-6 && agg.breachAny <= noAgg.breachAny);
const vol = simulate({ ...base, lossRatioCv: 0.4, aggregate: false }, opening, pat);
check('more volatility widens the band', (vol.capital.p95[12] - vol.capital.p5[12]) > (noAgg.capital.p95[12] - noAgg.capital.p5[12]));
const tol = capitalForTolerance({ ...base, sims: 300 }, opening, pat, 0.05);
check('capital-for-tolerance returns a solvable number', tol.capital !== null && tol.capital > 0 && tol.capital < 60000000, String(tol.capital));
check('capital-for-tolerance actually meets the tolerance', simulate({ ...base, startingCapital: tol.capital * 1.02, sims: 300 }, opening, pat).breachAny <= 0.06);

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all capital model checks passed');
