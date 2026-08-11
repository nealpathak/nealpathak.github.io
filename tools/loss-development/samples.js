// Synthetic loss triangles. Nothing here is derived from a real book of
// business, carrier, captive, firm, or employer.
//
// The triangles are generated rather than typed: a stated reporting pattern is
// applied to a stated ultimate for each accident year, then perturbed by a fixed
// deterministic signal whose amplitude decays with development age — early ages
// are noisy, late ages are not, which is how real triangles behave. Generating
// them keeps the construction visible instead of burying a hand-tuned answer in
// sixty-four opaque numbers.

const SIGNAL = [
  0.60, -0.35, 0.85, -0.70, 0.25, -0.90, 0.45, 0.10,
  -0.55, 0.75, -0.20, 0.95, -0.45, 0.30, -0.80, 0.50,
];

function jitter(yearIdx, devIdx, baseAmp) {
  const amp = baseAmp * 0.72 ** devIdx;
  return 1 + amp * SIGNAL[(yearIdx * 5 + devIdx * 3) % SIGNAL.length];
}

const round1k = n => Math.round(n / 1000) * 1000;

/**
 * Build the paid and incurred rows for one accident year.
 * Development stops at the year's age as at the valuation date.
 */
function buildRows(spec, yearIdx) {
  const { ages, incurredPattern, paidPattern, ultimates, startYear, valuationYear } = spec;
  const year = startYear + yearIdx;
  const maxAge = (valuationYear - year + 1) * 12;
  const ultimate = ultimates[yearIdx];

  const incurred = [];
  const paid = [];
  let priorPaid = 0;

  for (let d = 0; d < ages.length; d++) {
    if (ages[d] > maxAge) { incurred.push(null); paid.push(null); continue; }

    incurred.push(round1k(ultimate * incurredPattern[d] * jitter(yearIdx, d, 0.055)));

    // Payments cannot run backwards, and cannot exceed incurred.
    let p = round1k(ultimate * paidPattern[d] * jitter(yearIdx, d, 0.030));
    p = Math.max(p, priorPaid);
    p = Math.min(p, incurred[d] * 0.985);
    paid.push(round1k(p));
    priorPaid = p;
  }

  return { year, paid, incurred };
}

function buildProgram(spec) {
  const years = spec.ultimates.map((_, i) => {
    const rows = buildRows(spec, i);
    return {
      year: rows.year,
      earnedPremium: spec.earnedPremium[i],
      aggregateLimit: spec.aggregateLimit[i],
      funded: spec.funded[i],
      paid: rows.paid,
      incurred: rows.incurred,
    };
  });

  return {
    id: spec.id,
    label: spec.label,
    note: spec.note,
    program: {
      name: spec.name,
      valuation: `31 December ${spec.valuationYear}`,
      ages: spec.ages,
      basis: 'incurred',
      method: 'volume-all',
      ldfOverrides: {},
      tailFactor: spec.tailFactor,
      aprioriLossRatio: spec.aprioriLossRatio,
      blend: 'benktander',
      blendWeight: 0.5,
      trend: spec.trend,
      rateLevelTrend: spec.rateLevelTrend,
      maturityThreshold: 0.75,
    },
    years,
  };
}

