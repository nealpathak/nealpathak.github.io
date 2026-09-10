// Run: node tools/board-brief/selftest.mjs
import { generateBook, snapshot } from '../../data/book.mjs';
import { analyse } from '../loss-development/engine.mjs';
import { buildBrief } from './brief.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('board brief');
const book = generateBook();
const t = Date.now();
const b = buildBrief(book);
check('brief builds in a reasonable time', Date.now() - t < 8000, `${Date.now() - t} ms`);
check('claims counts match the snapshot', b.claims.count === snapshot(book).length && b.claims.open === snapshot(book).filter(c => c.status !== 'Closed').length);
check('incurred matches the sum of the snapshot', Math.abs(b.claims.incurred - snapshot(book).reduce((s, c) => s + c.incurred, 0)) < 0.01);
check('erosion section covers three lines', b.erosion.length === 3 && b.erosion.every(e => e.current && e.prior));
check('development totals match the engine', Math.abs(b.dev.totals.selected - analyse(book).totals.selected) < 0.01);
check('capital section carries a breach probability and a solved capital', b.cap.breachAny >= 0 && b.cap.breachAny <= 1 && b.need.capital > 0);
check('every decision names an area and reads as a sentence', b.decisions.length > 0 && b.decisions.every(d => d.area && /\.\s*$/.test(d.text)));
check('a renewal decision exists for every breaching year', b.erosion.flatMap(e => e.breaches).length === b.decisions.filter(d => d.area === 'Renewal').length);
check('capital decision appears only when above tolerance', (b.cap.breachAny > b.tolerance) === b.decisions.some(d => d.area === 'Capital'));
check('legal and allocation sections are present', b.legal.totals.matters > 0 && b.alloc.byEntity.length === 5);
check('fleet ran and coverage computed', Object.keys(b.fleet.status).length === 10 && b.cov.total > 0);
check('large open claims are sorted descending', b.claims.largeOpen.every((c, i, a) => i === 0 || c.incurred <= a[i - 1].incurred));
const b2 = buildBrief(book);
check('brief is deterministic', JSON.stringify(b.decisions) === JSON.stringify(b2.decisions));

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all brief checks passed');
