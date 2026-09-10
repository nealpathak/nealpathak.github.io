// A synthetic captive insurance book, generated from a seed.
//
// Nothing here derives from any real insurer, insured, or claimant. The
// captive writes three lines (workers' compensation, general liability, auto
// liability) for five operating companies, with policy years running
// 1 September to 31 August and an evaluation date of 31 August 2026.
//
// The generator produces the full ground truth (including claims not yet
// reported at the evaluation date) so that the tools built on it can be
// checked against what "really" happened.

import { makeRng } from '../lib/rng.mjs';
import { dates } from '../lib/format.mjs';

export const DEFAULT_SEED = 'captive-book-2026';
export const EVALUATION_DATE = '2026-08-31';
export const POLICY_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
export const RETENTION = 250000; // captive's per-occurrence retention

export const ENTITIES = [
  { code: 'NLL', name: 'Northline Logistics', aliases: ['Northline Logistics LLC', 'NORTHLINE LOGISTICS', 'Northline Log.'], payroll: 42, revenue: 210, vehicles: 380, states: [['TX', 55], ['LA', 15], ['OK', 15], ['NM', 10], ['AR', 5]] },
  { code: 'HFD', name: 'Harbor Foods', aliases: ['Harbor Foods Inc', 'HARBOR FOODS', 'Harbor Foods, Inc.'], payroll: 36, revenue: 320, vehicles: 120, states: [['TX', 70], ['LA', 20], ['OK', 10]] },
  { code: 'CVS', name: 'Crestview Services', aliases: ['Crestview Services Group', 'CRESTVIEW SVCS', 'Crestview'], payroll: 28, revenue: 95, vehicles: 210, states: [['TX', 60], ['CO', 20], ['NM', 20]] },
  { code: 'MHP', name: 'Meridian Health Partners', aliases: ['Meridian Health', 'MERIDIAN HEALTH PARTNERS', 'Meridian Health Partners LLC'], payroll: 55, revenue: 180, vehicles: 40, states: [['TX', 80], ['OK', 20]] },
  { code: 'SBG', name: 'Summit Build Group', aliases: ['Summit Build', 'SUMMIT BUILD GRP', 'Summit Build Group Inc.'], payroll: 31, revenue: 140, vehicles: 160, states: [['TX', 50], ['LA', 20], ['AR', 15], ['OK', 15]] },
];

export const LINES = {
  WC: {
    code: 'WC', name: "Workers' Compensation",
    exposure: 'payroll', freqPerUnit: 0.57, // claims per $1m payroll
    sevMean: 26000, sevCv: 2.3, reportLagMean: 14,
    capFactor: 0.95, // E[min(X, retention)] / E[X], measured across seeds
    pattern: [[0, 0], [3, 0.12], [6, 0.25], [12, 0.42], [18, 0.55], [24, 0.65], [36, 0.78], [48, 0.87], [60, 0.93], [72, 0.97], [84, 0.99], [96, 1]],
    causes: [['Strain / lifting', 34], ['Slip, trip or fall', 22], ['Struck by object', 16], ['Motor vehicle', 10], ['Repetitive motion', 10], ['Cut or puncture', 8]],
    litigationBase: 0.06,
  },
  GL: {
    code: 'GL', name: 'General Liability',
    exposure: 'revenue', freqPerUnit: 0.075, // claims per $1m revenue
    sevMean: 21000, sevCv: 2.6, reportLagMean: 48,
    capFactor: 0.90,
    pattern: [[0, 0], [6, 0.05], [12, 0.15], [18, 0.3], [24, 0.45], [36, 0.68], [48, 0.84], [60, 0.93], [72, 0.98], [96, 1]],
    causes: [['Premises slip or fall', 38], ['Bodily injury, other', 22], ['Property damage', 25], ['Product', 9], ['Contractual', 6]],
    litigationBase: 0.18,
  },
  AL: {
    code: 'AL', name: 'Auto Liability',
    exposure: 'vehicles', freqPerUnit: 0.105, // claims per vehicle
    sevMean: 17000, sevCv: 2.1, reportLagMean: 9,
    capFactor: 0.95,
    pattern: [[0, 0], [3, 0.2], [6, 0.38], [12, 0.6], [18, 0.75], [24, 0.85], [36, 0.94], [48, 0.98], [60, 1]],
    causes: [['Rear-end collision', 36], ['Intersection', 22], ['Backing', 14], ['Single vehicle', 12], ['Sideswipe', 10], ['Cargo', 6]],
    litigationBase: 0.12,
  },
};

const ADJUSTERS = ['R. Alvarez', 'K. Okafor', 'M. Lindqvist', 'S. Patel', 'D. Whitcombe', 'J. Nakamura'];
const FIRST = ['Ana', 'Marcus', 'Priya', 'Devon', 'Lena', 'Tomas', 'Grace', 'Omar', 'Chloe', 'Isaac', 'Ruth', 'Felix', 'Nadia', 'Cole', 'Ivy', 'Rafael', 'June', 'Theo', 'Mara', 'Silas'];
const LAST = ['Reyes', 'Bennett', 'Sharma', 'Okoro', 'Kowalski', 'Nguyen', 'Delgado', 'Foster', 'Haddad', 'Lindgren', 'Mbeki', 'Quinn', 'Ortiz', 'Vance', 'Ishikawa', 'Brandt', 'Calloway', 'Duarte', 'Ferris', 'Grant'];

