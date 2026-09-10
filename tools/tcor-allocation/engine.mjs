// Total cost of risk by operating company, and the premium each should pay.
//
// Every owner of an operating company asks the same two questions of the
// captive: what does risk actually cost my business, and why is my premium
// what it is. This computes both from the book, and proposes next year's
// allocation with the experience credibility and the cap as visible knobs.

import { snapshot, POLICY_YEARS, ENTITIES, LINES, exposureFor } from '../../data/book.mjs';
import { analyse } from '../loss-development/engine.mjs';

export const DEFAULTS = {
  credibilityK: 250,        // claims needed for 50% credibility
  windowYears: 5,           // experience window, excluding the greenest year
  cap: 0.25,                // maximum change from an exposure-based allocation
  excessRate: 0.08,         // excess/aggregate premium as a share of captive premium
  handlingPerClaim: 850,    // administrator fee per claim
  adminRate: 0.06,          // captive management, fronting, taxes as a share of premium
  bfThroughAge: 24,
};

// Per entity, line and policy year: reported, developed, and cost components.
export function costOfRisk(book, params = {}) {
  const P = { ...DEFAULTS, ...params };
  const snap = snapshot(book);
  const lines = Object.keys(LINES);
  const dev = Object.fromEntries(lines.map(lc => [lc, analyse(book, { line: lc, bfThroughAge: P.bfThroughAge }).perLine[lc]]));
  const cells = [];
  for (const py of POLICY_YEARS) for (const lc of lines) {
    const year = dev[lc].years.find(y => y.py === py);
    const pol = book.policies.find(p => p.py === py && p.line === lc);
    const totalExposure = ENTITIES.reduce((s, e) => s + exposureFor(e.code, lc, py), 0);
    for (const e of ENTITIES) {
      const claims = snap.filter(c => c.py === py && c.line === lc && c.entity === e.code);
      const latest = claims.reduce((s, c) => s + c.incurred, 0);
      const paid = claims.reduce((s, c) => s + c.paid, 0);
      const exposure = exposureFor(e.code, lc, py);
      const share = exposure / totalExposure;
      const apriori = pol.expectedLoss * share;
      const pctDeveloped = year.pctDeveloped;
      const cl = latest * year.cdf;
      const bf = latest + apriori * (1 - pctDeveloped);
      const selected = year.age <= P.bfThroughAge ? bf : cl;
      const premium = pol.premium * share; // how the captive has allocated historically: by exposure
      cells.push({
        py, line: lc, entity: e.code, exposure, share, claims: claims.length, open: claims.filter(c => c.status !== 'Closed').length,
        latest, paid, apriori, selected, premium,
        excess: premium * P.excessRate, handling: claims.length * P.handlingPerClaim, admin: premium * P.adminRate,
        get tcor() { return this.selected + this.excess + this.handling + this.admin; },
        lossRate: selected / exposure, expectedRate: apriori / exposure,
      });
    }
  }
  return { cells, dev, params: P };
}

export function byEntityYear(cor) {
  const out = {};
  for (const c of cor.cells) {
    const k = `${c.entity}|${c.py}`;
    const o = (out[k] ??= { entity: c.entity, py: c.py, claims: 0, open: 0, latest: 0, selected: 0, premium: 0, excess: 0, handling: 0, admin: 0, tcor: 0, apriori: 0 });
    for (const f of ['claims', 'open', 'latest', 'selected', 'premium', 'excess', 'handling', 'admin', 'tcor', 'apriori']) o[f] += c[f];
  }
  return Object.values(out);
}

