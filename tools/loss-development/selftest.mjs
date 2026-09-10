// Run: node tools/loss-development/selftest.mjs
import { generateBook, triangles } from '../../data/book.mjs';
import { ageToAge, fitTail, cumulativeFactors, project, analyse } from './engine.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('loss development');
// A hand triangle with known factors
const tri = { ages: [12, 24, 36], rows: [{ py: 1, values: [100, 150, 165] }, { py: 2, values: [200, 300, null] }, { py: 3, values: [300, null, null] }] };
const f = ageToAge(tri);
check('volume-weighted factors are right', Math.abs(f[0].factor - 1.5) < 1e-9 && Math.abs(f[1].factor - 1.1) < 1e-9);
const fs = ageToAge(tri, { average: 'simple' });
check('simple-average factors are right', Math.abs(fs[0].factor - 1.5) < 1e-9);
const cdf = cumulativeFactors(f, 1.05);
check('cumulative factors multiply through the tail', Math.abs(cdf[0] - 1.5 * 1.1 * 1.05) < 1e-9 && Math.abs(cdf[2] - 1.05) < 1e-9);
const p = project(tri, { tailOverride: 1.0, expected: {} });
check('chain-ladder ultimate for the greenest year is latest × cdf', Math.abs(p.years[2].chainLadder - 300 * 1.65) < 1e-9);
check('fully developed year has zero IBNR at unit tail', Math.abs(p.years[0].ibnr) < 1e-9);
const pbf = project(tri, { tailOverride: 1.0, expected: { 3: 500 }, bfThroughAge: 12 });
check('Bornhuetter–Ferguson blends latest and a priori', Math.abs(pbf.years[2].bf - (300 + 500 * (1 - 1 / 1.65))) < 1e-9 && pbf.years[2].method === 'BF');
const decaying = [{ factor: 1.4 }, { factor: 1.2 }, { factor: 1.1 }, { factor: 1.05 }, { factor: 1.025 }];
const tail = fitTail(decaying);
check('tail fit is above one and bounded', tail.fitted && tail.tail > 1 && tail.tail < 1.25, String(tail.tail));
check('no-decay factors give a unit tail', fitTail([{ factor: 1.0 }, { factor: 1.0 }]).tail === 1);

const book = generateBook();
const a = analyse(book);
check('analysis covers all three lines and eight years', Object.keys(a.perLine).length === 3 && a.byPy.length === 8);
check('selected ultimate is never below latest incurred', a.byPy.every(y => y.selected >= y.latest - 0.01));
check('IBNR equals selected less latest', a.byPy.every(y => Math.abs(y.ibnr - (y.selected - y.latest)) < 0.01));
check('excess is zero when under the aggregate', Object.values(a.perLine).every(l => l.years.every(y => (y.selected <= y.aggregate) === (y.excess === 0))));
check('mature-year estimates land within 10% of the synthetic truth', a.backtest.matureError !== null && a.backtest.matureError < 0.10, String(a.backtest.matureError));
check('green-year error is reported', a.backtest.greenError !== null);
const a2 = analyse(book);
check('analysis is deterministic', JSON.stringify(a.totals) === JSON.stringify(a2.totals));
const paid = analyse(book, { measure: 'paid' });
check('paid method produces larger development factors than incurred', paid.perLine.WC.proj.cdf[0] > a.perLine.WC.proj.cdf[0]);
const wc = analyse(book, { line: 'WC' });
check('single-line analysis matches the roll-up component', Math.abs(wc.totals.selected - a.perLine.WC.years.reduce((s, y) => s + y.selected, 0)) < 0.01);

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all loss development checks passed');
