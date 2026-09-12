// The renewal as a cost and time model. Seven steps, each run two ways:
// as it is usually done, and as a pipeline with people at named gates.
// Every number here is a default the reader can change on the page; the
// headline is computed from whatever they enter, never typed.

export const ROLES = {
  rm: { name: 'Risk manager', rate: 150 },
  analyst: { name: 'Analyst', rate: 75 },
  opco: { name: 'Operating company finance', rate: 90 },
  cfo: { name: 'Operating company CFO', rate: 200 },
  cm: { name: 'Captive manager', rate: 250 },
  actuary: { name: 'Consulting actuary', rate: 350 },
  counsel: { name: 'Outside counsel', rate: 500 },
};

export const DAYS_PER_WEEK = 5;

// Steps. `after` lists the steps a step waits for; elapsed is business days.
// `floor` names a shared waiting time added to the step's own days.
export const STEPS = [
  {
    id: 'data', n: 1, name: 'Data call',
    today: { hours: { analyst: 20, rm: 8, opco: 30 }, days: 15, after: [] },
    ai: { hours: { rm: 2, opco: 7.5 }, days: 3, after: [] },
  },
  {
    id: 'clean', n: 2, name: 'Loss run standardised and reconciled',
    today: { hours: { analyst: 30, rm: 4 }, days: 5, after: ['data'] },
    ai: { hours: { rm: 1 }, days: 0.5, after: ['data'] },
  },
  {
    id: 'actuarial', n: 3, name: 'Projection, erosion and capital',
    today: { hours: { analyst: 8, rm: 6 }, fees: { actuaryReport: 1 }, days: 20, after: ['clean'] },
    ai: { hours: { rm: 4 }, fees: { actuaryReview: 1 }, days: 5, after: ['clean'] },
  },
  {
    id: 'allocation', n: 4, name: 'Premium allocation',
    today: { hours: { rm: 36, cfo: 10 }, days: 10, after: ['actuarial'] },
    ai: { hours: { rm: 4, cfo: 2.5 }, days: 5, after: ['actuarial'] },
  },
  {
    id: 'submission', n: 5, name: 'Reinsurance submission and quotes',
    today: { hours: { rm: 24, analyst: 12, actuary: 4 }, days: 5, floor: 'marketDays', after: ['actuarial'] },
    ai: { hours: { rm: 6 }, days: 1, floor: 'marketDays', after: ['actuarial'] },
  },
  {
    id: 'board', n: 6, name: 'Board pack and approval',
    today: { hours: { rm: 16, analyst: 8, cm: 6 }, days: 5, floor: 'boardDays', after: ['allocation', 'submission'] },
    ai: { hours: { rm: 2, cm: 1 }, days: 1, floor: 'boardDays', after: ['allocation', 'submission'] },
  },
  {
    id: 'bind', n: 7, name: 'Bind, issue, file, certificate',
    today: { hours: { rm: 6, analyst: 10, cm: 6, counsel: 3 }, days: 10, after: ['board'] },
    ai: { hours: { rm: 2, cm: 2, counsel: 1 }, days: 3, after: ['board'] },
  },
];

export const FEES = {
  actuaryReport: { name: 'Actuarial renewal report, fixed fee', amount: 30000 },
  actuaryReview: { name: 'Actuarial review and opinion on the engines, fixed fee', amount: 10000 },
};

export const FLOORS = {
  marketDays: { name: 'Days the reinsurance market takes to quote', days: 20 },
  boardDays: { name: 'Days from pack to board meeting', days: 5 },
};

export const SYSTEM = {
  build: { name: 'One-off cost to build the pipeline', amount: 75000 },
  run: { name: 'Annual cost to run it', amount: 12000 },
};

// A full, editable copy of every default.
export function defaults() {
  return {
    rates: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.rate])),
    fees: Object.fromEntries(Object.entries(FEES).map(([k, f]) => [k, f.amount])),
    floors: Object.fromEntries(Object.entries(FLOORS).map(([k, f]) => [k, f.days])),
    system: { build: SYSTEM.build.amount, run: SYSTEM.run.amount },
    steps: Object.fromEntries(STEPS.map(s => [s.id, {
      today: { hours: { ...s.today.hours }, days: s.today.days },
      ai: { hours: { ...s.ai.hours }, days: s.ai.days },
    }])),
  };
}

function trackResult(track, a) {
  const rows = [];
  const end = {};
  for (const s of STEPS) {
    const def = s[track];
    const edit = a.steps[s.id][track];
    const hours = edit.hours;
    const people = Object.entries(hours).reduce((sum, [role, h]) => sum + h * a.rates[role], 0);
    const fees = Object.entries(def.fees || {}).reduce((sum, [fee, n]) => sum + n * a.fees[fee], 0);
    const totalHours = Object.values(hours).reduce((sum, h) => sum + h, 0);
    const days = edit.days + (def.floor ? a.floors[def.floor] : 0);
    const start = def.after.length ? Math.max(...def.after.map(id => end[id])) : 0;
    end[s.id] = start + days;
    rows.push({ id: s.id, n: s.n, name: s.name, hours, totalHours, people, fees, cost: people + fees, days, ownDays: edit.days, floorDays: def.floor ? a.floors[def.floor] : 0, start, end: end[s.id] });
  }
  const elapsedDays = Math.max(...rows.map(r => r.end));
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  const byRole = {};
  for (const r of rows) for (const [role, h] of Object.entries(r.hours)) byRole[role] = (byRole[role] || 0) + h;
  return { rows, elapsedDays, elapsedWeeks: elapsedDays / DAYS_PER_WEEK, hours: sum('totalHours'), people: sum('people'), fees: sum('fees'), cost: sum('cost'), byRole };
}

export function compute(a = defaults()) {
  const today = trackResult('today', a);
  const ai = trackResult('ai', a);
  const saving = today.cost - ai.cost;
  const waiting = ai.rows.reduce((s, r) => s + r.floorDays, 0);
  return {
    today, ai,
    saving,
    savingPct: today.cost ? saving / today.cost : 0,
    hoursPct: today.hours ? (today.hours - ai.hours) / today.hours : 0,
    elapsedPct: today.elapsedDays ? (today.elapsedDays - ai.elapsedDays) / today.elapsedDays : 0,
    waitingDays: waiting,
    paybackCycles: saving > 0 ? (a.system.build) / Math.max(1, saving - a.system.run) : null,
  };
}

export function weeks(days) {
  const w = days / DAYS_PER_WEEK;
  return w < 1 ? `${Math.round(days * 10) / 10} days` : `${Math.round(w * 10) / 10} weeks`;
}
