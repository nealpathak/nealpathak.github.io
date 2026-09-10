// Matter portfolio: legal operations analytics and intake triage.
//
// A synthetic portfolio of litigation and transactional matters with
// outside-counsel invoices. The engine projects which matters will exceed
// budget, measures billing against guideline rates, finds matters stuck in
// a stage, and routes new intake by rule with the reasoning shown.

import { makeRng } from '../../lib/rng.mjs';
import { dates } from '../../lib/format.mjs';
import { ENTITIES, RETENTION } from '../../data/book.mjs';

export const MATTER_TYPES = {
  'auto-bi': { name: 'Auto bodily injury', line: 'AL', stages: ['Intake', 'Investigation', 'Pleadings', 'Discovery', 'Mediation', 'Trial prep'], stageCost: [1500, 6000, 9000, 28000, 12000, 45000], stageDays: [10, 45, 60, 180, 45, 120], budget: 55000, exposureMean: 90000 },
  'premises': { name: 'Premises liability', line: 'GL', stages: ['Intake', 'Investigation', 'Pleadings', 'Discovery', 'Mediation', 'Trial prep'], stageCost: [1500, 5000, 8000, 24000, 10000, 40000], stageDays: [10, 40, 60, 160, 40, 110], budget: 48000, exposureMean: 70000 },
  'employment': { name: 'Employment', line: 'GL', stages: ['Intake', 'Investigation', 'Agency charge', 'Pleadings', 'Discovery', 'Mediation'], stageCost: [2000, 9000, 12000, 10000, 35000, 15000], stageDays: [7, 60, 150, 60, 200, 45], budget: 70000, exposureMean: 120000 },
  'contract': { name: 'Contract dispute', line: null, stages: ['Intake', 'Demand', 'Negotiation', 'Pleadings', 'Discovery', 'Mediation'], stageCost: [1000, 3000, 6000, 9000, 26000, 10000], stageDays: [7, 30, 60, 60, 170, 40], budget: 40000, exposureMean: 150000 },
  'subrogation': { name: 'Subrogation recovery', line: 'AL', stages: ['Intake', 'Demand', 'Negotiation', 'Suit'], stageCost: [500, 1500, 3000, 12000], stageDays: [7, 45, 60, 180], budget: 12000, exposureMean: 30000 },
  'wc-appeal': { name: 'Workers\' comp dispute', line: 'WC', stages: ['Intake', 'Investigation', 'Hearing prep', 'Hearing', 'Appeal'], stageCost: [1000, 4000, 8000, 6000, 15000], stageDays: [7, 40, 90, 30, 120], budget: 25000, exposureMean: 60000 },
};

export const FIRMS = [
  { id: 'inhouse', name: 'In-house', panel: false, rateMultiplier: 0 },
  { id: 'firm-a', name: 'Panel firm A', panel: true, rateMultiplier: 1.0, discipline: 0.95 },
  { id: 'firm-b', name: 'Panel firm B', panel: true, rateMultiplier: 1.12, discipline: 0.8 },
  { id: 'firm-c', name: 'Panel firm C', panel: true, rateMultiplier: 0.98, discipline: 0.9 },
  { id: 'firm-d', name: 'Panel firm D', panel: true, rateMultiplier: 1.25, discipline: 0.6 },
  { id: 'tpa', name: 'Administrator (TPA)', panel: false, rateMultiplier: 0.7 },
];

export const GUIDELINE_RATES = { Partner: 425, Associate: 285, Paralegal: 145 };
const CLASSES = [['Partner', 30], ['Associate', 50], ['Paralegal', 20]];
const TASKS = ['Review and analyze pleadings', 'Draft discovery responses', 'Prepare for deposition of claimant', 'Telephone conference with adjuster regarding settlement authority', 'Research jurisdictional issue', 'Draft mediation statement', 'Correspondence with opposing counsel', 'Review medical records', 'Prepare motion for summary judgment', 'Attend hearing'];
const VAGUE = ['Attention to file', 'Work on matter', 'Review', 'Misc.', 'Legal services'];

