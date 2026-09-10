// Captive capital and cash-flow model.
//
// Projects assets, reserves and capital quarter by quarter over a three-year
// horizon, with stochastic loss ratios and reserve deterioration, and
// answers: what is the probability the captive breaches its capital
// requirement, and how much capital would it take to keep that under a
// chosen tolerance.

import { makeRng } from '../../lib/rng.mjs';
import { triangles, POLICY_YEARS } from '../../data/book.mjs';
import { analyse } from '../loss-development/engine.mjs';

// Cumulative paid fraction at each month, derived from the book's own paid
// development, interpolated to quarters and tailed to 120 months.
export function derivePaymentPattern(book) {
  const a = analyse(book, { measure: 'paid' });
  const lines = Object.values(a.perLine);
  const ages = lines[0].tri.ages; // 12..96
  // Weight each line's pattern by its latest-year premium.
  const w = lines.map(l => l.years[l.years.length - 1].premium);
  const W = w.reduce((s, v) => s + v, 0);
  const annual = [0];
  for (let j = 0; j < ages.length; j++) annual.push(lines.reduce((s, l, i) => s + (w[i] / W) * Math.min(1, 1 / l.proj.cdf[j]), 0));
  const months = [0, ...ages, 120];
  annual.push(1);
  const quarterly = [];
  for (let m = 0; m <= 120; m += 3) {
    let k = 1; while (k < months.length && months[k] < m) k++;
    if (k >= months.length) { quarterly.push(1); continue; }
    const t0 = months[k - 1], t1 = months[k], f0 = annual[k - 1], f1 = annual[k];
    quarterly.push(f0 + (f1 - f0) * (m - t0) / (t1 - t0));
  }
  return quarterly; // index q = months/3
}

// Opening balance sheet from the book at the evaluation date.
export function openingPosition(book) {
  const a = analyse(book);
  const byPy = a.byPy.map(y => ({ py: y.py, age: y.age, unpaid: Math.max(0, y.selected - y.paid), ultimate: y.selected }));
  const unpaid = byPy.reduce((s, y) => s + y.unpaid, 0);
  const latestPremium = book.policies.filter(p => p.py === POLICY_YEARS[POLICY_YEARS.length - 1]).reduce((s, p) => s + p.premium, 0);
  const latestExpected = book.policies.filter(p => p.py === POLICY_YEARS[POLICY_YEARS.length - 1]).reduce((s, p) => s + p.expectedLoss, 0);
  return { byPy, unpaid, latestPremium, expectedLossRatio: latestExpected / latestPremium };
}

export const DEFAULTS = {
  startingCapital: 9000000,
  premiumGrowth: 0.05,
  expectedLossRatio: null, // filled from the book
  lossRatioCv: 0.18,
  reserveCv: 0.08,
  reserveShock: 1.0, // deterministic multiplier on opening reserves
  expenseRatio: 0.12,
  investmentYield: 0.04,
  paymentSpeed: 1.0,
  aggregate: true,
  aggregateAttach: 1.25, // multiple of expected loss
  aggregateCost: 0.05, // share of premium
  dividendPayout: 0,
  horizonQuarters: 12,
  requiredPremiumFactor: 0.35,
  requiredReserveFactor: 0.15,
  threshold: 1.0,
  sims: 2000,
  seed: 'capital-model',
};

function pattern(q, pat, speed) {
  const x = q * speed;
  const i = Math.floor(x);
  if (i >= pat.length - 1) return 1;
  return pat[i] + (pat[i + 1] - pat[i]) * (x - i);
}

