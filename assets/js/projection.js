/* Erosion, development, and capital position.
 *
 * The method is an incurred chain ladder with a judgment tail: age-to-age
 * factors are computed from this program's own triangle, chained into a
 * cumulative factor, and applied to reconciled incurred. Nothing here imports
 * an industry factor. Where judgment enters — the tail — it enters through a
 * visible input rather than a constant buried in this file.
 *
 * Every figure carries a trace: the method that produced it and the rows it
 * was computed from. A number without a trace does not ship.
 */

import { patternAt, evaluationAge, parseISO } from './generate.js';

const AGES = [6, 12, 18, 24, 30, 36, 42];

/** A reported figure and its provenance. */
function fig(value, trace) {
  return { value, trace };
}

function sum(list, fn) {
  return list.reduce((s, x) => s + fn(x), 0);
}

/** The rows behind a figure. Aggregates over hundreds of claims cite the
 *  largest contributors and the full count rather than pretending a reader
 *  wants 265 rows — but the count is stated so nothing looks cherry-picked. */
function rowTrace(rows, limit = 8) {
  const sorted = [...rows].sort((a, b) => b.incurred - a.incurred);
  return {
    rowCount: rows.length,
    total: sum(rows, (r) => r.incurred),
    rows: sorted.slice(0, limit).map((r) => ({
      claimNo: r.claimNo,
      insuredEntity: r.insuredEntity,
      coverageCode: r.coverageCode,
      status: r.status,
      incurred: r.incurred,
      paid: r.paidIndemnity + r.paidExpense,
      caseReserve: r.caseReserve,
      rowId: r.__rowId,
    })),
  };
}

/* ---------- Triangle ---------- */

/** Small deterministic perturbation, so historical valuations are not a
 *  perfectly smooth curve. Derived from the year and age rather than a random
 *  source: the triangle has to be identical on every load. */
function cellNoise(year, age) {
  const h = Math.sin(year * 7.13 + age * 3.77) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 2;
}

/** Incurred development triangle, one row per policy year.
 *
 * Each row is anchored on its latest diagonal — the reconciled incurred for
 * that policy year — and the earlier valuations are the reported pattern read
 * backwards from it. Anchoring on the reconciled figure is what makes the
 * projection honest: the factors are applied to the same number the memo
 * reports, so a correction at intake actually reaches the ultimate. Anchor on
 * a modelled figure instead and the two quietly disagree.
 *
 * Claims whose reserve movements carry no effective date are excluded from the
 * triangle but still count toward current incurred. It is their development
 * history that is unusable, not their amount.
 */
export function buildTriangle(ctx) {
  const { recon, program, valuationMs, pattern, noiseScale } = ctx;

  const rowsByYear = new Map();
  for (const row of recon.reconciled) {
    if (!program.policyYears.includes(row.policyYear)) continue;
    if (!rowsByYear.has(row.policyYear)) rowsByYear.set(row.policyYear, []);
    rowsByYear.get(row.policyYear).push(row);
  }

  const triangle = [];
  for (const year of program.policyYears) {
    const rows = rowsByYear.get(year) || [];
    const inceptionMs = parseISO(`${year}-01-01`);
    const age = evaluationAge(inceptionMs, valuationMs);

    const latest = sum(rows, (r) => r.incurred);
    const triangleRows = rows.filter((r) => !r.__excludeFromTriangle);
    const triangleLatest = sum(triangleRows, (r) => r.incurred);
    const atAge = patternAt(pattern, age);

    const cells = {};
    const ladder = AGES.filter((a) => a <= age);
    for (const a of ladder) {
      if (a === age) {
        cells[a] = triangleLatest;
      } else {
        const base = triangleLatest * (patternAt(pattern, a) / atAge);
        cells[a] = base * (1 + noiseScale * 0.5 * cellNoise(year, a));
      }
    }

    /* Incurred development is monotonic on this book — a cell cannot be larger
     * than the one that follows it. Unconstrained noise can invert a pair and
     * produce an age-to-age factor below 1.0, or a later step larger than an
     * earlier one, which an actuary reads as adverse development and asks
     * which claims caused it. There are no such claims: it would be an
     * artifact. Walk back down the ladder and hold the ordering. */
    for (let i = ladder.length - 2; i >= 0; i -= 1) {
      cells[ladder[i]] = Math.min(cells[ladder[i]], cells[ladder[i + 1]]);
    }

    triangle.push({
      year,
      age,
      cells,
      rows,
      claimCount: rows.length,
      excludedFromTriangle: rows.length - triangleRows.length,
      // Incurred on claims held out of the triangle. It still belongs in the
      // year's total, so it is added back after development rather than being
      // silently developed by factors it never contributed to.
      excludedIncurred: latest - triangleLatest,
      triangleLatest,
      latest,
      paid: sum(rows, (r) => r.paidIndemnity + r.paidExpense),
      caseReserve: sum(rows, (r) => r.caseReserve),
      openCount: rows.filter((r) => r.status !== 'CLOSED').length,
    });
  }

  return triangle;
}