export function generatePortfolio({ seed = 'matters-2026', asOf = '2026-08-31' } = {}) {
  const rng = makeRng(seed);
  const matters = [];
  let n = 0;
  const typeKeys = Object.keys(MATTER_TYPES);
  for (let k = 0; k < 150; k++) {
    n++;
    const typeKey = rng.weighted([['auto-bi', 24], ['premises', 20], ['employment', 14], ['contract', 16], ['subrogation', 14], ['wc-appeal', 12]]);
    const T = MATTER_TYPES[typeKey];
    const opened = dates.addDays('2023-09-01', rng.int(0, 1080));
    if (opened > asOf) continue;
    const entity = rng.pick(ENTITIES).code;
    const exposure = Math.round(rng.lognormalMeanCv(T.exposureMean, 1.4) / 1000) * 1000;
    const suit = typeKey === 'subrogation' ? rng.next() < 0.3 : rng.next() < (exposure > 60000 ? 0.8 : 0.45);
    // handling by rule of thumb the intake engine also uses
    const firm = route({ type: typeKey, exposure, suit, entity }).handling;
    const speed = rng.lognormalMeanCv(1, 0.45);
    const costScale = rng.lognormalMeanCv(1, 0.5);
    // walk stages
    let date = opened, stageIdx = 0, closed = null; const stageHistory = [];
    const stagesToRun = rng.int(1, T.stages.length);
    const settlesEarly = rng.next() < 0.7;
    for (let s = 0; s < T.stages.length; s++) {
      const days = Math.max(3, Math.round(T.stageDays[s] * speed * rng.lognormalMeanCv(1, 0.3)));
      const end = dates.addDays(date, days);
      stageHistory.push({ stage: T.stages[s], start: date, end: end <= asOf ? end : null });
      if (end > asOf) { stageIdx = s; break; }
      date = end; stageIdx = s;
      if (settlesEarly && s + 1 >= stagesToRun) { closed = end; break; }
      if (s === T.stages.length - 1) closed = end;
    }
    const currentStage = closed ? 'Closed' : T.stages[stageIdx];
    const budget = Math.round(T.budget * (exposure > 100000 ? 1.5 : 1) / 1000) * 1000;
    // invoices: monthly, driven by stage cost
    const invoices = [];
    let billed = 0;
    const F = FIRMS.find(f => f.id === firm);
    if (F.panel) {
      for (const sh of stageHistory) {
        const sIdx = T.stages.indexOf(sh.stage);
        const total = T.stageCost[sIdx] * costScale * F.rateMultiplier * (sh.end ? 1 : Math.min(1, dates.daysBetween(sh.start, asOf) / Math.max(1, T.stageDays[sIdx] * speed)));
        let d = dates.addDays(sh.start, 30);
        const endD = sh.end || asOf;
        const months = Math.max(1, Math.round(dates.daysBetween(sh.start, endD) / 30));
        for (let m = 0; m < months; m++) {
          const amt = total / months;
          const lines = [];
          let remaining = amt;
          while (remaining > 200) {
            const cls = rng.weighted(CLASSES);
            const guideline = GUIDELINE_RATES[cls];
            const over = rng.next() > F.discipline;
            const rate = Math.round(guideline * (over ? rng.uniform(1.05, 1.35) : 1));
            const hours = Math.min(remaining / rate, rng.uniform(0.3, 6));
            const vague = rng.next() > F.discipline * 0.9 + 0.05;
            lines.push({ timekeeper: cls, rate, guideline, hours: Math.round(hours * 10) / 10, amount: Math.round(hours * rate * 100) / 100, description: vague ? rng.pick(VAGUE) : rng.pick(TASKS), block: !vague && hours > 5 && rng.next() < 0.5 });
            remaining -= hours * rate;
          }
          const invAmt = lines.reduce((s, l) => s + l.amount, 0);
          if (invAmt > 0 && d <= asOf) { invoices.push({ date: d, stage: sh.stage, amount: Math.round(invAmt * 100) / 100, lines }); billed += invAmt; }
          d = dates.addDays(d, 30);
        }
      }
    }
    const id = `M-${opened.slice(0, 4)}-${String(n).padStart(4, '0')}`;
    matters.push({ id, type: typeKey, typeName: T.name, entity, opened, closed, status: closed ? 'Closed' : 'Open', stage: currentStage, stageIdx, stageHistory, suit, exposure, budget, handling: firm, billed: Math.round(billed * 100) / 100, invoices, reserve: closed ? 0 : Math.round(exposure * rng.uniform(0.3, 0.9) / 1000) * 1000 });
  }
  matters.sort((a, b) => dates.cmp(a.opened, b.opened));
  return { seed, asOf, matters };
}