// Simulate one path. Returns arrays per quarter (index 0 = opening).
export function simulatePath(params, opening, pat, rng) {
  const P = params;
  const H = P.horizonQuarters;
  const annualPremium0 = opening.latestPremium * (1 + P.premiumGrowth);
  // reserve deterioration on the opening book, drawn once
  const resFactor = P.reserveCv > 0 ? rng.lognormalMeanCv(1, P.reserveCv) : 1;
  // runoff of opening reserves: each policy year pays down from its current age
  const runoff = opening.byPy.map(y => {
    const a0 = Math.round(y.age / 3);
    const p0 = pattern(a0, pat, P.paymentSpeed);
    const open = y.unpaid * P.reserveShock;
    // stochastic deterioration emerges over the first four quarters
    return { remaining: open, opening: open, drift: open * (resFactor - 1) / 4, a0, p0 };
  });
  // new policy years: one loss-ratio draw per year
  const years = [];
  for (let k = 0; k < Math.ceil(H / 4); k++) {
    const premium = annualPremium0 * Math.pow(1 + P.premiumGrowth, k);
    const lr = P.lossRatioCv > 0 ? rng.lognormalMeanCv(P.expectedLossRatio, P.lossRatioCv) : P.expectedLossRatio;
    let ultimate = premium * lr;
    const expected = premium * P.expectedLossRatio;
    if (P.aggregate) ultimate = Math.min(ultimate, expected * P.aggregateAttach);
    years.push({ premium, lr, ultimate, expected, paidToDate: 0, earnedQuarters: 0 });
  }
  const openingReserves = runoff.reduce((s, r) => s + r.remaining, 0);
  let assets = P.startingCapital + opening.unpaid; // assets back the booked reserves plus capital; deterioration hits capital
  const out = { assets: [assets], reserves: [openingReserves], capital: [assets - openingReserves], required: [], ratio: [], paid: [], premium: [], breached: false, breachQ: null, minRatio: Infinity, minRatioQ: 0, dividends: 0 };
  const req0 = P.requiredPremiumFactor * opening.latestPremium + P.requiredReserveFactor * openingReserves;
  out.required.push(req0); out.ratio.push(out.capital[0] / req0);
  out.minRatio = out.capital[0] / req0;
  if (out.minRatio < P.threshold) { out.breached = true; out.breachQ = 0; }
  const trailingPremium = new Array(4).fill(opening.latestPremium / 4);
  for (let q = 1; q <= H; q++) {
    const yr = years[Math.floor((q - 1) / 4)];
    const premiumQ = yr.premium / 4;
    const expenses = premiumQ * P.expenseRatio + (P.aggregate ? premiumQ * P.aggregateCost : 0);
    const income = assets * (P.investmentYield / 4);
    // paid on opening reserves
    let paid = 0;
    for (const r of runoff) {
      if (q <= 4) { r.remaining += r.drift; r.opening += r.drift; }
      const a = r.a0 + (q - 1), b = r.a0 + q;
      const remainingFrac = 1 - r.p0;
      const inc = remainingFrac > 0 ? (pattern(b, pat, P.paymentSpeed) - pattern(a, pat, P.paymentSpeed)) / remainingFrac : 0;
      const pay = Math.min(r.remaining, r.opening * inc);
      r.remaining -= pay; paid += pay;
    }
    // paid on new years: the policy-year pattern already carries the earning
    // lag, so each year pays down from its own inception.
    let reservesNew = 0;
    years.forEach((y, k) => {
      const firstQ = k * 4 + 1;
      if (q < firstQ) return;
      const age = q - firstQ; // quarters since inception, before this quarter
      const paidThisQ = y.ultimate * (pattern(age + 1, pat, P.paymentSpeed) - pattern(age, pat, P.paymentSpeed));
      y.paidToDate += paidThisQ; paid += paidThisQ;
      const earnedShare = Math.min(1, (age + 1) / 4);
      reservesNew += Math.max(0, y.ultimate * earnedShare - y.paidToDate);
    });
    assets += premiumQ - expenses - paid + income;
    const reserves = runoff.reduce((s, r) => s + r.remaining, 0) + reservesNew;
    trailingPremium.shift(); trailingPremium.push(premiumQ);
    const nwp = trailingPremium.reduce((s, v) => s + v, 0);
    let capital = assets - reserves;
    if (q % 4 === 0 && P.dividendPayout > 0) {
      const req = P.requiredPremiumFactor * nwp + P.requiredReserveFactor * reserves;
      const excess = capital - 1.5 * req;
      if (excess > 0) { const d = excess * P.dividendPayout; assets -= d; capital -= d; out.dividends += d; }
    }
    const required = P.requiredPremiumFactor * nwp + P.requiredReserveFactor * reserves;
    const ratio = capital / required;
    out.assets.push(assets); out.reserves.push(reserves); out.capital.push(capital); out.required.push(required); out.ratio.push(ratio); out.paid.push(paid); out.premium.push(premiumQ);
    if (ratio < out.minRatio) { out.minRatio = ratio; out.minRatioQ = q; }
    if (ratio < P.threshold && !out.breached) { out.breached = true; out.breachQ = q; }
  }
  return out;
}

function percentile(sorted, p) { const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }

export function simulate(params, opening, pat) {
  const P = { ...DEFAULTS, ...params };
  const rng = makeRng(P.seed);
  const paths = [];
  for (let i = 0; i < P.sims; i++) paths.push(simulatePath(P, opening, pat, rng));
  const H = P.horizonQuarters;
  const bands = key => {
    const out = { p5: [], p25: [], p50: [], p75: [], p95: [] };
    for (let q = 0; q <= H; q++) {
      const s = paths.map(p => p[key][q]).sort((a, b) => a - b);
      out.p5.push(percentile(s, 0.05)); out.p25.push(percentile(s, 0.25)); out.p50.push(percentile(s, 0.5)); out.p75.push(percentile(s, 0.75)); out.p95.push(percentile(s, 0.95));
    }
    return out;
  };
  const breachAny = paths.filter(p => p.breached).length / paths.length;
  const breachEnd = paths.filter(p => p.ratio[H] < P.threshold).length / paths.length;
  const minRatioMedian = percentile(paths.map(p => p.minRatio).sort((a, b) => a - b), 0.5);
  const minQ = (() => { const c = {}; for (const p of paths) c[p.minRatioQ] = (c[p.minRatioQ] || 0) + 1; return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]); })();
  const breachQ = (() => { const c = {}; for (const p of paths) if (p.breached) c[p.breachQ] = (c[p.breachQ] || 0) + 1; const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? Number(e[0][0]) : null; })();
  const median = key => { const s = paths.map(p => p[key][H]).sort((a, b) => a - b); return percentile(s, 0.5); };
  return {
    params: P, sims: P.sims, breachAny, breachEnd, minRatioMedian, minQ, breachQ,
    capital: bands('capital'), ratio: bands('ratio'), assets: bands('assets'), reserves: bands('reserves'),
    endCapitalMedian: median('capital'), endRatioMedian: median('ratio'), endReservesMedian: median('reserves'),
    dividendsMedian: percentile(paths.map(p => p.dividends).sort((a, b) => a - b), 0.5),
    lossRatioP95: percentile(paths.map(p => p.capital[H]).sort((a, b) => a - b), 0.05),
  };
}

// Smallest starting capital that keeps the any-quarter breach probability
// at or below `tolerance`. Bisection on startingCapital, common random numbers.
export function capitalForTolerance(params, opening, pat, tolerance = 0.05) {
  let lo = 0, hi = 60000000;
  const probe = c => simulate({ ...params, startingCapital: c, sims: Math.min(params.sims || 2000, 1000) }, opening, pat).breachAny;
  if (probe(hi) > tolerance) return { capital: null, tolerance };
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (probe(mid) <= tolerance) hi = mid; else lo = mid; }
  return { capital: hi, tolerance };
}
