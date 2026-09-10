// Contract insurance requirements against the programme.
//
// Every customer agreement, lease and subcontract a group signs carries an
// insurance clause. Almost nobody joins those clauses to the programme the
// group actually carries. This does: it finds every contract whose
// requirements the programme does not meet, values the revenue behind those
// contracts, and works out the cheapest set of buy-ups that clears the most.

import { makeRng } from '../../lib/rng.mjs';
import { dates } from '../../lib/format.mjs';
import { ENTITIES } from '../../data/book.mjs';

// The group programme, per entity. Limits in dollars; endorsements as flags.
export const PROGRAMME = {
  shared: { notice: 30, aiBlanket: true, wosBlanket: true, pncGL: true, cyber: 1000000 },
  entities: {
    NLL: { gl: { occ: 1000000, agg: 2000000 }, al: 1000000, el: 1000000, umbrella: 10000000, professional: 0, pollution: 0 },
    HFD: { gl: { occ: 1000000, agg: 2000000 }, al: 1000000, el: 1000000, umbrella: 5000000, professional: 0, pollution: 0 },
    CVS: { gl: { occ: 1000000, agg: 2000000 }, al: 1000000, el: 1000000, umbrella: 5000000, professional: 0, pollution: 0 },
    MHP: { gl: { occ: 1000000, agg: 3000000 }, al: 1000000, el: 1000000, umbrella: 5000000, professional: 2000000, pollution: 0 },
    SBG: { gl: { occ: 1000000, agg: 2000000 }, al: 1000000, el: 1000000, umbrella: 5000000, professional: 0, pollution: 0 },
  },
};

// Buy-up options, annual cost. Illustrative rate card.
export const BUYUPS = [
  { id: 'umb-10', name: 'Umbrella to $10m (entities at $5m)', cost: 48000, applies: (e) => e.umbrella < 10000000, effect: e => ({ ...e, umbrella: 10000000 }) },
  { id: 'umb-25', name: 'Umbrella to $25m (all entities)', cost: 135000, applies: (e) => e.umbrella < 25000000, effect: e => ({ ...e, umbrella: 25000000 }) },
  { id: 'poll-1', name: 'Pollution liability $1m', cost: 22000, applies: (e) => e.pollution < 1000000, effect: e => ({ ...e, pollution: 1000000 }) },
  { id: 'poll-5', name: 'Pollution liability $5m', cost: 61000, applies: (e) => e.pollution < 5000000, effect: e => ({ ...e, pollution: 5000000 }) },
  { id: 'prof-2', name: 'Professional liability $2m (entities without)', cost: 35000, applies: (e) => e.professional < 2000000, effect: e => ({ ...e, professional: 2000000 }) },
  { id: 'cyber-3', name: 'Cyber to $3m', cost: 18000, applies: (e, shared) => shared.cyber < 3000000, effect: (e, shared) => { shared.cyber = 3000000; return e; }, shared: true },
  { id: 'cyber-5', name: 'Cyber to $5m', cost: 34000, applies: (e, shared) => shared.cyber < 5000000, effect: (e, shared) => { shared.cyber = 5000000; return e; }, shared: true },
  { id: 'gl-occ-2', name: 'GL each occurrence to $2m', cost: 31000, applies: (e) => e.gl.occ < 2000000, effect: e => ({ ...e, gl: { ...e.gl, occ: 2000000 } }) },
  { id: 'gl-agg-4', name: 'GL aggregate to $4m', cost: 27000, applies: (e) => e.gl.agg < 4000000, effect: e => ({ ...e, gl: { ...e.gl, agg: 4000000 } }) },
];

const COUNTERPARTIES = ['Gulf Coast Terminals', 'Brazos Valley Foods', 'Pinecrest Property Trust', 'Trinity Municipal Utility', 'Redstone Energy Services', 'Lakeshore Hospitality', 'Westport Retail Partners', 'Cedar Ridge Medical', 'Bluebonnet Grocers', 'Northgate Industrial Park', 'Sable Point Logistics', 'Harrow & Finch Construction', 'Meadowbrook Senior Living', 'Coastal Bend Aggregates', 'Silverline Distribution', 'Prairie State Schools', 'Ironwood Manufacturing', 'Bayou City Ports', 'Clearwater Chemical', 'Summit County Public Works', 'Riverbend Clinics', 'Alamo Freight Exchange', 'Longhorn Cold Storage', 'Marigold Care Group', 'Palmetto Retail Centers'];

