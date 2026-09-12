// Loss development and aggregate erosion.
//
// Chain-ladder and Bornhuetter–Ferguson ultimates from the book's triangles,
// a fitted tail, and the question the captive actually asks: how much of
// each policy year's aggregate will be used, and by how much will it be
// exceeded.

import { triangles, trueUltimates, POLICY_YEARS, LINES } from '../../data/book.mjs';

const r0 = v => Math.round(v);

// Volume-weighted age-to-age factors. Optionally drop the n most recent
// diagonals' contribution or use a simple average.
export function ageToAge(tri, { average = 'volume', excludeHighLow = false } = {}) {
  const n = tri.ages.length;
  const factors = [];
  for (let j = 0; j < n - 1; j++) {
    const pairs = tri.rows.filter(r => r.values[j] !== null && r.values[j + 1] !== null && r.values[j] > 0).map(r => ({ from: r.values[j], to: r.values[j + 1], f: r.values[j + 1] / r.values[j] }));
    if (!pairs.length) { factors.push({ age: tri.ages[j], factor: null, n: 0 }); continue; }
    let used = pairs;
    if (excludeHighLow && pairs.length >= 4) {
      const sorted = pairs.slice().sort((a, b) => a.f - b.f);
      used = sorted.slice(1, -1);
    }
    const f = average === 'simple'
      ? used.reduce((s, p) => s + p.f, 0) / used.length
      : used.reduce((s, p) => s + p.to, 0) / used.reduce((s, p) => s + p.from, 0);
    factors.push({ age: tri.ages[j], factor: f, n: used.length, individual: pairs.map(p => p.f) });
  }
  return factors;
}