function interp(pattern, t) {
  if (t <= 0) return 0;
  for (let i = 1; i < pattern.length; i++) {
    const [t0, f0] = pattern[i - 1], [t1, f1] = pattern[i];
    if (t <= t1) return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
  }
  return 1;
}

export function policyYearStart(py) { return `${py}-09-01`; }
export function policyYearEnd(py) { return `${py + 1}-08-31`; }
export function policyYearOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 9 ? y : y - 1;
}
export function policyYearLabel(py) { return `${py}–${String(py + 1).slice(2)}`; }

function round2(v) { return Math.round(v * 100) / 100; }

export function generateBook({ seed = DEFAULT_SEED, evaluationDate = EVALUATION_DATE } = {}) {
  const rng = makeRng(seed);
  const claims = [];
  const policies = [];
  let seq = 0;

  for (const py of POLICY_YEARS) {
    const growth = Math.pow(1.045, py - 2018);
    const trend = Math.pow(1.05, py - 2018); // severity trend
    for (const lineCode of Object.keys(LINES)) {
      const line = LINES[lineCode];
      let expectedRetained = 0; // priced on expectation, not on the realised claims
      for (const ent of ENTITIES) {
        const units = ent[line.exposure] * growth;
        const lambda = units * line.freqPerUnit;
        expectedRetained += lambda * line.sevMean * trend * line.capFactor;
        const n = rng.poisson(lambda);
        for (let k = 0; k < n; k++) {
          seq++;
          const lossDay = rng.int(0, dates.daysBetween(policyYearStart(py), policyYearEnd(py)));
          const lossDate = dates.addDays(policyYearStart(py), lossDay);
          const lag = Math.min(720, Math.round(rng.exponential(1 / line.reportLagMean)));
          const reportDate = dates.addDays(lossDate, lag);
          const groundUp = round2(Math.max(150, rng.lognormalMeanCv(line.sevMean * trend, line.sevCv)));
          const retained = Math.min(groundUp, RETENTION);
          const litigated = rng.next() < line.litigationBase * (groundUp > 50000 ? 3 : groundUp > 15000 ? 1.6 : 0.6);
          // Small claims settle fast, large ones slowly; the line's aggregate
          // payment pattern emerges from the mix.
          const speed = Math.min(8, Math.max(0.6, 2.2 * Math.pow(line.sevMean * trend / groundUp, 0.4))) * Math.max(0.4, rng.lognormalMeanCv(1, 0.35));
          const id = `${lineCode}-${py}-${String(seq).padStart(5, '0')}`;
          const claim = {
            id, py, line: lineCode, entity: ent.code,
            state: rng.weighted(ent.states),
            claimant: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
            lossDate, reportDate, cause: rng.weighted(line.causes),
            litigated, adjuster: rng.pick(ADJUSTERS),
            groundUpUltimate: groundUp, retainedUltimate: round2(retained),
            events: [],
          };
          buildEvents(claim, line, speed, rng);
          claims.push(claim);
        }
      }
      policies.push({
        py, line: lineCode,
        expectedLoss: Math.round(expectedRetained / 1000) * 1000,
        premium: Math.round(expectedRetained * 1.38 / 1000) * 1000,
        aggregate: Math.round(expectedRetained * 1.25 / 50000) * 50000,
        retention: RETENTION,
      });
    }
  }
  claims.sort((a, b) => dates.cmp(a.lossDate, b.lossDate) || dates.cmp(a.id, b.id));
  return { seed, evaluationDate, entities: ENTITIES, lines: LINES, policies, claims };
}

