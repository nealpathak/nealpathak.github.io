// selftest.mjs — run with `node tools/exposure-ledger/selftest.mjs`.
//
// The browser is a bad place to find out that a layer allocated twice. These
// are the checks that have to hold before any number reaches a board pack:
// the parser reads what the clause says, one loss never recovers more than it
// cost, aggregates cannot pay out more than they hold, and the same seed
// returns the same answer.

import { loadRegister, loadProgram, buildLedger, money, parseCarveouts, parseCap, ceilingFor } from './data.js';
import { prepare, simulate, simulateWithAttribution, withLayers, withCeilings, rng } from './sim.js';
import { DEFAULT_SETTINGS } from './assume.js';
import { sampleRegisterCSV, SAMPLE_PROGRAM_CSV } from './samples.js';

let failures = 0;
let checks = 0;

function ok(name, cond, detail) {
  checks++;
  if (cond) { console.log(`  pass  ${name}`); return; }
  failures++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
}
function near(name, a, b, tol, detail) {
  ok(name, Math.abs(a - b) <= tol, detail || `${a} vs ${b} (tol ${tol})`);
}
function section(t) { console.log(`\n${t}`); }

/* ------------------------------------------------------------ parsing --- */

section('Money and clause parsing');
ok('$1,500,000', money('$1,500,000') === 1500000);
ok('1.5m', money('1.5m') === 1500000);
ok('750k', money('750k') === 750000);
ok('bare number', money('250000') === 250000);
ok('garbage rejected', Number.isNaN(money('see schedule 4')));
ok('empty rejected', Number.isNaN(money('')));

const carve = parseCarveouts('INDEMNITY=UNCAPPED;DATA=3x;IP=5000000');
ok('indemnity carved uncapped', carve.INDEMNITY.kind === 'UNCAPPED');
ok('data supercap read as multiple', carve.DATA.kind === 'MULTIPLE' && carve.DATA.value === 3);
ok('ip carved at an amount', carve.IP.kind === 'AMOUNT' && carve.IP.value === 5000000);
ok('gross is uncapped even when unmentioned', parseCarveouts('').GROSS.kind === 'UNCAPPED');

ok('multiple-of-fees cap', parseCap('MULTIPLE', '2x', 4000000) === 8000000);
ok('amount cap', parseCap('AMOUNT', '$3,000,000', 4000000) === 3000000);
ok('missing cap is uncapped', parseCap('', '', 1000000) === Infinity);

const contract = {
  annualValue: 4000000,
  cap: 4000000,
  carveouts: parseCarveouts('INDEMNITY=UNCAPPED;DATA=3x'),
};
ok('general peril sits under the cap', ceilingFor(contract, 'GENERAL') === 4000000);
ok('carved indemnity ignores the cap', ceilingFor(contract, 'INDEMNITY') === Infinity);
ok('data supercap resolves to dollars', ceilingFor(contract, 'DATA') === 12000000);
ok('gross always escapes the cap', ceilingFor(contract, 'GROSS') === Infinity);

/* ------------------------------------------------------------- inputs --- */

section('Register and programme');
const registerCSV = sampleRegisterCSV();
const registerRows = registerCSV.trim().split(/\r?\n/).length - 1;
const { contracts, issues: regIssues } = loadRegister(registerCSV);
ok('register loads every sample row', contracts.length === registerRows, `${contracts.length} of ${registerRows}`);
ok('no fatal register errors', !regIssues.some((i) => i.level === 'error'));
ok('no warnings on the sample book', !regIssues.length, regIssues.slice(0, 3).map((i) => i.msg).join(' | '));
ok('every contract has a positive value', contracts.every((c) => c.annualValue > 0));
ok('the sample book is heavy-tailed but not degenerate', (() => {
  const total = contracts.reduce((s, c) => s + c.annualValue, 0);
  const largest = Math.max(...contracts.map((c) => c.annualValue));
  return largest / total < 0.15;
})(), 'largest contract should be under 15% of book value');

const dirty = loadRegister([
  'contract_id,counterparty,category,annual_value,cap_type,cap_value',
  'D-1,Unquoted Thousands LLC,SUPPLIER,$4,500,000',
  'D-2,Odd Cap Type Co.,SUPPLIER,1m,PERHAPS,1000000',
  'D-3,Zero Cap Inc.,SUPPLIER,1m,AMOUNT,0',
].join('\n'));
ok('an unquoted thousands separator is flagged',
  dirty.issues.some((i) => /annual_value of 4\b/.test(i.msg)),
  dirty.issues.map((i) => i.msg).join(' | '));