// Fit an exponential decay to (f - 1) over the last usable factors and sum
// the extrapolation beyond the last age to get a tail factor.
export function fitTail(factors, { horizonYears = 10 } = {}) {
  const pts = factors.map((f, i) => ({ i, y: f.factor === null ? null : f.factor - 1 })).filter(p => p.y !== null && p.y > 0.0005);
  const use = pts.slice(-4);
  if (use.length < 2) return { tail: 1, fitted: false, decay: null };
  const n = use.length;
  const sx = use.reduce((s, p) => s + p.i, 0), sy = use.reduce((s, p) => s + Math.log(p.y), 0);
  const sxx = use.reduce((s, p) => s + p.i * p.i, 0), sxy = use.reduce((s, p) => s + p.i * Math.log(p.y), 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const a = (sy - b * sx) / n;
  if (!(b < 0)) return { tail: 1, fitted: false, decay: b };
  let tail = 1;
  for (let k = factors.length; k < factors.length + horizonYears; k++) tail *= 1 + Math.exp(a + b * k);
  return { tail: Math.min(tail, 1.25), fitted: true, decay: Math.exp(b) };
}

export function cumulativeFactors(factors, tail) {
  const cdf = new Array(factors.length + 1).fill(0);
  cdf[factors.length] = tail;
  for (let j = factors.length - 1; j >= 0; j--) cdf[j] = cdf[j + 1] * (factors[j].factor ?? 1);
  return cdf;
}

// Ultimates by policy year for one triangle.
export function project(tri, { average = 'volume', excludeHighLow = false, tailOverride = null, expected = {}, bfThroughAge = 24 } = {}) {
  const factors = ageToAge(tri, { average, excludeHighLow });
  const tailFit = fitTail(factors);
  const tail = tailOverride ?? tailFit.tail;
  const cdf = cumulativeFactors(factors, tail);
  const years = tri.rows.map(row => {
    const k = row.values.findLastIndex(v => v !== null);
    const latest = row.values[k];
    const age = tri.ages[k];
    const f = cdf[k];
    const cl = latest * f;
    const pctDeveloped = 1 / f;
    const apriori = expected[row.py] ?? null;
    const bf = apriori === null ? null : latest + apriori * (1 - pctDeveloped);
    const useBf = bf !== null && age <= bfThroughAge;
    const selected = useBf ? bf : cl;
    return { py: row.py, age, latest, cdf: f, pctDeveloped, chainLadder: cl, apriori, bf, selected, method: useBf ? 'BF' : 'CL', ibnr: selected - latest };
  });
  return { factors, tail, tailFit, cdf, years };
}

// Full analysis for one line or the whole book.
export function analyse(book, { line = null, measure = 'incurred', average = 'volume', excludeHighLow = false, tailOverride = null, bfThroughAge = 24 } = {}) {
  const lineCodes = line ? [line] : Object.keys(LINES);
  const perLine = {};
  for (const lc of lineCodes) {
    const tri = triangles(book, { line: lc, measure });
    const paidTri = measure === 'paid' ? tri : triangles(book, { line: lc, measure: 'paid' });
    const expected = Object.fromEntries(book.policies.filter(p => p.line === lc).map(p => [p.py, p.expectedLoss]));
    const proj = project(tri, { average, excludeHighLow, tailOverride, expected, bfThroughAge });
    const truth = trueUltimates(book, lc);
    const years = proj.years.map(y => {
      const pol = book.policies.find(p => p.line === lc && p.py === y.py);
      const paid = paidTri.rows.find(r => r.py === y.py).values.findLast(v => v !== null);
      const erodedNow = y.latest / pol.aggregate;
      const erodedUlt = y.selected / pol.aggregate;
      return { ...y, line: lc, paid, aggregate: pol.aggregate, premium: pol.premium, expectedLoss: pol.expectedLoss, erodedNow, erodedUlt, excess: Math.max(0, y.selected - pol.aggregate), headroom: pol.aggregate - y.selected, truth: truth[y.py], lossRatio: y.selected / pol.premium };
    });
    perLine[lc] = { line: lc, tri, proj, years };
  }
  // Roll-up
  const byPy = POLICY_YEARS.map(py => {
    const parts = lineCodes.map(lc => perLine[lc].years.find(y => y.py === py));
    const sum = k => parts.reduce((s, p) => s + (p[k] || 0), 0);
    return { py, latest: sum('latest'), paid: sum('paid'), selected: sum('selected'), chainLadder: sum('chainLadder'), bf: parts.every(p => p.bf !== null) ? sum('bf') : null, ibnr: sum('ibnr'), aggregate: sum('aggregate'), premium: sum('premium'), expectedLoss: sum('expectedLoss'), excess: sum('excess'), truth: sum('truth'), age: parts[0].age, erodedNow: sum('latest') / sum('aggregate'), erodedUlt: sum('selected') / sum('aggregate'), lossRatio: sum('selected') / sum('premium'), method: parts.map(p => p.method).every(m => m === parts[0].method) ? parts[0].method : 'mixed' };
  });
  const totals = {
    latest: byPy.reduce((s, y) => s + y.latest, 0), selected: byPy.reduce((s, y) => s + y.selected, 0), ibnr: byPy.reduce((s, y) => s + y.ibnr, 0),
    excess: byPy.reduce((s, y) => s + y.excess, 0), truth: byPy.reduce((s, y) => s + y.truth, 0),
  };
  const breaches = lineCodes.flatMap(lc => perLine[lc].years.filter(y => y.excess > 0));
  const nearMisses = lineCodes.flatMap(lc => perLine[lc].years.filter(y => y.excess === 0 && y.erodedUlt >= 0.9));
  // backtest: mature years (age >= 60) estimate vs truth
  const mature = lineCodes.flatMap(lc => perLine[lc].years.filter(y => y.age >= 60));
  const green = lineCodes.flatMap(lc => perLine[lc].years.filter(y => y.age <= 24));
  const err = arr => arr.length ? arr.reduce((s, y) => s + Math.abs(y.selected - y.truth) / y.truth, 0) / arr.length : null;
  return { line, measure, perLine, byPy, totals, breaches, nearMisses, backtest: { matureError: err(mature), greenError: err(green), mature, green } };
}

export function formatTriangle(tri) {
  return tri.rows.map(r => [r.py, ...r.values.map(v => v === null ? '' : r0(v))]);
}