// Build the payment and reserve history of one claim. Events past the
// evaluation date are kept so that a "prior run" snapshot and the true
// ultimate are both available.
function buildEvents(claim, line, speed, rng) {
  const ult = claim.retainedUltimate;
  const F = t => interp(line.pattern, t * speed);
  const schedule = [0.5, 1.5, 3, 6, 9, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96];
  const events = [];
  const adequacy = Math.max(0.15, rng.lognormalMeanCv(0.8, 0.45));
  events.push({ date: claim.reportDate, type: 'reserve', paid: 0, outstanding: round2(Math.max(500, ult * adequacy)) });
  let prevF = 0, cumPaid = 0, closedDate = null;
  for (const m of schedule) {
    const f = F(m);
    const inc = round2(ult * (f - prevF));
    prevF = f;
    if (inc < 1 && f < 1) continue;
    const date = dates.addDays(dates.addMonths(claim.reportDate, Math.floor(m)), Math.round((m % 1) * 30) + rng.int(-8, 8));
    const before = cumPaid;
    cumPaid = round2(cumPaid + inc);
    if (f >= 0.97 || cumPaid >= ult - 0.5) {
      events.push({ date, type: 'close', paid: round2(ult - before), outstanding: 0 });
      closedDate = date;
      break;
    }
    events.push({ date, type: 'payment', paid: inc, outstanding: null });
  }
  for (let m = 6, k = 0; m <= 96; m += 6, k++) {
    const date = dates.addDays(dates.addMonths(claim.reportDate, m), rng.int(-5, 5));
    if (closedDate && date >= closedDate) break;
    const paidToDate = events.filter(e => e.date <= date && e.paid).reduce((s, e) => s + e.paid, 0);
    const target = Math.max(0, ult - paidToDate);
    const noise = rng.normal(0, 0.35 * Math.pow(0.7, k));
    events.push({ date, type: 'reserve', paid: 0, outstanding: round2(Math.max(0, target * (1 + noise))) });
  }
  if (closedDate && rng.next() < (line.code === 'WC' ? 0.035 : 0.015)) {
    const reopenDate = dates.addDays(closedDate, rng.int(120, 420));
    const extra = round2(ult * rng.uniform(0.03, 0.12));
    events.push({ date: reopenDate, type: 'reopen', paid: 0, outstanding: extra });
    events.push({ date: dates.addDays(reopenDate, rng.int(60, 150)), type: 'payment', paid: round2(extra * 0.6), outstanding: null });
    events.push({ date: dates.addDays(reopenDate, rng.int(160, 300)), type: 'close', paid: round2(extra - round2(extra * 0.6)), outstanding: 0 });
    claim.retainedUltimate = round2(ult + extra);
    claim.groundUpUltimate = round2(claim.groundUpUltimate + extra);
  }
  events.sort((a, b) => dates.cmp(a.date, b.date));
  let paid = 0, outstanding = 0, status = 'Open';
  for (const e of events) {
    paid = round2(paid + e.paid);
    if (e.outstanding !== null) outstanding = e.outstanding;
    if (e.type === 'payment') outstanding = round2(Math.max(0, outstanding - e.paid));
    if (e.type === 'close') { outstanding = 0; status = 'Closed'; }
    if (e.type === 'reopen') status = 'Reopened';
    e.cumPaid = paid; e.cumOutstanding = outstanding; e.status = status;
  }
  claim.events = events;
}

// State of every reported claim as of a date.
export function snapshot(book, asOf = book.evaluationDate) {
  const out = [];
  for (const c of book.claims) {
    if (c.reportDate > asOf) continue;
    let last = null;
    for (const e of c.events) { if (e.date <= asOf) last = e; else break; }
    const paid = last ? last.cumPaid : 0;
    const outstanding = last ? last.cumOutstanding : 0;
    const status = last ? last.status : 'Open';
    let closedDate = null;
    if (status === 'Closed') {
      const closes = c.events.filter(e => e.type === 'close' && e.date <= asOf);
      closedDate = closes[closes.length - 1].date;
    }
    out.push({
      id: c.id, py: c.py, line: c.line, entity: c.entity, state: c.state, claimant: c.claimant,
      lossDate: c.lossDate, reportDate: c.reportDate, cause: c.cause, litigated: c.litigated, adjuster: c.adjuster,
      status, closedDate, paid, outstanding, incurred: round2(paid + outstanding),
    });
  }
  return out;
}

// Age 12 = the first 31 August after policy inception.
export function valuationDate(py, ageMonths) { return dates.addDays(dates.addMonths(policyYearStart(py), ageMonths), -1); }

export function triangles(book, { line = null, ages = [12, 24, 36, 48, 60, 72, 84, 96], measure = 'incurred' } = {}) {
  const rows = [];
  for (const py of POLICY_YEARS) {
    const row = { py, values: [] };
    for (const age of ages) {
      const asOf = valuationDate(py, age);
      if (asOf > book.evaluationDate) { row.values.push(null); continue; }
      let sum = 0;
      for (const c of book.claims) {
        if (c.py !== py || (line && c.line !== line) || c.reportDate > asOf) continue;
        let last = null;
        for (const e of c.events) { if (e.date <= asOf) last = e; else break; }
        if (!last) continue;
        sum += measure === 'paid' ? last.cumPaid : last.cumPaid + last.cumOutstanding;
      }
      row.values.push(round2(sum));
    }
    rows.push(row);
  }
  return { ages, rows };
}

export function trueUltimates(book, line = null) {
  const out = {};
  for (const py of POLICY_YEARS) out[py] = 0;
  for (const c of book.claims) if (!line || c.line === line) out[c.py] = round2(out[c.py] + c.retainedUltimate);
  return out;
}

// Exposure base for an entity, line and policy year (payroll $m, revenue $m,
// or vehicle count), on the same growth path the generator uses.
export function exposureFor(entityCode, lineCode, py) {
  const ent = ENTITIES.find(e => e.code === entityCode);
  const line = LINES[lineCode];
  return ent[line.exposure] * Math.pow(1.045, py - 2018);
}
export const EXPOSURE_UNITS = { payroll: '$1m payroll', revenue: '$1m revenue', vehicles: 'vehicle' };
