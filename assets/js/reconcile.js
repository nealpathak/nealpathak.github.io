/* Reconciliation: normalize the raw feed, and flag what doesn't reconcile.
 *
 * The governing rule is that nothing is silently fixed. Every transformation
 * either (a) follows a stated mapping rule and is logged, or (b) becomes an
 * exception that a human confirms before it moves downstream.
 *
 * This is the stage that decides whether anyone believes the rest of the page.
 * A reconciliation layer that quietly cleans its inputs is indistinguishable
 * from one that quietly corrupts them.
 */

import { parseISO } from './generate.js';

/* ---------- Normalizers ---------- */

const LEGAL_SUFFIXES = /\b(LLC|L L C|INC|INCORPORATED|LP|LLP|PLLC|CORP|CO|PC)\b/g;

/** Collapse an insured name to a comparison key. Punctuation, casing, and
 *  legal suffixes carry no identity information on this book. */
export function entityKey(name) {
  if (!name) return '';
  return String(name)
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(LEGAL_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse a claim number to a comparison key. The sequence segment is
 *  compared numerically, which is what catches a transcribed digit count. */
export function claimKey(claimNo) {
  if (!claimNo) return '';
  const parts = String(claimNo).toUpperCase().trim().split('-');
  if (parts.length < 3) return String(claimNo).toUpperCase().trim();
  const seq = String(parseInt(parts[parts.length - 1], 10));
  return [...parts.slice(0, -1), seq].join('|');
}

const STATUS_MAP = {
  O: 'OPEN', OPEN: 'OPEN',
  C: 'CLOSED', CLOSED: 'CLOSED',
  R: 'REOPENED', REOPENED: 'REOPENED',
};

const COVERAGE_MAP = {
  PL: 'PL', 'PROF-LIAB': 'PL', 'P/L': 'PL', 'PROF LIAB': 'PL', 'PROFESSIONAL LIABILITY': 'PL',
  GL: 'GL', 'GL-2': 'GL', 'GENERAL LIAB': 'GL', 'GENERAL LIABILITY': 'GL',
};

function normalizeDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/** Field mapping per source system. Stated as data so the mapping itself is
 *  auditable rather than buried in a parser. */
const FIELD_MAP = {
  'TPA-LOSSRUN': {
    claimNo: 'claim_number', insuredEntity: 'insured', coverageCode: 'cov',
    occurrenceDate: 'dol', reportDate: 'date_reported', status: 'stat',
    paidIndemnity: 'paid_ind', paidExpense: 'paid_exp', caseReserve: 'reserve',
    reserveAsOf: 'reserve_date',
  },
  'INTERNAL-REGISTER': {
    claimNo: 'ClaimNo', insuredEntity: 'Entity', coverageCode: 'Coverage',
    occurrenceDate: 'OccurrenceDate', reportDate: 'ReportDate', status: 'Status',
    paidIndemnity: 'Indemnity', paidExpense: 'Expense', caseReserve: 'CaseReserve',
    reserveAsOf: 'ReserveAsOf',
  },
};

/* ---------- Exception construction ---------- */

let exceptionSeq = 0;

/* Every exception lands in exactly one of three dispositions, and the three
 * partition the set — so the counts on the page add up, and so no exception can
 * quietly be both "held" and reflected in the figures:
 *
 *   autoResolved  applied under a stated mapping rule, and logged
 *   confirmed     applied because a person confirmed it
 *   held          NOT applied; its effect is quantified as pendingImpact
 *
 * appliedImpact is movement already in the reported figure. pendingImpact is
 * movement that would happen if a held exception resolves as proposed. Keeping
 * them in separate fields is what stops the two being conflated.
 */
function exception(spec) {
  exceptionSeq += 1;
  const e = {
    id: `EX-${String(exceptionSeq).padStart(3, '0')}`,
    appliedImpact: 0,
    pendingImpact: 0,
    autoResolved: false,
    confirmed: false,
    confidence: null,
    ...spec,
  };
  e.applied = e.autoResolved || e.confirmed;
  e.requiresHuman = !e.applied;
  return e;
}

/* ---------- Main ---------- */

export function reconcile(synth) {
  exceptionSeq = 0;
  const { raw, config } = synth;
  const { schema, program } = config;
  const canonicalKeys = new Map(
    schema.entities.map((e) => [entityKey(e.canonical), e.canonical])
  );

  const exceptions = [];
  const rows = [];

  /* --- Pass 1: schema conformance and per-row integrity --- */

  for (const rawRow of raw) {
    const map = FIELD_MAP[rawRow.__system];
    const row = { __rowId: rawRow.__rowId, __system: rawRow.__system, __raw: rawRow };

    row.claimNo = String(rawRow[map.claimNo] ?? '').trim();
    row.insuredRaw = rawRow[map.insuredEntity];
    row.coverageRaw = rawRow[map.coverageCode];
    row.occurrenceDate = normalizeDate(rawRow[map.occurrenceDate]);
    row.reportDate = normalizeDate(rawRow[map.reportDate]);
    row.reserveAsOf = normalizeDate(rawRow[map.reserveAsOf]);
    row.paidIndemnity = Number(rawRow[map.paidIndemnity]) || 0;
    row.paidExpense = Number(rawRow[map.paidExpense]) || 0;
    row.caseReserve = Number(rawRow[map.caseReserve]) || 0;
    row.incurred = row.paidIndemnity + row.paidExpense + row.caseReserve;

    // Status
    const statusRaw = String(rawRow[map.status] ?? '').trim().toUpperCase();
    row.status = STATUS_MAP[statusRaw] || null;

    // Coverage code. Flagged whenever the incoming value is not already a
    // canonical program code — including the values a mapping rule can resolve.
    // A mapping that fires silently is a mapping nobody reviews, and the day it
    // maps the wrong way there is no record that it ever ran.
    const covRaw = String(row.coverageRaw ?? '').trim().toUpperCase();
    const covMapped = COVERAGE_MAP[covRaw];
    row.coverageCode = covMapped || null;
    if (!schema.coverageCodes.includes(covRaw)) {
      const resolvable = Boolean(covMapped);
      exceptions.push(
        exception({
          defectId: 'unmapped-coverage',
          severity: resolvable ? 'low' : 'medium',
          title: resolvable
            ? `Coverage code "${covRaw}" is outside the schema`
            : 'Coverage code is blank',
          detail: resolvable
            ? `The extract carries a free-text coverage value that does not match a canonical program code. A mapping rule exists and was applied; the row is logged so the mapping stays auditable.`
            : `No coverage value on the row. Coverage part cannot be inferred from the claim number alone, so the row is held.`,
          rowIds: [row.__rowId],
          claimNo: row.claimNo,
          proposedAction: resolvable
            ? `Map "${covRaw}" to its canonical code`
            : 'Hold for coverage part assignment by claims operations',
          autoResolved: resolvable,
        })
      );
    }

    // Entity resolution
    const key = entityKey(row.insuredRaw);
    const canonical = canonicalKeys.get(key);
    row.insuredEntity = canonical || row.insuredRaw;
    if (canonical && canonical !== row.insuredRaw) {
      exceptions.push(
        exception({
          defectId: 'entity-variants',
          severity: 'high',
          title: `Insured "${row.insuredRaw}" resolves to ${canonical}`,
          detail:
            'The same insured appears under multiple spellings across source systems. Left unresolved, its experience splits across apparent entities and its loss ratio is understated in every one of them.',
          rowIds: [row.__rowId],
          claimNo: row.claimNo,
          proposedAction: `Resolve to ${canonical}`,
          autoResolved: true,
        })
      );
    }

    // Temporal integrity — impossible ordering
    if (row.occurrenceDate && row.reportDate && row.reportDate < row.occurrenceDate) {
      exceptions.push(
        exception({
          defectId: 'report-before-occurrence',
          severity: 'medium',
          title: `Report date precedes occurrence date on ${row.claimNo}`,
          detail: `Reported ${row.reportDate}, occurred ${row.occurrenceDate}. Almost always a transposition at entry. On claims-made coverage this can also land the claim in the wrong policy year, so it is corrected rather than ignored.`,
          rowIds: [row.__rowId],
          claimNo: row.claimNo,
          proposedAction: 'Swap the two dates and re-derive policy year',
          autoResolved: true,
        })
      );
      row.__dateSwapped = true;
    }

    // Temporal integrity — undated reserve movement
    if (row.reserveAsOf === null && row.caseReserve > 0) {
      exceptions.push(
        exception({
          defectId: 'null-reserve-date',
          severity: 'medium',
          title: `Reserve movement on ${row.claimNo} carries no effective date`,
          detail:
            'The reserve cannot be assigned to a development period, so the claim is excluded from the triangle until dated. It still counts toward current incurred — it is the development history that is unusable, not the amount.',
          rowIds: [row.__rowId],
          claimNo: row.claimNo,
          proposedAction: 'Obtain effective date from the TPA file; excluded from the triangle in the interim',
        })
      );
      row.__excludeFromTriangle = true;
    }

    /* Limit conformance.
     *
     * The cap is deliberately NOT applied. Capping this claim at the retention
     * reduces the amount charged against the aggregate on the assumption that
     * the excess layer responds — and that assumption is exactly what has not
     * been confirmed. Applying it would mean the reported position depends on
     * an unconfirmed cession, which is the aggressive reading, not the
     * conservative one.
     *
     * So the claim stays at full incurred until someone confirms cession, and
     * the effect of confirming it is quantified separately. The board sees the
     * conservative number and the size of the question attached to it. */
    if (row.incurred > program.retentionPerClaim) {
      exceptions.push(
        exception({
          defectId: 'paid-over-limit',
          severity: 'critical',
          title: `${row.claimNo} exceeds the per-claim retention`,
          detail: `Incurred of $${row.incurred.toLocaleString('en-US')} sits above the $${program.retentionPerClaim.toLocaleString('en-US')} retention. Either the excess layer was not applied on the extract, or the claim genuinely pierced retention and was never ceded. The claim is carried at full incurred until cession is confirmed: capping it first would let an unconfirmed recovery reduce the aggregate.`,
          rowIds: [row.__rowId],
          claimNo: row.claimNo,
          proposedAction: `Confirm cession with the fronting carrier. If confirmed, $${(row.incurred - program.retentionPerClaim).toLocaleString('en-US')} comes off the aggregate.`,
          requiresHuman: true,
          applied: false,
          pendingImpact: -(row.incurred - program.retentionPerClaim),
          confidence: null,
        })
      );
      row.__overLimitBy = row.incurred - program.retentionPerClaim;
    }

    /* Policy year from the coverage basis. A row whose coverage never mapped
     * has no basis, so it gets no policy year — it must not fall through to
     * the occurrence basis and quietly reassign a claims-made claim to the
     * year it happened rather than the year it was reported. */
    if (row.coverageCode === 'PL') {
      row.policyYear = row.reportDate ? Number(row.reportDate.slice(0, 4)) : null;
    } else if (row.coverageCode === 'GL') {
      row.policyYear = row.occurrenceDate ? Number(row.occurrenceDate.slice(0, 4)) : null;
    } else {
      row.policyYear = null;
      row.__unassigned = true;
    }

    rows.push(row);
  }

  /* --- Pass 2: identity resolution across the full feed ---
   * Grouped on the normalized claim key, which compares the sequence segment
   * numerically. This is what catches a claim number that lost a digit in
   * transcription — exact matching cannot, and neither can matching on the
   * insured when the insured is also spelled differently. */

  const groups = new Map();
  for (const row of rows) {
    const key = claimKey(row.claimNo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicateRowIds = new Set();
  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    /* Survivorship goes to the system of record — the TPA loss run — not to
     * whichever row carries the larger number. Keeping the highest incurred
     * would bias reserves upward on every merge, and no auditor accepts a
     * dedup rule that only ever rounds in one direction. */
    const sorted = [...group].sort((a, b) => {
      const rank = (r) => (r.__system === 'TPA-LOSSRUN' ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (b.reserveAsOf || '').localeCompare(a.reserveAsOf || '');
    });
    const keep = sorted[0];
    const drop = sorted.slice(1);
    drop.forEach((r) => duplicateRowIds.add(r.__rowId));

    const doubleCounted = drop.reduce((s, r) => s + r.incurred, 0);
    const spellings = [...new Set(group.map((r) => String(r.insuredRaw)))];
    const numbers = [...new Set(group.map((r) => r.claimNo))];
    const isHero = group.some((r) => r.__raw.__hero);

    const heroNarrative = config.caughtError.narrative;

    exceptions.push(
      exception({
        defectId: 'dup-claimno',
        severity: 'critical',
        title: `${numbers.join(' and ')} are the same claim`,
        detail: isHero
          ? `${heroNarrative.assertion} ${heroNarrative.consequence}`
          : `Claim numbers ${numbers.join(' and ')} normalize to the same identity (${key}). The record appears in both source systems and the incurred amount would be counted twice.`,
        rowIds: group.map((r) => r.__rowId),
        keepRowId: keep.__rowId,
        claimNo: numbers[0],
        spellings,
        proposedAction: `Merge onto ${keep.claimNo}, retaining the ${keep.__system} record`,
        // Applied because a person confirmed it, not because the matcher was
        // sure. The match score sat below the auto-merge threshold — that is
        // why it reached a human at all.
        confirmed: true,
        appliedImpact: -doubleCounted,
        matchConfidence: isHero ? config.caughtError.confidence : 0.91,
        isHero,
        narrative: isHero ? heroNarrative : null,
      })
    );
  }

  /* --- Pass 3: emit the reconciled population --- */

  const reconciled = rows
    .filter((r) => !duplicateRowIds.has(r.__rowId))
    .map((r) => {
      const out = { ...r };
      if (r.__dateSwapped) {
        out.occurrenceDate = r.reportDate;
        out.reportDate = r.occurrenceDate;
        const anchor = out.coverageCode === 'PL' ? out.reportDate : out.occurrenceDate;
        out.policyYear = anchor ? Number(anchor.slice(0, 4)) : null;
      }
      // The over-limit cap is deliberately NOT applied here. See the limit
      // conformance exception: reducing incurred on an unconfirmed cession
      // would make the reported position depend on a recovery nobody has
      // confirmed. The claim stays gross; the effect of confirming is carried
      // separately as pendingByYear.
      return out;
    });

  /* --- Totals, both ways ---
   * The naive figure is what a straight sum of the feed produces. Showing both
   * is the point: the gap between them is the value of the stage. */

  const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
  const byYear = (list, year) => list.filter((r) => r.policyYear === year);

  const naiveTotals = {};
  const reconciledTotals = {};
  for (const year of program.policyYears) {
    naiveTotals[year] = sum(byYear(rows, year), (r) => r.incurred);
    reconciledTotals[year] = sum(byYear(reconciled, year), (r) => r.incurred);
  }

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  exceptions.forEach((e) => {
    bySeverity[e.severity] += 1;
  });

  /* What confirming the held exceptions would do to each policy year. This is
   * the number the board is actually being asked about: the reported position
   * is the conservative one, and this is how far it moves if the pending
   * questions resolve as proposed. */
  const pendingByYear = {};
  for (const year of program.policyYears) pendingByYear[year] = 0;
  const rowYear = new Map(reconciled.map((r) => [r.__rowId, r.policyYear]));
  for (const e of exceptions) {
    if (e.applied || !e.pendingImpact) continue;
    const year = rowYear.get(e.rowIds[0]);
    if (year in pendingByYear) pendingByYear[year] += e.pendingImpact;
  }

  const disposition = {
    appliedUnderRule: exceptions.filter((e) => e.autoResolved).length,
    appliedConfirmed: exceptions.filter((e) => e.confirmed).length,
    heldNotApplied: exceptions.filter((e) => !e.applied).length,
  };

  return {
    rows,
    reconciled,
    exceptions,
    duplicateRowIds,
    heroException: exceptions.find((e) => e.isHero) || null,
    pendingByYear,
    summary: {
      rawRows: rows.length,
      reconciledRows: reconciled.length,
      removed: rows.length - reconciled.length,
      unassigned: reconciled.filter((r) => r.__unassigned).length,
      exceptionCount: exceptions.length,
      bySeverity,
      ...disposition,
      // Movement already reflected in the reported figures.
      appliedImpact: sum(exceptions, (e) => e.appliedImpact),
      // Movement that would happen if every held exception resolves as proposed.
      pendingImpact: sum(exceptions, (e) => (e.applied ? 0 : e.pendingImpact)),
    },
    naiveTotals,
    reconciledTotals,
  };
}