// ---------------------------------------------------------------------------
// Intake routing rules. Returns the decision and the trace of rules fired.

export const RULES = [
  { id: 'R1', text: 'Subrogation with expected recovery under $25,000 goes to the administrator.', when: m => m.type === 'subrogation' && m.exposure < 25000, then: { handling: 'tpa' } },
  { id: 'R2', text: 'Contract disputes under $50,000 with no suit filed are handled in-house.', when: m => m.type === 'contract' && m.exposure < 50000 && !m.suit, then: { handling: 'inhouse' } },
  { id: 'R3', text: 'Employment matters go to the employment panel (firm C).', when: m => m.type === 'employment', then: { handling: 'firm-c' } },
  { id: 'R4', text: 'Suits with exposure at or above $250,000 go to first-tier trial counsel (firm A).', when: m => m.suit && m.exposure >= 250000, then: { handling: 'firm-a' } },
  { id: 'R5', text: 'Workers\' compensation disputes go to the comp panel (firm B).', when: m => m.type === 'wc-appeal', then: { handling: 'firm-b' } },
  { id: 'R6', text: 'Other liability suits go to general panel (firm A or D by entity).', when: m => m.suit, then: m => ({ handling: ['NLL', 'HFD', 'MHP'].includes(m.entity) ? 'firm-a' : 'firm-d' }) },
  { id: 'R7', text: 'Pre-suit liability matters stay with the administrator until suit or a demand above $75,000.', when: m => !m.suit && m.exposure < 75000, then: { handling: 'tpa' } },
  { id: 'R8', text: 'Anything else is assessed in-house first.', when: () => true, then: { handling: 'inhouse' } },
];

export const NOTICES = [
  { id: 'N1', text: 'Exposure at or above half the retention: put the excess carrier on notice.', when: m => m.exposure >= RETENTION * 0.5 },
  { id: 'N2', text: 'Exposure at or above $1,000,000: notify the board risk committee within five days.', when: m => m.exposure >= 1000000 },
  { id: 'N3', text: 'Suit filed: litigation hold to the entity within 24 hours.', when: m => m.suit },
  { id: 'N4', text: 'Employment matter: HR and the entity\'s general manager are copied.', when: m => m.type === 'employment' },
  { id: 'N5', text: 'Regulatory or governmental party: general counsel personally.', when: m => m.regulatory },
];

export function route(m) {
  const trace = [];
  let decision = null;
  for (const r of RULES) {
    const fired = r.when(m);
    trace.push({ id: r.id, text: r.text, fired: fired && !decision, skipped: fired && !!decision });
    if (fired && !decision) decision = typeof r.then === 'function' ? r.then(m) : r.then;
  }
  const notices = NOTICES.filter(n => n.when(m));
  const T = MATTER_TYPES[m.type];
  const budget = T ? Math.round(T.budget * (m.exposure > 100000 ? 1.5 : 1) / 1000) * 1000 : null;
  return { handling: decision.handling, handlingName: FIRMS.find(f => f.id === decision.handling).name, trace, notices, budget, line: T?.line || null };
}

// ---------------------------------------------------------------------------
// Portfolio analytics.