export function generateContracts({ seed = 'contracts-2026', asOf = '2026-08-31', count = 64 } = {}) {
  const rng = makeRng(seed);
  const types = [['Customer services agreement', 34], ['Lease', 18], ['Subcontract', 18], ['Supply agreement', 14], ['Government contract', 10], ['Healthcare services agreement', 6]];
  const out = [];
  for (let i = 0, tries = 0; out.length < count && tries < count * 4; tries++) {
    const type = rng.weighted(types);
    const entity = type === 'Healthcare services agreement' ? 'MHP' : rng.pick(ENTITIES).code;
    const value = Math.round(rng.lognormalMeanCv(type === 'Lease' ? 400000 : type === 'Government contract' ? 2500000 : 1400000, 1.1) / 10000) * 10000;
    const big = value > 2000000 || type === 'Government contract';
    const req = {
      glOcc: rng.weighted([[1000000, 70], [2000000, 30]]),
      glAgg: rng.weighted([[2000000, 90], [3000000, 6], [4000000, 3], [5000000, 1]]),
      al: rng.weighted([[1000000, 95], [2000000, 4], [5000000, 1]]),
      el: rng.weighted([[500000, 20], [1000000, 79], [2000000, 1]]),
      umbrella: rng.weighted([[0, 25], [2000000, 15], [5000000, 45], [10000000, big ? 12 : 4], [25000000, big ? 3 : 1]]),
      professional: type === 'Healthcare services agreement' ? rng.weighted([[1000000, 40], [2000000, 50], [3000000, 10]]) : rng.weighted([[0, 97], [1000000, 2], [2000000, 1]]),
      pollution: ['Subcontract', 'Government contract', 'Supply agreement'].includes(type) ? rng.weighted([[0, 80], [1000000, 15], [5000000, 5]]) : 0,
      cyber: rng.weighted([[0, 65], [1000000, 25], [3000000, 8], [5000000, 2]]),
      ai: rng.next() < 0.8, wos: rng.next() < 0.7, pnc: rng.next() < 0.6,
      notice: rng.weighted([[30, 60], [60, 30], [90, 10]]),
      indemnity: rng.weighted([['mutual', 45], ['one-way', 40], ['uncapped', 15]]),
    };
    const start = dates.addDays('2023-01-01', rng.int(0, 1200));
    const term = dates.addMonths(start, rng.weighted([[12, 30], [24, 30], [36, 30], [60, 10]]));
    if (term < asOf) continue;
    i = out.length;
    out.push({ id: `C-${String(i + 1).padStart(3, '0')}`, type, counterparty: COUNTERPARTIES[i % COUNTERPARTIES.length] + (i >= COUNTERPARTIES.length ? ` (${Math.floor(i / COUNTERPARTIES.length) + 1})` : ''), entity, value, start, term, req, holder: rng.next() < 0.5 });
  }
  return { seed, asOf, contracts: out };
}

// Gaps for one contract against a programme.
export function gaps(contract, programme = PROGRAMME) {
  const e = programme.entities[contract.entity], s = programme.shared, r = contract.req;
  const out = [];
  const lim = (key, label, have, want) => { if (want > have) out.push({ kind: have > 0 ? 'limit' : 'coverage', key, label, have, want, shortfall: want - have }); };
  lim('glOcc', 'General liability, each occurrence', e.gl.occ, r.glOcc);
  lim('glAgg', 'General liability, aggregate', e.gl.agg, r.glAgg);
  lim('al', 'Auto liability, combined single limit', e.al, r.al);
  lim('el', "Employer's liability", e.el, r.el);
  lim('umbrella', 'Umbrella / excess', e.umbrella, r.umbrella);
  lim('professional', 'Professional liability', e.professional, r.professional);
  lim('pollution', 'Pollution liability', e.pollution, r.pollution);
  lim('cyber', 'Cyber liability', s.cyber, r.cyber);
  if (r.ai && !s.aiBlanket) out.push({ kind: 'endorsement', key: 'ai', label: 'Additional insured' });
  if (r.wos && !s.wosBlanket) out.push({ kind: 'endorsement', key: 'wos', label: 'Waiver of subrogation' });
  if (r.pnc && !s.pncGL) out.push({ kind: 'endorsement', key: 'pnc', label: 'Primary and non-contributory' });
  if (r.notice > s.notice) out.push({ kind: 'notice', key: 'notice', label: `Notice of cancellation ${r.notice} days`, have: s.notice, want: r.notice });
  if (r.indemnity === 'uncapped') out.push({ kind: 'indemnity', key: 'indemnity', label: 'Uncapped indemnity' });
  return out;
}