const SPECS = [
  {
    id: 'pl-captive',
    label: 'Professional liability captive',
    name: 'Captive professional liability program',
    note: 'Long tail, eight accident years, aggregate pressure building in the ' +
          'most recent three.',
    ages: [12, 24, 36, 48, 60, 72, 84, 96],
    startYear: 2018,
    valuationYear: 2025,
    incurredPattern: [0.320, 0.580, 0.750, 0.860, 0.925, 0.965, 0.985, 0.995],
    paidPattern:     [0.060, 0.190, 0.360, 0.550, 0.710, 0.830, 0.910, 0.960],
    ultimates:       [4150000, 4620000, 3980000, 5240000, 6110000, 6880000, 7940000, 8600000],
    earnedPremium:   [5200000, 5600000, 5900000, 6400000, 7300000, 8100000, 9000000, 9800000],
    aggregateLimit:  [6000000, 6000000, 6000000, 7500000, 7500000, 7500000, 9000000, 9000000],
    funded:          [4000000, 4400000, 4500000, 5000000, 5600000, 6200000, 6900000, 7500000],
    tailFactor: 1.005,
    aprioriLossRatio: 0.78,
    trend: 0.055,
    rateLevelTrend: 0.030,
  },
  {
    id: 'auto',
    label: 'Auto liability program',
    name: 'Commercial auto liability program',
    note: 'Short tail, six years, comfortable against the aggregate. The ' +
          'contrast case — most of the ultimate is already reported.',
    ages: [12, 24, 36, 48, 60, 72],
    startYear: 2020,
    valuationYear: 2025,
    incurredPattern: [0.620, 0.860, 0.945, 0.978, 0.992, 0.999],
    paidPattern:     [0.280, 0.620, 0.820, 0.920, 0.970, 0.995],
    ultimates:       [2350000, 2680000, 3120000, 3010000, 3480000, 3720000],
    earnedPremium:   [3600000, 3900000, 4200000, 4400000, 4700000, 5000000],
    aggregateLimit:  [6000000, 6000000, 6000000, 6000000, 6000000, 6000000],
    funded:          [2600000, 2900000, 3200000, 3300000, 3600000, 3900000],
    tailFactor: 1.001,
    aprioriLossRatio: 0.68,
    trend: 0.040,
    rateLevelTrend: 0.045,
  },
  {
    id: 'new-program',
    label: 'New program — four years',
    name: 'Newly formed liability program',
    note: 'Four years, a 48-month triangle on a long-tail line, and a tail ' +
          'factor carrying more of the answer than the data does. Read the ' +
          'diagnostics before quoting any number off this one.',
    ages: [12, 24, 36, 48],
    startYear: 2022,
    valuationYear: 2025,
    incurredPattern: [0.280, 0.550, 0.730, 0.850],
    paidPattern:     [0.050, 0.170, 0.330, 0.500],
    ultimates:       [3900000, 4600000, 5300000, 5900000],
    earnedPremium:   [5000000, 5600000, 6200000, 6800000],
    aggregateLimit:  [5000000, 5000000, 5000000, 5000000],
    funded:          [3200000, 3600000, 4000000, 4400000],
    tailFactor: 1.176,
    aprioriLossRatio: 0.75,
    trend: 0.060,
    rateLevelTrend: 0.035,
  },
];

export const SAMPLES = SPECS.map(buildProgram);

/** Structural clone so edits in the interface never mutate the sample. */
export function loadSample(id) {
  const s = SAMPLES.find(x => x.id === id) ?? SAMPLES[0];
  return {
    id: s.id,
    label: s.label,
    note: s.note,
    program: { ...s.program, ages: [...s.program.ages], ldfOverrides: {} },
    years: s.years.map(y => ({ ...y, paid: [...y.paid], incurred: [...y.incurred] })),
  };
}

/** The CSV shape the importer accepts, used for the download template too. */
export const IMPORT_COLUMNS = [
  'accident_year', 'dev_months', 'paid', 'incurred',
  'earned_premium', 'aggregate_limit', 'funded',
];

export function toLongRows(config) {
  const rows = [];
  for (const y of config.years) {
    config.program.ages.forEach((age, i) => {
      if (y.incurred[i] === null && y.paid[i] === null) return;
      rows.push({
        accident_year: y.year,
        dev_months: age,
        paid: y.paid[i] ?? '',
        incurred: y.incurred[i] ?? '',
        earned_premium: y.earnedPremium,
        aggregate_limit: y.aggregateLimit,
        funded: y.funded,
      });
    });
  }
  return rows;
}