// Next year's premium allocation by line: exposure share, adjusted by each
// entity's credibility-weighted experience, capped, and renormalised so the
// line's premium is fully allocated.
export function allocate(book, cor, params = {}) {
  const P = { ...DEFAULTS, ...params };
  const nextPy = POLICY_YEARS[POLICY_YEARS.length - 1] + 1;
  const growth = 1.045;
  const lines = Object.keys(LINES);
  const window = POLICY_YEARS.slice(-P.windowYears - 1, -1); // exclude the greenest year
  const perLine = {};
  for (const lc of lines) {
    const latestPol = book.policies.find(p => p.py === nextPy - 1 && p.line === lc);
    const linePremium = Math.round(latestPol.premium * growth / 1000) * 1000;
    const totalExposure = ENTITIES.reduce((s, e) => s + exposureFor(e.code, lc, nextPy), 0);
    // line loss rate over the window
    const winCells = cor.cells.filter(c => c.line === lc && window.includes(c.py));
    const lineRate = winCells.reduce((s, c) => s + c.selected, 0) / winCells.reduce((s, c) => s + c.exposure, 0);
    const rows = ENTITIES.map(e => {
      const mine = winCells.filter(c => c.entity === e.code);
      const n = mine.reduce((s, c) => s + c.claims, 0);
      const rate = mine.reduce((s, c) => s + c.selected, 0) / mine.reduce((s, c) => s + c.exposure, 0);
      const relativity = rate / lineRate;
      const credibility = n / (n + P.credibilityK);
      const adjusted = credibility * relativity + (1 - credibility);
      const exposure = exposureFor(e.code, lc, nextPy);
      const share = exposure / totalExposure;
      return { entity: e.code, line: lc, exposure, share, claims: n, rate, lineRate, relativity, credibility, adjusted, exposureBased: linePremium * share, raw: linePremium * share * adjusted };
    });
    // renormalise, then cap against the exposure-based figure, iterating
    let alloc = rows.map(r => r.raw);
    for (let it = 0; it < 12; it++) {
      const sum = alloc.reduce((s, v) => s + v, 0);
      alloc = alloc.map(v => v * linePremium / sum);
      alloc = alloc.map((v, i) => Math.min(rows[i].exposureBased * (1 + P.cap), Math.max(rows[i].exposureBased * (1 - P.cap), v)));
    }
    const sum = alloc.reduce((s, v) => s + v, 0);
    alloc = alloc.map(v => v * linePremium / sum);
    rows.forEach((r, i) => { r.allocated = alloc[i]; r.change = alloc[i] - r.exposureBased; r.changePct = r.change / r.exposureBased; r.capped = Math.abs(Math.abs(r.changePct) - P.cap) < 0.005; });
    perLine[lc] = { line: lc, premium: linePremium, lineRate, rows };
  }
  // roll up by entity
  const byEntity = ENTITIES.map(e => {
    const rs = lines.map(lc => perLine[lc].rows.find(r => r.entity === e.code));
    const sum = k => rs.reduce((s, r) => s + r[k], 0);
    return { entity: e.code, name: e.name, exposureBased: sum('exposureBased'), allocated: sum('allocated'), change: sum('allocated') - sum('exposureBased'), changePct: (sum('allocated') - sum('exposureBased')) / sum('exposureBased'), claims: sum('claims'), lines: rs };
  });
  const moved = byEntity.reduce((s, e) => s + Math.max(0, e.change), 0);
  const total = byEntity.reduce((s, e) => s + e.allocated, 0);
  return { nextPy, window, perLine, byEntity, moved, total, params: P };
}

// The subsidy question: over the window, how much premium did each entity
// pay against the losses it generated?
export function subsidy(cor, window) {
  return ENTITIES.map(e => {
    const cells = cor.cells.filter(c => c.entity === e.code && window.includes(c.py));
    const premium = cells.reduce((s, c) => s + c.premium, 0);
    const losses = cells.reduce((s, c) => s + c.selected, 0);
    const expected = cells.reduce((s, c) => s + c.apriori, 0);
    return { entity: e.code, name: e.name, premium, losses, expected, lossRatio: losses / premium, ratioToExpected: losses / expected, balance: premium - losses };
  });
}