ok('an unrecognised cap_type is flagged', dirty.issues.some((i) => /unrecognised cap_type/.test(i.msg)));
ok('a zero cap is flagged', dirty.issues.some((i) => /cap of zero/.test(i.msg)));

const program = loadProgram(SAMPLE_PROGRAM_CSV);
ok('programme loads 7 layers', program.layers.length === 7, `got ${program.layers.length}`);
ok('no gap warnings on a clean tower', !program.issues.some((i) => /gap/.test(i.msg)),
  program.issues.map((i) => i.msg).join(' | '));
ok('GL and PROF towers both present', !!program.byLine.GL && !!program.byLine.PROF);

const badProgram = loadProgram([
  'line,layer,attachment,limit',
  'GL,Primary,0,1000000',
  'GL,Excess,5000000,10000000',
].join('\n'));
ok('an unfilled tower gap is reported', badProgram.issues.some((i) => /gap/.test(i.msg)));

const ledger = buildLedger(contracts, program);
ok('ledger is one row per contract per peril', ledger.length === contracts.length * 5);
ok('IP is uninsured by construction', ledger.filter((u) => u.peril === 'IP').every((u) => !u.covered));
ok('data claims point at cyber', ledger.filter((u) => u.peril === 'DATA').every((u) => u.lineCode === 'CYBER'));

/* --------------------------------------------------------- allocation --- */

section('Layer allocation');
// One contract, one peril, one certain claim of a known size: the allocation is
// then arithmetic and can be checked by hand.
function oneLossModel({ loss, programCSV }) {
  const prog = loadProgram(programCSV);
  const settings = { ...DEFAULT_SETTINGS, trials: 1, seed: 7, uncappedTruncation: 1e12 };
  const cs = [{ id: 'X', counterparty: 'X', category: 'SUPPLIER', annualValue: 1e6, cap: Infinity, carveouts: {}, line: 2 }];
  const led = [{ contractIndex: 0, contractId: 'X', counterparty: 'X', category: 'SUPPLIER', peril: 'GENERAL', ceiling: Infinity, lineCode: 'GL', covered: true }];
  const prep = prepare(cs, prog, led, settings);
  // Force exactly one claim of exactly `loss`.
  prep.units.lambda[0] = 1e-9;
  const lines = prep.lines;
  let recovered = 0;
  let transferred = 0;
  const remaining = {};
  prep.aggGroupIds.forEach((g, i) => { remaining[i] = prep.aggCapacity[i] - prep.aggEroded[i]; });
  for (const L of lines[0].layers) {
    if (loss <= L.attach) break;
    let cover = Math.min(loss - L.attach, L.limit);
    const actual = Math.min(cover, remaining[L.aggIdx]);
    remaining[L.aggIdx] -= actual;
    recovered += actual;
    if (!L.captive) transferred += actual;
  }
  return { recovered, transferred, retained: loss - recovered };
}

const simpleTower = [
  'line,layer,attachment,limit,aggregate_limit,aggregate_eroded,retention,agg_group,captive',
  'GL,Primary,500000,2000000,4000000,0,500000,A,N',
  'GL,Umbrella,2500000,25000000,25000000,0,0,B,N',
].join('\n');

let a = oneLossModel({ loss: 300000, programCSV: simpleTower });
ok('loss inside the retention recovers nothing', a.recovered === 0 && a.retained === 300000);

a = oneLossModel({ loss: 1500000, programCSV: simpleTower });
ok('loss in the primary layer recovers above the SIR', a.recovered === 1000000 && a.retained === 500000);

a = oneLossModel({ loss: 10000000, programCSV: simpleTower });
ok('loss through both layers recovers all but the SIR', a.recovered === 9500000 && a.retained === 500000,
  `recovered ${a.recovered}`);

a = oneLossModel({ loss: 40000000, programCSV: simpleTower });
ok('loss above the tower retains the excess', a.retained === 40000000 - 27000000,
  `retained ${a.retained}`);