export function analysePortfolio(portfolio) {
  const { matters, asOf } = portfolio;
  const open = matters.filter(m => m.status === 'Open');
  const closed = matters.filter(m => m.status === 'Closed');

  // Historical cost per stage by type from closed panel matters: median of billed per stage
  const stageCost = {};
  for (const m of closed.filter(m => m.invoices.length)) {
    for (const sh of m.stageHistory) {
      const spent = m.invoices.filter(i => i.stage === sh.stage).reduce((s, i) => s + i.amount, 0);
      (stageCost[`${m.type}|${sh.stage}`] ??= []).push(spent);
    }
  }
  const median = arr => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const medStage = Object.fromEntries(Object.entries(stageCost).map(([k, v]) => [k, median(v)]));

  // Budget burn projection for open panel matters
  const burn = open.filter(m => FIRMS.find(f => f.id === m.handling).panel).map(m => {
    const T = MATTER_TYPES[m.type];
    const remainingStages = T.stages.slice(m.stageIdx + 1);
    const currentKey = `${m.type}|${m.stage}`;
    const currentSpent = m.invoices.filter(i => i.stage === m.stage).reduce((s, i) => s + i.amount, 0);
    const currentRemaining = Math.max(0, (medStage[currentKey] ?? T.stageCost[m.stageIdx]) - currentSpent);
    // assume 70% of matters settle before the last two stages: weight later stages
    const future = remainingStages.reduce((s, st, i) => s + (medStage[`${m.type}|${st}`] ?? T.stageCost[m.stageIdx + 1 + i]) * (i >= remainingStages.length - 2 ? 0.4 : 0.8), 0);
    const projected = m.billed + currentRemaining + future;
    return { ...m, projected, overrun: projected - m.budget, overrunPct: (projected - m.budget) / m.budget };
  }).sort((a, b) => b.overrun - a.overrun);
  const overBudget = burn.filter(b => b.overrun > 0);

  // Rate compliance by firm
  const byFirm = {};
  for (const m of matters) {
    const f = (byFirm[m.handling] ??= { firm: m.handling, name: FIRMS.find(x => x.id === m.handling).name, billed: 0, overGuideline: 0, vagueAmount: 0, blockAmount: 0, lines: 0, matters: 0, hours: 0 });
    f.matters++;
    for (const inv of m.invoices) for (const l of inv.lines) {
      f.lines++; f.billed += l.amount; f.hours += l.hours;
      if (l.rate > l.guideline) f.overGuideline += (l.rate - l.guideline) * l.hours;
      if (VAGUE.includes(l.description)) f.vagueAmount += l.amount;
      if (l.block) f.blockAmount += l.amount;
    }
  }
  const firms = Object.values(byFirm).filter(f => f.billed > 0).map(f => ({ ...f, blendedRate: f.billed / f.hours, overShare: f.overGuideline / f.billed, vagueShare: f.vagueAmount / f.billed })).sort((a, b) => b.overGuideline - a.overGuideline);
  const totalOver = firms.reduce((s, f) => s + f.overGuideline, 0);
  const totalBilled = firms.reduce((s, f) => s + f.billed, 0);

  // Cycle time by type and stage; stuck matters
  const durations = {};
  for (const m of matters) for (const sh of m.stageHistory) if (sh.end) (durations[`${m.type}|${sh.stage}`] ??= []).push(dates.daysBetween(sh.start, sh.end));
  const p = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
  const stuck = open.map(m => {
    const sh = m.stageHistory[m.stageHistory.length - 1];
    const days = dates.daysBetween(sh.start, asOf);
    const hist = durations[`${m.type}|${m.stage}`] || [];
    const p90 = p(hist, 0.9);
    return { ...m, daysInStage: days, p90, stuck: p90 !== null && days > p90 };
  }).filter(m => m.stuck).sort((a, b) => (b.daysInStage - b.p90) - (a.daysInStage - a.p90));
  const cycle = Object.keys(MATTER_TYPES).map(t => ({ type: t, name: MATTER_TYPES[t].name, open: open.filter(m => m.type === t).length, closed: closed.filter(m => m.type === t).length, medianDaysToClose: median(closed.filter(m => m.type === t).map(m => dates.daysBetween(m.opened, m.closed))), medianCost: median(closed.filter(m => m.type === t && m.invoices.length).map(m => m.billed)), stages: MATTER_TYPES[t].stages.map(s => ({ stage: s, median: p(durations[`${t}|${s}`] || [], 0.5), p90: p(durations[`${t}|${s}`] || [], 0.9) })) }));

  const totals = { matters: matters.length, open: open.length, closed: closed.length, billed: totalBilled, reserve: open.reduce((s, m) => s + m.reserve, 0), exposure: open.reduce((s, m) => s + m.exposure, 0), budgetOpen: burn.reduce((s, m) => s + m.budget, 0), projectedOpen: burn.reduce((s, m) => s + m.projected, 0) };
  return { asOf, totals, burn, overBudget, firms, totalOver, totalBilled, cycle, stuck, medStage };
}