export function analyseContracts(register, programme = PROGRAMME) {
  const rows = register.contracts.map(c => {
    const g = gaps(c, programme);
    const hard = g.filter(x => x.kind === 'limit' || x.kind === 'coverage');
    return { ...c, gaps: g, hard, soft: g.filter(x => !hard.includes(x)), atRisk: hard.length > 0, monthsLeft: Math.max(0, Math.round(dates.monthsBetween(register.asOf, c.term))) };
  });
  const atRisk = rows.filter(r => r.atRisk).sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const valueAtRisk = atRisk.reduce((s, r) => s + r.value, 0);
  // which requirement keys drive the most value
  const byKey = {};
  for (const r of atRisk) for (const g of r.hard) { const k = (byKey[g.key] ??= { key: g.key, label: g.label, contracts: 0, value: 0, maxWant: 0 }); k.contracts++; k.value += r.value; k.maxWant = Math.max(k.maxWant, g.want); }
  const drivers = Object.values(byKey).sort((a, b) => b.value - a.value);
  const uncapped = rows.filter(r => r.gaps.some(g => g.kind === 'indemnity'));
  const notice = rows.filter(r => r.gaps.some(g => g.kind === 'notice'));
  const expiring = rows.filter(r => r.monthsLeft <= 6);
  return { rows, atRisk, totalValue, valueAtRisk, drivers, uncapped, notice, expiring, asOf: register.asOf };
}

// Greedy plan: repeatedly buy the option that clears the most contract value
// per dollar of premium, until nothing more clears or the budget is spent.
export function buyUpPlan(register, { programme = PROGRAMME, budget = Infinity } = {}) {
  let prog = JSON.parse(JSON.stringify(programme));
  const steps = [];
  let spent = 0;
  const cleared = () => analyseContracts(register, prog).valueAtRisk;
  let current = cleared();
  const start = current;
  for (let i = 0; i < 6; i++) {
    let best = null;
    for (const b of BUYUPS) {
      if (steps.some(s => s.id === b.id) || spent + b.cost > budget) continue;
      const trial = JSON.parse(JSON.stringify(prog));
      let applied = false;
      for (const code of Object.keys(trial.entities)) if (b.applies(trial.entities[code], trial.shared)) { trial.entities[code] = b.effect(trial.entities[code], trial.shared); applied = true; if (b.shared) break; }
      if (!applied) continue;
      const after = analyseContracts(register, trial).valueAtRisk;
      const gain = current - after;
      if (gain <= 0) continue;
      const ratio = gain / b.cost;
      if (!best || ratio > best.ratio) best = { id: b.id, name: b.name, cost: b.cost, gain, ratio, after, trial };
    }
    if (!best) break;
    prog = best.trial; spent += best.cost; current = best.after;
    steps.push({ id: best.id, name: best.name, cost: best.cost, clears: best.gain, remaining: best.after, cumulativeCost: spent });
  }
  return { steps, spent, start, remaining: current, programme: prog };
}

// A certificate draft for one contract from the programme, with the gaps noted.
export function certificate(contract, programme = PROGRAMME) {
  const e = programme.entities[contract.entity], s = programme.shared;
  const ent = ENTITIES.find(x => x.code === contract.entity);
  const g = gaps(contract, programme);
  const line = (label, limit, req, extra = '') => ({ label, limit, required: req, ok: !req || limit >= req, extra });
  return {
    insured: ent.name, holder: contract.counterparty, contract: contract.id, type: contract.type,
    coverages: [
      line('Commercial general liability, each occurrence', e.gl.occ, contract.req.glOcc, s.aiBlanket && contract.req.ai ? 'Additional insured, blanket where required by written contract' : ''),
      line('Commercial general liability, general aggregate', e.gl.agg, contract.req.glAgg, s.pncGL && contract.req.pnc ? 'Primary and non-contributory' : ''),
      line('Automobile liability, combined single limit', e.al, contract.req.al),
      line("Workers' compensation", 'Statutory', 0),
      line("Employer's liability, each accident / disease", e.el, contract.req.el, s.wosBlanket && contract.req.wos ? 'Waiver of subrogation, blanket' : ''),
      line('Umbrella / excess liability', e.umbrella, contract.req.umbrella),
      ...(contract.req.professional || e.professional ? [line('Professional liability', e.professional, contract.req.professional)] : []),
      ...(contract.req.pollution || e.pollution ? [line('Pollution liability', e.pollution, contract.req.pollution)] : []),
      ...(contract.req.cyber ? [line('Cyber liability', s.cyber, contract.req.cyber)] : []),
    ],
    notice: s.notice, noticeRequired: contract.req.notice,
    gaps: g, satisfies: g.filter(x => x.kind !== 'indemnity').length === 0,
  };
}