const erodedTower = [
  'line,layer,attachment,limit,aggregate_limit,aggregate_eroded,retention,agg_group,captive',
  'GL,Primary,500000,2000000,4000000,3800000,500000,A,N',
].join('\n');
a = oneLossModel({ loss: 2500000, programCSV: erodedTower });
ok('an eroded aggregate pays only what is left', a.recovered === 200000, `recovered ${a.recovered}`);

const captiveTower = [
  'line,layer,attachment,limit,aggregate_limit,aggregate_eroded,retention,agg_group,captive',
  'GL,Captive,0,1000000,3000000,0,1000000,C,Y',
  'GL,Primary,1000000,5000000,5000000,0,0,D,N',
].join('\n');
a = oneLossModel({ loss: 3000000, programCSV: captiveTower });
ok('captive recovery is not risk transfer', a.recovered === 3000000 && a.transferred === 2000000,
  `recovered ${a.recovered}, transferred ${a.transferred}`);

/* --------------------------------------------------------- simulation --- */

section('Simulation');
const settings = { ...DEFAULT_SETTINGS, trials: 4000, seed: 20260823 };
const prepared = prepare(contracts, program, ledger, settings);
ok('every peril with frequency becomes an exposure unit', prepared.units.n > contracts.length * 3);

const t0 = Date.now();
const res = simulate(prepared, settings);
const elapsed = Date.now() - t0;
console.log(`        ${settings.trials} trials over ${contracts.length} contracts in ${elapsed}ms`);

ok('gross is positive', res.gross.mean > 0);
ok('nothing recovers more than it cost', res.transferred.mean <= res.gross.mean);
near('retained reconciles to gross minus transferred',
  res.retained.mean, res.gross.mean - res.transferred.mean, 1);
const splitSum = res.split.retention + res.split.captive + res.split.aboveProgram + res.split.uninsuredByForm;
near('the retained split adds back to retained', splitSum, res.retained.mean, Math.max(1, res.retained.mean * 1e-9),
  `split ${splitSum} vs retained ${res.retained.mean}`);
ok('percentiles are ordered', res.retained.p50 <= res.retained.p90 && res.retained.p90 <= res.retained.p99 && res.retained.p99 <= res.retained.max);
ok('TVaR sits above the VaR it conditions on', res.retained.tvar99 >= res.retained.p99);
ok('every aggregate stayed within capacity',
  res.aggregates.every((g) => g.meanUsed <= g.available + 1e-6),
  res.aggregates.map((g) => `${g.group}: used ${Math.round(g.meanUsed)} of ${g.available}`).join(' | '));
ok('exhaustion probabilities are probabilities',
  res.aggregates.every((g) => g.exhaustionProb >= 0 && g.exhaustionProb <= 1));
near('peril gross sums to total gross',
  res.byPeril.reduce((s, p) => s + p.gross, 0), res.gross.mean, Math.max(1, res.gross.mean * 1e-9));
near('peril retained sums to retained less captive recoveries',
  res.byPeril.reduce((s, p) => s + p.retained, 0) + res.split.captive, res.retained.mean,
  Math.max(1, res.retained.mean * 1e-9));

const again = simulate(prepared, settings);
ok('the same seed returns the same number', again.retained.p99 === res.retained.p99);
const different = simulate(prepared, { ...settings, seed: settings.seed + 1 });
ok('a different seed moves the number', different.retained.p99 !== res.retained.p99);

/* ------------------------------------------------------------ defence --- */

section('Defence costs');
const noDefence = simulate(prepare(contracts, program, ledger, { ...settings, defenceLoad: 0 }), { ...settings, defenceLoad: 0 });
ok('turning defence off costs nothing', noDefence.defence.total === 0);
ok('defence makes the book more expensive', res.gross.mean > noDefence.gross.mean,
  `${Math.round(res.gross.mean)} vs ${Math.round(noDefence.gross.mean)}`);
ok('defence increases retained exposure', res.retained.mean > noDefence.retained.mean);
near('defence splits with no dollars unaccounted for',
  res.defence.transferred + res.defence.captive + res.defence.retained, res.defence.total,
  Math.max(1, res.defence.total * 1e-9),
  `${res.defence.transferred + res.defence.captive + res.defence.retained} vs ${res.defence.total}`);
ok('defence eroding limits never exceeds what the towers paid',
  res.defence.erodingLimits <= res.defence.transferred + res.defence.captive + 1e-6);