/** Volume-weighted age-to-age factors, computed across every policy year with
 *  data at both ends of the step. */
export function developmentFactors(triangle, tailFactor) {
  const steps = [];
  for (let i = 0; i < AGES.length - 1; i += 1) {
    const from = AGES[i];
    const to = AGES[i + 1];
    const contributing = triangle.filter(
      (t) => t.cells[from] !== undefined && t.cells[to] !== undefined
    );
    if (!contributing.length) continue;
    const denom = sum(contributing, (t) => t.cells[from]);
    const numer = sum(contributing, (t) => t.cells[to]);
    steps.push({
      from,
      to,
      factor: denom > 0 ? numer / denom : 1,
      years: contributing.map((t) => t.year),
    });
  }

  /** Cumulative factor from an age to ultimate. */
  function cdf(age) {
    let f = 1;
    for (const s of steps) {
      if (s.from >= age) f *= s.factor;
    }
    return f * tailFactor;
  }

  return { steps, cdf, tailFactor };
}

/* ---------- Layers ---------- */

const BANDS = [
  { id: 'b1', label: 'Under $50k', min: 0, max: 50000 },
  { id: 'b2', label: '$50k – $100k', min: 50000, max: 100000 },
  { id: 'b3', label: '$100k – $250k', min: 100000, max: 250000 },
  { id: 'b4', label: '$250k – $500k', min: 250000, max: 500000 },
  { id: 'b5', label: 'At or above retention', min: 500000, max: Infinity },
];

/** Size-of-loss distribution: every claim assigned wholly to one band by its
 *  total incurred.
 *
 *  Deliberately NOT called a layer analysis. A layer analysis slices each claim
 *  across layers — a $500k claim contributes to every band beneath it — and
 *  produces entirely different numbers. Labelling this one as the other is the
 *  kind of thing an actuary corrects out loud. */
export function sizeOfLossDistribution(triangle) {
  return BANDS.map((band) => {
    const byYear = {};
    let totalIncurred = 0;
    let totalCount = 0;
    for (const t of triangle) {
      const inBand = t.rows.filter((r) => r.incurred >= band.min && r.incurred < band.max);
      const incurred = sum(inBand, (r) => r.incurred);
      byYear[t.year] = {
        count: inBand.length,
        incurred,
        share: t.latest > 0 ? incurred / t.latest : 0,
        rows: inBand,
      };
      totalIncurred += incurred;
      totalCount += inBand.length;
    }
    return { ...band, byYear, totalIncurred, totalCount };
  });
}

/* ---------- Main ---------- */

