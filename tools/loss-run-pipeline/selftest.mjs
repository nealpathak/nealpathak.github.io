// Run: node tools/loss-run-pipeline/selftest.mjs
import { generateBook, snapshot } from '../../data/book.mjs';
import { buildRawLossRun, runPipeline, parseDate, parseMoney, parseStatus, parseState, mapColumns } from './engine.mjs';
import { dates } from '../../lib/format.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('loss-run pipeline');
check('parses US, short, ISO and dd-Mon dates', ['03/07/2025', '3/7/25', '2025-03-07', '07-Mar-2025'].every(s => parseDate(s).value === '2025-03-07'));
check('rejects an impossible date', parseDate('13/45/2025').error && parseDate('02/30/2025').error);
check('parses money in four house styles', [parseMoney('$12,345.67').value, parseMoney('12345.67').value, parseMoney(' 12,345.67 ').value].every(v => v === 12345.67) && parseMoney('(1,234.00)').value === -1234);
check('normalises status labels', ['O', 'OPEN', 'Open '].every(s => parseStatus(s).value === 'Open') && parseStatus('RO').value === 'Reopened' && parseStatus('??').error);
check('normalises state names', parseState('Texas').value === 'TX' && parseState('tx').value === 'TX' && parseState('Atlantis').error);
const m = mapColumns(['Clm No', 'Insured Name', 'DOL', 'Sts', 'Tot Paid', 'O/S Rsv', 'LOB', 'Mystery']);
check('maps TPA headers to canonical fields', m.mapping.claimId === 'Clm No' && m.mapping.lossDate === 'DOL' && m.mapping.outstanding === 'O/S Rsv' && m.unmapped.includes('Mystery') && m.missing.length === 0);

const book = generateBook();
const raw = buildRawLossRun(book);
const raw2 = buildRawLossRun(book);
check('raw file is reproducible', raw.text === raw2.text);
const asOf = book.evaluationDate, priorAsOf = dates.addDays(asOf, -7);
const prior = snapshot(book, priorAsOf);
const truth = snapshot(book, asOf);
const out = runPipeline(raw.text, { prior, asOf, priorAsOf });
check('pipeline completes all six steps', out.steps.length === 6 && !out.fatal);
const byKind = k => raw.injected.filter(d => d.kind === k);
const rule = r => out.exceptions.filter(e => e.rule === r);
check('finds every injected duplicate', byKind('duplicate').every(d => rule('Duplicate claim number').some(e => e.claimId === d.id)));
check('quarantines every blank claim number', rule('Missing claim number').length === byKind('missing-claim-number').length);
check('finds every negative paid', byKind('negative-paid').every(d => rule('Negative paid').some(e => e.claimId === d.id)));
check('recomputes every stale incurred', byKind('incurred-mismatch').every(d => rule('Incurred does not foot').some(e => e.claimId === d.id)));
check('finds report-before-loss rows', byKind('report-before-loss').every(d => rule('Reported before loss').some(e => e.claimId === d.id)));
check('finds closed claims carrying reserve', byKind('closed-with-reserve').every(d => rule('Closed with open reserve').some(e => e.claimId === d.id)));
check('quarantines the unknown line and entity', ['unknown-line', 'unknown-entity'].every(k => byKind(k).every(d => out.quarantined.some(q => q.claimId === d.id))));
check('quarantines unparseable dates', byKind('unparseable-date').every(d => out.quarantined.some(q => q.claimId === d.id)));
check('loaded claim count equals reported claims less quarantined', out.records.length === truth.length - out.quarantined.length);
check('no loaded claim id is duplicated', new Set(out.records.map(r => r.claimId)).size === out.records.length);
// Values of untouched claims must equal the truth exactly
const injectedIds = new Set(raw.injected.map(d => d.id));
const truthById = new Map(truth.map(c => [c.id, c]));
const untouched = out.records.filter(r => !injectedIds.has(r.claimId));
check('untouched claims round-trip to the cent', untouched.every(r => { const t = truthById.get(r.claimId); return t && t.paid === r.paid && t.outstanding === r.outstanding && t.status === r.status && t.lossDate === r.lossDate && t.entity === r.entity; }), String(untouched.length));
check('activity report sees the new claims', out.activity.newClaims.length > 0 && out.activity.newClaims.every(r => !prior.some(p => p.id === r.claimId)));
check('release gate holds when there are blocking exceptions', out.gate.held === true);
check('claimant names are absent from the actuarial export', !/claimant/i.test(out.exports.actuarial.split('\n')[0]) && !out.exports.actuarial.includes(truth[0].claimant));
check('actuarial export row count matches loaded claims', out.exports.actuarial.split('\n').length - 1 === out.records.length);
const missingReq = runPipeline('a,b,c\n1,2,3', { asOf });
check('a file without required columns fails cleanly', !!missingReq.fatal);

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all pipeline checks passed');