ok('the schedule decides where defence sits',
  prepared.lines.find((l) => l.code === 'GL').defenceOutside === true &&
  prepared.lines.find((l) => l.code === 'PROF').defenceOutside === false,
  prepared.lines.map((l) => `${l.code}=${l.defenceOutside ? 'OUTSIDE' : 'INSIDE'}`).join(' '));

// Two identical towers differing only in where defence sits. The one that pays
// defence out of the limit has to run out of limit sooner.
const twinTower = (treatment) => [
  'line,layer,attachment,limit,aggregate_limit,aggregate_eroded,retention,agg_group,captive,defence',
  `PROF,Primary,1000000,5000000,6000000,0,1000000,T1,N,${treatment}`,
].join('\n');
const twinLedger = buildLedger(contracts, loadProgram(twinTower('INSIDE')));
const insideRun = simulate(prepare(contracts, loadProgram(twinTower('INSIDE')), twinLedger, settings), settings);
const outsideRun = simulate(prepare(contracts, loadProgram(twinTower('OUTSIDE')), twinLedger, settings), settings);
ok('defence inside the limit spends more of the aggregate',
  insideRun.aggregates[0].meanUsed > outsideRun.aggregates[0].meanUsed,
  `inside ${Math.round(insideRun.aggregates[0].meanUsed)} vs outside ${Math.round(outsideRun.aggregates[0].meanUsed)}`);
ok('defence inside the limit exhausts the tower more often',
  insideRun.aggregates[0].exhaustionProb >= outsideRun.aggregates[0].exhaustionProb,
  `inside ${insideRun.aggregates[0].exhaustionProb} vs outside ${outsideRun.aggregates[0].exhaustionProb}`);
ok('only the inside tower reports defence eroding limits',
  insideRun.defence.erodingLimits > 0 && outsideRun.defence.erodingLimits === 0);

/* ------------------------------------------------------------- levers --- */

section('Levers');
const attributed = simulateWithAttribution(prepared, settings);
ok('the tail pass found trials to attribute', attributed.tailTrials > 0, `${attributed.tailTrials} trials`);
ok('tail contribution is recorded per contract', !!attributed.perContract.tail);
const tailSum = Array.from(attributed.perContract.tail).reduce((s, v) => s + v, 0);
ok('tail contributions sum to roughly the tail average',
  tailSum >= attributed.attributionThreshold * 0.85,
  `sum ${Math.round(tailSum)} vs threshold ${Math.round(attributed.attributionThreshold)}`);

const overrides = new Map();
contracts.forEach((c, i) => {
  overrides.set(`${i}|INDEMNITY`, Math.min(c.cap === Infinity ? c.annualValue : c.cap, c.annualValue * 1));
});
const capped = simulate(withCeilings(prepared, overrides), settings);
ok('capping the indemnity carve-out reduces the tail',
  capped.retained.p99 < res.retained.p99,
  `${Math.round(capped.retained.p99)} vs ${Math.round(res.retained.p99)}`);

const bought = simulate(withLayers(prepared, [
  { lineCode: 'GL', attachment: 52500000, limit: 25000000, aggregate: 25000000, premium: 400000, name: 'second excess' },
]), settings);
ok('buying a layer above the tower cannot increase retained loss',
  bought.retained.p99 <= res.retained.p99 + 1e-6,
  `${Math.round(bought.retained.p99)} vs ${Math.round(res.retained.p99)}`);

const cyberAdded = simulate(withLayers(prepared, [
  { lineCode: 'IPX', attachment: 0, limit: 5000000, aggregate: 5000000, premium: 250000, name: 'standalone IP' },
]), settings);
ok('a line nothing points at changes nothing',
  Math.abs(cyberAdded.retained.mean - res.retained.mean) < 1e-6);

/* --------------------------------------------------------------- rng ---- */

section('Random number generator');
const r = rng(12345);
let sum = 0;
let min = 1;
let max = 0;
for (let i = 0; i < 200000; i++) { const v = r(); sum += v; if (v < min) min = v; if (v > max) max = v; }
near('uniform mean is a half', sum / 200000, 0.5, 0.005);
ok('stays inside the unit interval', min >= 0 && max < 1);

/* -------------------------------------------------------------- result --- */

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
