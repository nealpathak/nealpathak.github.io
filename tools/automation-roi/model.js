// Automation ROI & Capacity — calculation layer.
//
// Pure functions over a plain config object. No DOM, no globals, no I/O, so the
// model can be reasoned about (and reused) independently of the interface.
//
// Method summary
// --------------
// Each step is costed on *expected passes*, not nominal passes. A step with a
// 20% rework rate is executed 1 / (1 - 0.20) = 1.25 times on average, so its
// true cost is 25% above what a naive touch-time roll-up reports. That gap is
// where most manual-process business cases quietly go wrong.
//
// Automation is modelled as removing a share of touch time from the labour
// pool. The residual manual share keeps its original rework rate — a deliberately
// conservative choice, since automation usually suppresses rework as well.

import { clamp } from '../../assets/js/fmt.js';

const MAX_REWORK = 0.95; // a rework rate of 1.0 implies an infinite loop

/** Expected number of attempts at a step given its rework probability. */
export function expectedPasses(reworkRate) {
  return 1 / (1 - clamp(reworkRate, 0, MAX_REWORK));
}

/** Fully loaded hourly rate for a role. */
export function hourlyRate(role) {
  const hours = role.productiveHoursPerYear || 1;
  return role.loadedAnnualCost / hours;
}

/**
 * Cost and time a single step, both as-is and under automation.
 * Returns per-month figures for the whole process volume.
 */
export function evaluateStep(step, roles, volumePerMonth) {
  const role = roles.find(r => r.id === step.roleId) ?? roles[0];
  const rate = hourlyRate(role);
  const passes = expectedPasses(step.reworkRate);
  const instances = volumePerMonth * clamp(step.applicability, 0, 1);
  const touchHrs = step.touchMinutes / 60;
  const automatable = clamp(step.automatable, 0, 1);

  // Current state.
  const hours = instances * passes * touchHrs;
  const cost = hours * rate;
  const elapsed = clamp(step.applicability, 0, 1) * (step.waitHours + passes * touchHrs);

  // Automated state. The automated share of touch time leaves the labour pool
  // entirely; the residual manual share still carries its rework loop. Machine
  // time is charged as run cost, not as hours.
  const touchAfter = touchHrs * (1 - automatable);
  const hoursAfter = instances * passes * touchAfter;
  const costAfter = hoursAfter * rate;
  const waitAfter = step.waitHours * (1 - clamp(step.waitReduction, 0, 1));
  const elapsedAfter = clamp(step.applicability, 0, 1) * (waitAfter + passes * touchAfter);

  // Standalone business case for this step alone.
  const monthlyGross = cost - costAfter;
  const monthlyNet = monthlyGross - step.runCostMonthly;
  const annualNet = monthlyNet * 12;
  const payback = monthlyNet > 0 ? step.buildCost / monthlyNet : Infinity;

  return {
    id: step.id,
    name: step.name,
    role: role.name,
    rate,
    passes,
    instances,
    hours,
    hoursAfter,
    hoursSaved: hours - hoursAfter,
    cost,
    costAfter,
    elapsed,
    elapsedAfter,
    buildCost: step.buildCost,
    runCostMonthly: step.runCostMonthly,
    monthlyGross,
    monthlyNet,
    annualNet,
    payback,
    verdict: verdictFor(payback, annualNet, automatable),
  };
}

function verdictFor(payback, annualNet, automatable) {
  if (automatable <= 0.02 || annualNet <= 0) return 'hold';
  if (payback <= 12) return 'go';
  if (payback <= 24) return 'watch';
  return 'hold';
}

/**
 * Evaluate the whole process under the current selection of automated steps.
 * @param {object} config
 * @returns {object} totals, per-step detail, cash flow, and capacity figures
 */