export function project(ctx) {
  const { synth, recon, assumptions } = ctx;
  const { program, meta } = synth.config;
  const valuationMs = parseISO(meta.valuationDate);
  const currentYear = program.currentPolicyYear;

  const aggregate = assumptions.annualAggregate;
  const tailFactor = assumptions.tailFactor;
  const trend = assumptions.severityTrend;
  const margin = assumptions.capitalMargin;

  const triangle = buildTriangle({
    recon,
    program,
    valuationMs,
    pattern: synth.pattern,
    noiseScale: synth.config.generation.developmentNoise,
  });
  const factors = developmentFactors(triangle, tailFactor);

  /* --- Per-year position --- */

  const years = triangle.map((t) => {
    const cdf = factors.cdf(t.age);

    /* Develop only what the triangle actually contains, then add back the
     * claims held out of it. Developing the full reported figure by factors
     * derived from a smaller base is the quiet kind of wrong: the two numbers
     * differ by the excluded claims, and the memo would print one in the
     * triangle and the other in the erosion table, two sections apart. */
    const ultimate = t.triangleLatest * cdf + t.excludedIncurred;
    const ibnr = ultimate - t.latest;

    // The same projection run on the unreconciled feed, so the cost of skipping
    // reconciliation is a number on the page rather than an assertion.
    const naiveLatest = recon.naiveTotals[t.year] ?? t.latest;
    const naiveUltimate = naiveLatest * cdf;

    /* And the same projection if every held exception for this year resolves
     * as proposed. The reported figure is the conservative reading; this is
     * the other end of the range the board is being asked to close. */
    const pending = recon.pendingByYear?.[t.year] || 0;
    const resolvedLatest = t.latest + pending;
    const resolvedUltimate = (t.triangleLatest + pending) * cdf + t.excludedIncurred;

    /* Losses trended to current-year cost level, for comparability across
     * policy years. This is trending, not on-levelling — on-level restates
     * premium to current rate level and has nothing to do with losses. */
    const trended = ultimate * Math.pow(1 + trend, currentYear - t.year);

    return {
      year: t.year,
      age: t.age,
      claimCount: t.claimCount,
      openCount: t.openCount,
      cdf,
      latest: fig(t.latest, {
        method: `Sum of reconciled incurred across ${t.claimCount} claims in policy year ${t.year}`,
        ...rowTrace(t.rows),
      }),
      paid: fig(t.paid, {
        method: `Paid indemnity plus paid expense across ${t.claimCount} claims`,
        ...rowTrace(t.rows),
      }),
      caseReserve: fig(t.caseReserve, {
        method: `Sum of open case reserves in policy year ${t.year}`,
        ...rowTrace(t.rows.filter((r) => r.caseReserve > 0)),
      }),
      ultimate: fig(ultimate, {
        method: `$${Math.round(t.triangleLatest).toLocaleString()} of triangle incurred at ${t.age} months developed by a cumulative factor of ${cdf.toFixed(4)} (age-to-age factors from this program's own triangle, tail ${tailFactor.toFixed(3)})${t.excludedIncurred > 0 ? `, plus $${Math.round(t.excludedIncurred).toLocaleString()} on claims held out of the triangle for undated reserve movements` : ''}`,
        ...rowTrace(t.rows),
      }),
      ibnr: fig(ibnr, {
        method: `Projected ultimate less reconciled incurred at ${t.age} months. Includes development on known claims as well as claims not yet reported.`,
        ...rowTrace(t.rows),
      }),
      naiveUltimate,
      trended,
      pending,
      resolvedLatest,
      resolvedUltimate,
      resolvedPct: resolvedUltimate / aggregate,
      consumedPct: t.latest / aggregate,
      projectedPct: ultimate / aggregate,
      naiveProjectedPct: naiveUltimate / aggregate,
      headroom: aggregate - ultimate,
      breach: ultimate > aggregate,
      naiveBreach: naiveUltimate > aggregate,
      resolvedBreach: resolvedUltimate > aggregate,
    };
  });

  const current = years.find((y) => y.year === currentYear);

  /* --- Current-year run-rate cross-check ---
   * Deliberately shown next to the chain-ladder figure. It is the cruder
   * method and it ignores development entirely. Which direction it misses in
   * depends on the valuation age, so the memo computes that rather than
   * asserting it. */

  const monthsElapsed = current.age;
  const annualisedReported = (current.latest.value / monthsElapsed) * 12;

  /* --- Capital --- */

  /* Liability retained by the captive is capped at the annual aggregate — above
   * it, the excess layer responds and the exposure is not the captive's to
   * fund. Summing gross ultimate would charge the captive for losses it has
   * bought protection against, and the error grows precisely when the
   * aggregate is set low, which is the case the slider invites a reader to
   * test. */
  const openLiability = sum(years, (y) =>
    Math.max(0, Math.min(y.ultimate.value, aggregate) - y.paid.value)
  );
  const cededAboveAggregate = sum(years, (y) => Math.max(0, y.ultimate.value - aggregate));
  const required = openLiability * (1 + margin);
  const funded = program.fundedSurplus;

  const capital = {
    cededAboveAggregate,
    openLiability: fig(openLiability, {
      method: `Projected ultimate across all policy years, capped at the ${aggregate.toLocaleString()} annual aggregate, less paid to date`,
      rowCount: sum(triangle, (t) => t.claimCount),
      total: openLiability,
      rows: years.map((y) => ({
        claimNo: `Policy year ${y.year}`,
        insuredEntity: `${y.claimCount} claims`,
        coverageCode: '—',
        status: `${y.openCount} open`,
        incurred: y.ultimate.value - y.paid.value,
        paid: y.paid.value,
        caseReserve: y.caseReserve.value,
        rowId: `year-${y.year}`,
      })),
    }),
    required: fig(required, {
      method: `Open liability of $${Math.round(openLiability).toLocaleString()} plus a target capital margin of ${(margin * 100).toFixed(1)}%`,
      rowCount: 0,
      total: required,
      rows: [],
    }),
    funded: fig(funded, {
      method: 'Funded surplus per the captive balance sheet',
      rowCount: 0,
      total: funded,
      rows: [],
    }),
    ratio: funded / required,
    surplus: funded - required,
    adequate: funded >= required,
  };

  /* --- Erosion correction attributable to reconciliation --- */

  const heroException = recon.heroException;
  const heroReported = heroException ? Math.abs(heroException.appliedImpact) : 0;

  const correction = {
    // Everything reconciliation removed from the current year, from all causes.
    reportedDelta: (recon.naiveTotals[currentYear] ?? 0) - current.latest.value,
    projectedDelta: current.naiveUltimate - current.ultimate.value,
    // The single duplicate, isolated. The development factor is what turns a
    // data error into a materially larger projection error.
    heroReported,
    heroProjected: heroReported * current.cdf,
    magnification: current.cdf,
    naivePct: current.naiveProjectedPct,
    correctedPct: current.projectedPct,
    flipsBreach: current.naiveBreach && !current.breach,
    exception: heroException,
  };

  /* --- Quarterly activity ---
   * Claims that entered the book during the reporting quarter, and the one
   * before it for comparison. Reported-date basis: this is what arrived, not
   * what occurred, because arrival is what the quarter's numbers moved on. */

  const vY = Number(meta.valuationDate.slice(0, 4));
  const vM = Number(meta.valuationDate.slice(5, 7));
  const qIndex = Math.ceil(vM / 3);
  const quarterStart = (y, q) => `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;

  function windowStats(fromISO, toISO) {
    const rows = recon.reconciled.filter(
      (r) => r.reportDate && r.reportDate >= fromISO && r.reportDate <= toISO
    );
    return {
      from: fromISO,
      to: toISO,
      count: rows.length,
      incurred: sum(rows, (r) => r.incurred),
      paid: sum(rows, (r) => r.paidIndemnity + r.paidExpense),
      caseReserve: sum(rows, (r) => r.caseReserve),
      openCount: rows.filter((r) => r.status !== 'CLOSED').length,
      rows,
    };
  }

  const thisQuarter = windowStats(quarterStart(vY, qIndex), meta.valuationDate);
  const priorQuarter =
    qIndex > 1
      ? windowStats(
          quarterStart(vY, qIndex - 1),
          new Date(Date.UTC(vY, (qIndex - 1) * 3, 0)).toISOString().slice(0, 10)
        )
      : null;

  const quarter = {
    label: `Q${qIndex} ${vY}`,
    priorLabel: qIndex > 1 ? `Q${qIndex - 1} ${vY}` : null,
    current: thisQuarter,
    prior: priorQuarter,
    countDelta: priorQuarter ? thisQuarter.count - priorQuarter.count : null,
    incurredDelta: priorQuarter ? thisQuarter.incurred - priorQuarter.incurred : null,
  };

  /* --- Materiality watch list ---
   * Open claims large enough to move the aggregate on their own. */

  const materialityFloor = aggregate * 0.01;
  const watchList = recon.reconciled
    .filter((r) => r.policyYear === currentYear && r.status !== 'CLOSED')
    .filter((r) => r.incurred >= materialityFloor)
    .sort((a, b) => b.incurred - a.incurred)
    .slice(0, 12);

  return {
    valuationDate: meta.valuationDate,
    currentYear,
    aggregate,
    retention: program.retentionPerClaim,
    assumptions,
    triangle,
    factors,
    years,
    current,
    annualisedReported,
    capital,
    correction,
    quarter,
    sizeOfLoss: sizeOfLossDistribution(triangle),
    watchList,
    materialityFloor,
    totals: {
      claims: sum(triangle, (t) => t.claimCount),
      incurred: sum(years, (y) => y.latest.value),
      ultimate: sum(years, (y) => y.ultimate.value),
      ibnr: sum(years, (y) => y.ibnr.value),
      paid: sum(years, (y) => y.paid.value),
    },
  };
}

export { AGES, BANDS };
