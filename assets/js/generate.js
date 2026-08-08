/* Deterministic synthesis of the claim population.
 *
 * Everything here is driven by the seed in data/program-001.json. The same seed
 * always produces the same book, which is what makes the demonstration safe to
 * run live: no latency, no cost, and the numbers on screen are the numbers that
 * were on screen in rehearsal.
 *
 * Two outputs:
 *   claims — the canonical population. What the book actually is.
 *   raw    — what arrives at the door: two source systems with different field
 *            names, date formats, and status vocabularies, plus the planted
 *            defects. This is the input to reconciliation.
 *
 * The distinction matters. If the generator only produced clean data, the
 * reconciliation stage would be theater.
 */

/* ---------- Seeded randomness ---------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const next = mulberry32(seed);
  let spare = null;

  function normal() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  return {
    next,
    normal,
    lognormal: (mu, sigma) => Math.exp(mu + sigma * normal()),
    weighted(items, weightOf) {
      const total = items.reduce((s, it) => s + weightOf(it), 0);
      let r = next() * total;
      for (const it of items) {
        r -= weightOf(it);
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
  };
}

/* ---------- Dates ---------- */

const MS_DAY = 86400000;

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUS(ms) {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

function addMonths(ms, months) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

export function monthsBetween(startMs, endMs) {
  const a = new Date(startMs);
  const b = new Date(endMs);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
}

/** Development age snapped to the nearest six-month valuation step.
 *
 * Triangles are read at regular valuations, not at whatever age the calendar
 * happens to land on. A policy year incepting 1 January, valued 30 June three
 * years later, is at 42 months — not the 41 that a naive month subtraction
 * gives. Snapping keeps the latest diagonal of the triangle and the current
 * reported figures on the same footing; if they drift apart, the projection is
 * multiplying one number by a factor derived from another. */
export function evaluationAge(inceptionMs, valuationMs) {
  const months = (valuationMs - inceptionMs) / MS_DAY / 30.44;
  return Math.max(6, Math.round(months / 6) * 6);
}

/* ---------- Development pattern ---------- */

/** Reported incurred as a fraction of ultimate at a given development age.
 *
 * This is an aggregate pattern: it carries both claim emergence and case
 * development on already-reported claims. It is deliberately not applied on
 * top of a per-claim report-date gate — doing that counts the reporting lag
 * twice and inflates every age-to-age factor. */
export function patternAt(pattern, ageMonths) {
  if (ageMonths <= 0) return 0;
  const first = pattern[0];
  if (ageMonths <= first.ageMonths) {
    return first.reportedFraction * (ageMonths / first.ageMonths);
  }
  const last = pattern[pattern.length - 1];
  if (ageMonths >= last.ageMonths) return last.reportedFraction;

  for (let i = 1; i < pattern.length; i += 1) {
    const lo = pattern[i - 1];
    const hi = pattern[i];
    if (ageMonths <= hi.ageMonths) {
      const t = (ageMonths - lo.ageMonths) / (hi.ageMonths - lo.ageMonths);
      return lo.reportedFraction + t * (hi.reportedFraction - lo.reportedFraction);
    }
  }
  return last.reportedFraction;
}

/* ---------- Claim population ---------- */

/** One policy year's reported claims as at the valuation date.
 *
 * Coverage basis drives which date anchors the policy year, and getting this
 * right at generation time is what stops claims migrating between years when
 * reconciliation re-derives the year from the dates:
 *   PL is claims-made — the report date sits inside the policy year.
 *   GL is occurrence  — the occurrence date does.
 */
function buildYear(yearCfg, cfg, schema, rng, valuationMs, pattern) {
  const inceptionMs = parseISO(yearCfg.inception);
  const yearAge = evaluationAge(inceptionMs, valuationMs);
  const elapsedDays = Math.min(365, Math.max(1, (valuationMs - inceptionMs) / MS_DAY));
  const { severity, coverageMix, reportLagMonths } = cfg;

  const claims = [];
  let attempts = 0;
  const maxAttempts = yearCfg.claimCount * 40;

  while (claims.length < yearCfg.claimCount && attempts < maxAttempts) {
    attempts += 1;

    const coverageCode = rng.next() < coverageMix.PL ? 'PL' : 'GL';
    const entity = rng.weighted(schema.entities, (e) => e.weight);
    const lagMonths = Math.min(
      reportLagMonths.max,
      Math.exp(Math.log(reportLagMonths.median) + reportLagMonths.sigma * rng.normal())
    );
    const lagMs = Math.round(lagMonths * 30.44 * MS_DAY);
    const offsetMs = Math.floor(rng.next() * elapsedDays) * MS_DAY;

    let occurrenceMs;
    let reportMs;
    if (coverageCode === 'PL') {
      reportMs = inceptionMs + offsetMs;
      occurrenceMs = reportMs - lagMs;
    } else {
      occurrenceMs = inceptionMs + offsetMs;
      reportMs = occurrenceMs + lagMs;
    }

    // Not yet reported at the valuation date. This is genuine IBNR — the claim
    // exists in the world but not in the data, and the projection is what
    // accounts for it. Carrying a phantom row here would be double-counting.
    if (reportMs > valuationMs) continue;

    claims.push({
      seq: claims.length + 1,
      policyYear: yearCfg.year,
      inceptionMs,
      coverageCode,
      entityCanonical: entity.canonical,
      occurrenceMs,
      reportMs,
      reportAgeMonths: monthsBetween(inceptionMs, reportMs),
      rawSeverity: rng.lognormal(severity.logMean, severity.logSigma),
      yearAge,
      closeDraw: rng.next(),
    });
  }

  /* Scale severities so the year lands on its reported incurred target: the
   * stated ultimate, developed back to the current age. The distribution's
   * shape is preserved; only its level is set. The cap is applied after
   * scaling and the remainder redistributed, so the per-occurrence retention
   * actually binds. */
  const target = yearCfg.trueUltimate * patternAt(pattern, yearAge);
  const cap = severity.cap;

  let scale = target / claims.reduce((s, c) => s + c.rawSeverity, 0);
  for (let pass = 0; pass < 6; pass += 1) {
    let capped = 0;
    let uncappedRaw = 0;
    for (const c of claims) {
      if (c.rawSeverity * scale >= cap) capped += cap;
      else uncappedRaw += c.rawSeverity;
    }
    if (uncappedRaw <= 0) break;
    const nextScale = (target - capped) / uncappedRaw;
    if (Math.abs(nextScale - scale) / scale < 1e-6) break;
    scale = nextScale;
  }

  for (const c of claims) {
    c.incurred = Math.round(Math.min(cap, c.rawSeverity * scale));
  }

  return { claims, yearAge };
}

/* ---------- Raw feed shaping ---------- */

const TPA_STATUS = { OPEN: 'O', CLOSED: 'C', REOPENED: 'R' };
const REG_STATUS = { OPEN: 'Open', CLOSED: 'Closed', REOPENED: 'Reopened' };
const BAD_COVERAGE = ['PROF-LIAB', 'P/L', 'GL-2', 'GENERAL LIAB', 'PROF LIAB', ''];

function claimNumber(claim) {
  if (claim.claimNo) return claim.claimNo;
  return `${claim.coverageCode}-${claim.policyYear}-${String(claim.seq).padStart(5, '0')}`;
}

function emitRaw(claim, system, overrides = {}) {
  const base = {
    __system: system,
    __rowId: overrides.__rowId || `${system}:${claimNumber(claim)}`,
  };

  if (system === 'TPA-LOSSRUN') {
    return {
      ...base,
      claim_number: overrides.claim_number ?? claimNumber(claim),
      insured: overrides.insured ?? claim.entityCanonical,
      cov: overrides.cov ?? claim.coverageCode,
      dol: overrides.dol ?? toUS(claim.occurrenceMs),
      date_reported: overrides.date_reported ?? toUS(claim.reportMs),
      stat: overrides.stat ?? TPA_STATUS[claim.status],
      paid_ind: overrides.paid_ind ?? claim.paidIndemnity,
      paid_exp: overrides.paid_exp ?? claim.paidExpense,
      reserve: overrides.reserve ?? claim.caseReserve,
      reserve_date:
        'reserve_date' in overrides ? overrides.reserve_date : toUS(claim.reserveAsOfMs),
    };
  }

  return {
    ...base,
    ClaimNo: overrides.ClaimNo ?? claimNumber(claim),
    Entity: overrides.Entity ?? claim.entityCanonical,
    Coverage: overrides.Coverage ?? claim.coverageCode,
    OccurrenceDate: overrides.OccurrenceDate ?? toISO(claim.occurrenceMs),
    ReportDate: overrides.ReportDate ?? toISO(claim.reportMs),
    Status: overrides.Status ?? REG_STATUS[claim.status],
    Indemnity: overrides.Indemnity ?? claim.paidIndemnity,
    Expense: overrides.Expense ?? claim.paidExpense,
    CaseReserve: overrides.CaseReserve ?? claim.caseReserve,
    ReserveAsOf:
      'ReserveAsOf' in overrides ? overrides.ReserveAsOf : toISO(claim.reserveAsOfMs),
  };
}

/** Absorb a change to one claim across the rest of its policy year, so the
 *  year still lands on its incurred target. Used whenever a claim is set
 *  explicitly rather than drawn — planting a figure should change which claim
 *  carries the loss, not how much loss the year has. */
function rescaleYear(claims, year, delta, exclude) {
  const others = claims.filter(
    (c) => c.policyYear === year && c !== exclude && !c.isHero && !c.atRetention && c.incurred > 0
  );
  const total = others.reduce((s, c) => s + c.incurred, 0);
  if (total <= 0) return;
  const factor = (total - delta) / total;
  for (const c of others) {
    const paid = Math.round((c.paidIndemnity + c.paidExpense) * factor);
    c.incurred = Math.round(c.incurred * factor);
    c.paidExpense = Math.round(paid * (c.status === 'CLOSED' ? 0.18 : 0.26));
    c.paidIndemnity = paid - c.paidExpense;
    c.caseReserve = Math.max(0, c.incurred - paid);
  }
}

/** Evenly spaced picks from a candidate list. Deterministic, and it spreads
 *  planted defects across the book instead of clustering them at the front
 *  where a reader would notice the pattern before the detector does. */
function pickEvenly(candidates, n) {
  if (n <= 0 || candidates.length === 0) return [];
  const take = Math.min(n, candidates.length);
  const stride = candidates.length / take;
  const out = [];
  for (let i = 0; i < take; i += 1) {
    out.push(candidates[Math.floor(i * stride)]);
  }
  return out;
}

/* ---------- Entry point ---------- */

export function synthesize(config) {
  const { meta, program, schema, generation } = config;
  const rng = makeRng(meta.seed);
  const valuationMs = parseISO(meta.valuationDate);
  const pattern = generation.developmentPattern;

  /* --- 1. Canonical population --- */

  const claims = [];
  for (const yearCfg of generation.policyYears) {
    const built = buildYear(yearCfg, generation, schema, rng, valuationMs, pattern);

    for (const c of built.claims) {
      const sizeDrag = Math.min(0.9, c.incurred / generation.severity.cap);
      const isClosed = c.closeDraw < yearCfg.closedShare * (1 - sizeDrag * 0.55);

      const maturity = Math.min(1, Math.max(0, (c.yearAge - c.reportAgeMonths) / 30));
      const paidShare = isClosed ? 1 : 0.15 + 0.55 * maturity;
      const paidTotal = Math.round(c.incurred * paidShare);
      const expenseShare = isClosed ? 0.18 : 0.26;

      c.status = isClosed ? 'CLOSED' : 'OPEN';
      c.paidExpense = Math.round(paidTotal * expenseShare);
      c.paidIndemnity = paidTotal - c.paidExpense;
      c.caseReserve = Math.max(0, c.incurred - paidTotal);
      c.claimNo = claimNumber(c);
      c.entity = c.entityCanonical;
      c.occurrenceDate = toISO(c.occurrenceMs);
      c.reportDate = toISO(c.reportMs);
      c.reserveAsOfMs = Math.min(valuationMs, addMonths(c.reportMs, 2));

      claims.push(c);
    }
  }

  /* --- 2. The hero claim ---
   * Planted explicitly rather than discovered, because the caught-error
   * narrative depends on its exact size. The rest of the policy year is
   * rescaled so the year still lands on its reported target. */

  const hero = config.caughtError;
  const heroYear = hero.policyYear;
  const candidates = claims.filter(
    (c) => c.policyYear === heroYear && c.status === 'OPEN' && c.coverageCode === 'PL'
  );
  const heroClaim = candidates[Math.floor(candidates.length / 3)];

  /* The hero is given a specific claim number so the caught-error narrative can
   * name it. That number has to be free.
   *
   * Reconciliation groups duplicates on a key that compares the sequence
   * segment numerically, so PL-2026-00188 and PL-2026-0188 collapse together —
   * which is the whole point. But it means any genuine claim already holding
   * sequence 188 collapses in with them, gets merged away as a duplicate, and
   * disappears from the book with no exception raised. A demonstration about
   * data quality silently deleting a real claim is the worst possible bug to
   * ship, so the number is vacated before it is assigned. */
  const heroKey = (no) => {
    const parts = String(no).toUpperCase().split('-');
    return parts.length < 3 ? String(no) : [...parts.slice(0, -1), String(parseInt(parts[parts.length - 1], 10))].join('|');
  };
  const reserved = new Set(hero.claimNumbers.map(heroKey));
  let nextSeq = Math.max(...claims.map((c) => c.seq)) + 1;
  for (const c of claims) {
    if (c === heroClaim || !reserved.has(heroKey(c.claimNo))) continue;
    c.seq = nextSeq;
    nextSeq += 1;
    c.claimNo = `${c.coverageCode}-${c.policyYear}-${String(c.seq).padStart(5, '0')}`;
  }

  const heroPrevIncurred = heroClaim.incurred;
  const heroIncurred = hero.caseReserve + 83000;
  heroClaim.claimNo = hero.claimNumbers[0];
  heroClaim.entity = 'Calder Diagnostics LLC';
  heroClaim.entityCanonical = 'Calder Diagnostics LLC';
  heroClaim.caseReserve = hero.caseReserve;
  heroClaim.paidIndemnity = 61000;
  heroClaim.paidExpense = 22000;
  heroClaim.incurred = heroIncurred;
  heroClaim.isHero = true;
  heroClaim.forceSystem = 'TPA-LOSSRUN';

  rescaleYear(claims, heroYear, heroIncurred - heroPrevIncurred, heroClaim);

  /* --- 2b. Claims that genuinely sit at the retention ---
   * The limit-conformance defect needs claims that are actually at the
   * retention, not small claims inflated to look that way. Reconciliation caps
   * an over-limit row at the retention, so if the underlying claim were small,
   * the cap would leave it far above its true size and the planted defect would
   * be distorting the book rather than only the extract. */

  const overLimitCount = config.defects.find((d) => d.id === 'paid-over-limit').count;
  const atRetention = [...claims]
    .filter((c) => !c.isHero)
    .sort((a, b) => b.incurred - a.incurred)
    .slice(0, overLimitCount);

  for (const c of atRetention) {
    const delta = program.retentionPerClaim - c.incurred;
    c.incurred = program.retentionPerClaim;
    const paid = Math.round(c.incurred * (c.status === 'CLOSED' ? 1 : 0.42));
    c.paidExpense = Math.round(paid * 0.26);
    c.paidIndemnity = paid - c.paidExpense;
    c.caseReserve = Math.max(0, c.incurred - paid);
    c.atRetention = true;
    rescaleYear(claims, c.policyYear, delta, c);
  }

  /* --- 3. Raw feed with planted defects --- */

  const raw = [];
  const defectLog = [];
  const byId = new Map(config.defects.map((d) => [d.id, { ...d, planted: [] }]));
  const calder = schema.entities.find((e) => e.variants.length > 0);

  // Assign a source system per claim first, so defect selection can depend on
  // which system a row came from.
  for (const c of claims) {
    c.system =
      c.forceSystem ||
      (rng.next() < schema.sourceSystems[0].share ? 'TPA-LOSSRUN' : 'INTERNAL-REGISTER');
  }

  const targets = new Map(claims.map((c) => [c.claimNo, {}]));
  const mark = (claim, defectId, apply) => {
    Object.assign(targets.get(claim.claimNo), apply);
    targets.get(claim.claimNo).__defects = [
      ...(targets.get(claim.claimNo).__defects || []),
      defectId,
    ];
  };

  const isTpa = (c) => c.system === 'TPA-LOSSRUN';

  pickEvenly(
    claims.filter((c) => c.entityCanonical === calder.canonical && !c.isHero),
    byId.get('entity-variants').count
  ).forEach((c, i) => {
    const variant = calder.variants[i % calder.variants.length];
    mark(c, 'entity-variants', isTpa(c) ? { insured: variant } : { Entity: variant });
  });

  pickEvenly(
    claims.filter((c) => c.caseReserve > 0 && !c.isHero),
    byId.get('null-reserve-date').count
  ).forEach((c) => {
    mark(c, 'null-reserve-date', isTpa(c) ? { reserve_date: null } : { ReserveAsOf: null });
  });

  pickEvenly(
    claims.filter((c) => !c.isHero),
    byId.get('unmapped-coverage').count
  ).forEach((c, i) => {
    const bad = BAD_COVERAGE[i % BAD_COVERAGE.length];
    mark(c, 'unmapped-coverage', isTpa(c) ? { cov: bad } : { Coverage: bad });
  });

  // The extract overstates these by the amount the excess layer should have
  // taken off. The underlying claims are genuinely at retention.
  claims
    .filter((c) => c.atRetention)
    .forEach((c, i) => {
      const inflated = program.retentionPerClaim + 40000 + i * 15000;
      const reserve = inflated - c.paidIndemnity - c.paidExpense;
      mark(c, 'paid-over-limit', isTpa(c) ? { reserve } : { CaseReserve: reserve });
    });

  pickEvenly(
    claims.filter((c) => !c.isHero),
    byId.get('report-before-occurrence').count
  ).forEach((c) => {
    mark(
      c,
      'report-before-occurrence',
      isTpa(c)
        ? { dol: toUS(c.reportMs), date_reported: toUS(c.occurrenceMs) }
        : { OccurrenceDate: toISO(c.reportMs), ReportDate: toISO(c.occurrenceMs) }
    );
  });

  for (const c of claims) {
    const overrides = { ...targets.get(c.claimNo) };
    const planted = overrides.__defects || [];
    delete overrides.__defects;

    const row = emitRaw(c, c.system, overrides);
    raw.push(row);
    planted.forEach((id) => {
      byId.get(id).planted.push(row.__rowId);
      defectLog.push({ defectId: id, rowId: row.__rowId, claimNo: c.claimNo });
    });
  }

  /* --- 4. The duplicates ---
   * The hero duplicate carries a transcribed claim number and a different
   * spelling of the insured, so neither exact-match nor entity-match dedup
   * catches it. Two smaller duplicates in prior years give the detector
   * something to find that is not the headline. */

  function plantDuplicate(claim, mangledNo, entityText, system) {
    const row = emitRaw(claim, system, {
      __rowId: `${system}:${mangledNo}`,
      ...(system === 'TPA-LOSSRUN'
        ? { claim_number: mangledNo, insured: entityText }
        : { ClaimNo: mangledNo, Entity: entityText }),
    });
    row.__duplicateOf = claim.claimNo;
    raw.push(row);
    byId.get('dup-claimno').planted.push(row.__rowId);
    defectLog.push({ defectId: 'dup-claimno', rowId: row.__rowId, claimNo: claim.claimNo });
    return row;
  }

  const heroDuplicate = plantDuplicate(
    heroClaim,
    hero.claimNumbers[1],
    hero.entitySpellings[1],
    'INTERNAL-REGISTER'
  );
  heroDuplicate.__hero = true;

  const priorDupes = claims.filter(
    (c) => c.policyYear < heroYear && c.caseReserve > 25000 && c.system === 'INTERNAL-REGISTER'
  );
  pickEvenly(priorDupes, Math.max(0, byId.get('dup-claimno').count - 1)).forEach((c) => {
    plantDuplicate(
      c,
      c.claimNo.replace(/-0(\d{4})$/, '-$1'),
      c.entityCanonical,
      'TPA-LOSSRUN'
    );
  });

  return {
    config,
    valuationMs,
    pattern,
    claims,
    raw,
    heroClaim,
    heroDuplicate,
    defects: [...byId.values()],
    defectLog,
    counts: {
      claims: claims.length,
      rawRows: raw.length,
    },
  };
}

export { parseISO, toISO, toUS, addMonths };