export function evaluate(config) {
  const { process: proc, roles, steps } = config;
  const volume = proc.volumePerMonth;
  const detail = steps.map(s => evaluateStep(s, roles, volume));
  const selected = new Set(steps.filter(s => s.selected).map(s => s.id));

  let hoursNow = 0, hoursNext = 0, costNow = 0, costNext = 0;
  let cycleNow = 0, cycleNext = 0, buildCost = 0, runCost = 0;

  detail.forEach(d => {
    const on = selected.has(d.id);
    hoursNow += d.hours;
    costNow += d.cost;
    cycleNow += d.elapsed;
    hoursNext += on ? d.hoursAfter : d.hours;
    costNext += on ? d.costAfter : d.cost;
    cycleNext += on ? d.elapsedAfter : d.elapsed;
    if (on) { buildCost += d.buildCost; runCost += d.runCostMonthly; }
  });

  const hoursSaved = hoursNow - hoursNext;
  const monthlyGross = costNow - costNext;
  const monthlyNet = monthlyGross - runCost;
  const perFTE = proc.productiveHoursPerFTEMonth || 1;

  // Cash flow: build cost lands in month 0, savings accrue from month 1.
  const horizon = proc.horizonMonths;
  const cumulative = [];
  for (let m = 0; m <= horizon; m++) cumulative.push(-buildCost + monthlyNet * m);

  let breakeven = null;
  if (monthlyNet > 0) {
    const exact = buildCost / monthlyNet;
    breakeven = exact <= horizon ? exact : null;
  }

  // Headroom: how much more volume the same headcount absorbs once the touch
  // time per instance falls.
  const headroom = hoursNext > 0 ? volume * (hoursNow / hoursNext) - volume : Infinity;

  return {
    detail,
    selectedCount: selected.size,
    volume,
    hoursNow,
    hoursNext,
    hoursSaved,
    fteNow: hoursNow / perFTE,
    fteNext: hoursNext / perFTE,
    fteReleased: hoursSaved / perFTE,
    costNow,
    costNext,
    monthlyGross,
    monthlyNet,
    annualNet: monthlyNet * 12,
    buildCost,
    runCost,
    cycleNow,
    cycleNext,
    cycleSavedPct: cycleNow > 0 ? (cycleNow - cycleNext) / cycleNow : 0,
    touchPerInstanceNow: volume > 0 ? (hoursNow / volume) * 60 : 0,
    touchPerInstanceNext: volume > 0 ? (hoursNext / volume) * 60 : 0,
    costPerInstanceNow: volume > 0 ? costNow / volume : 0,
    costPerInstanceNext: volume > 0 ? costNext / volume : 0,
    headroom,
    cumulative,
    breakeven,
    horizonNet: cumulative[cumulative.length - 1],
    paybackMonths: monthlyNet > 0 ? buildCost / monthlyNet : Infinity,
    // Bottleneck by labour hours, and by elapsed contribution to cycle time.
    bottleneckHours: [...detail].sort((a, b) => b.hours - a.hours)[0] ?? null,
    bottleneckCycle: [...detail].sort((a, b) => b.elapsed - a.elapsed)[0] ?? null,
    ranked: [...detail]
      .filter(d => d.monthlyGross > 0)
      .sort((a, b) => a.payback - b.payback || b.annualNet - a.annualNet),
  };
}

/** Deep-enough clone for the perturbations below. */
function cloneConfig(c) {
  return {
    process: { ...c.process },
    roles: c.roles.map(r => ({ ...r })),
    steps: c.steps.map(s => ({ ...s })),
  };
}

const DRIVERS = [
  {
    key: 'volume', label: 'Monthly volume',
    apply: (c, f) => { c.process.volumePerMonth *= f; },
  },
  {
    key: 'touch', label: 'Touch time',
    apply: (c, f) => { c.steps.forEach(s => { s.touchMinutes *= f; }); },
  },
  {
    key: 'rate', label: 'Loaded labour cost',
    apply: (c, f) => { c.roles.forEach(r => { r.loadedAnnualCost *= f; }); },
  },
  {
    key: 'rework', label: 'Rework rate',
    apply: (c, f) => {
      c.steps.forEach(s => { s.reworkRate = clamp(s.reworkRate * f, 0, MAX_REWORK); });
    },
  },
  {
    key: 'automatable', label: 'Automatable share',
    apply: (c, f) => {
      c.steps.forEach(s => { s.automatable = clamp(s.automatable * f, 0, 1); });
    },
  },
  {
    key: 'build', label: 'Build cost',
    apply: (c, f) => { c.steps.forEach(s => { s.buildCost *= f; }); },
  },
  {
    key: 'run', label: 'Run cost',
    apply: (c, f) => { c.steps.forEach(s => { s.runCostMonthly *= f; }); },
  },
];

/**
 * One-at-a-time sensitivity on horizon net value.
 * @param {object} config
 * @param {number} swing  fractional swing applied in both directions, e.g. 0.25
 * @returns {{label:string, low:number, high:number}[]} deltas from the base case
 */
export function sensitivity(config, swing = 0.25) {
  const base = evaluate(config).horizonNet;
  const out = DRIVERS.map(d => {
    const lo = cloneConfig(config); d.apply(lo, 1 - swing);
    const hi = cloneConfig(config); d.apply(hi, 1 + swing);
    return {
      label: d.label,
      low: evaluate(lo).horizonNet - base,
      high: evaluate(hi).horizonNet - base,
    };
  });
  return out.sort((a, b) =>
    Math.max(Math.abs(b.low), Math.abs(b.high)) - Math.max(Math.abs(a.low), Math.abs(a.high)));
}
