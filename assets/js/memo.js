/* The quarterly board capacity memo, assembled from computed values.
 *
 * Nothing in here is written prose with numbers typed into it. Every figure is
 * a traced value: it carries the method that produced it and the rows it came
 * from, and the reader can open either. The narrative is templated around those
 * values, so changing an assumption changes the sentences, not just the tables.
 *
 * That is the whole argument. A memo a machine drafts is unremarkable. A memo
 * whose every assertion can be audited in two clicks is a different object.
 */

import { el, fmt, traced, inlineTraced, dataTable, badge } from './render.js';

/** Wrap a value with its provenance so it can be rendered as a traced figure. */
function t(value, method, rows = [], rowCount = null) {
  return {
    value,
    trace: {
      method,
      rowCount: rowCount ?? rows.length,
      total: value,
      rows,
    },
  };
}

/** A paragraph whose traced figures drop their source panels directly beneath
 *  it, rather than splitting the sentence they sit in. */
function para(parts, cls = '') {
  const host = el('div', { class: 'memo__traces' });
  const nodes = parts.map((p) => (typeof p === 'function' ? p(host) : p));
  return el('div', { class: `memo__para ${cls}` }, [el('p', {}, nodes), host]);
}

function section(id, heading, children) {
  return el('section', { class: 'memo__section', id: `memo-${id}` }, [
    el('h3', { class: 'memo__heading', text: heading }),
    ...children.filter(Boolean),
  ]);
}

function hostFor(children) {
  const host = el('div', { class: 'memo__traces' });
  return { host, node: el('div', {}, [...children, host]) };
}

/* ---------- Sections ---------- */

function execSummary(p, recon) {
  const cur = p.current;
  const trend = p.years.map((y) => fmt.pct(y.projectedPct, 1)).join(', ');

  const headroomTone = cur.projectedPct > 1 ? 'alert' : cur.projectedPct > 0.9 ? 'warn' : 'ok';

  return section('summary', 'Executive summary', [
    para([
      `At ${fmt.date(p.valuationDate)} the ${p.currentYear} policy year has consumed `,
      (h) => inlineTraced(t(cur.consumedPct, `Reconciled incurred of ${fmt.money(cur.latest.value)} against an annual aggregate of ${fmt.money(p.aggregate)}`, cur.latest.trace.rows, cur.latest.trace.rowCount), 'percent', h),
      ' of the ',
      (h) => inlineTraced(t(p.aggregate, 'Annual aggregate per the program structure, adjustable as a renewal assumption'), 'money', h),
      ' annual aggregate on reported incurred of ',
      (h) => inlineTraced(cur.latest, 'money', h),
      '. Developed to ultimate, the year projects ',
      (h) => inlineTraced(cur.ultimate, 'money', h),
      ' — ',
      (h) => inlineTraced(t(cur.projectedPct, `Projected ultimate of ${fmt.money(cur.ultimate.value)} against an aggregate of ${fmt.money(p.aggregate)}`, cur.ultimate.trace.rows, cur.ultimate.trace.rowCount), 'percent', h),
      cur.headroom >= 0 ? ' of the aggregate, leaving ' : ' of the aggregate, breaching it by ',
      (h) => inlineTraced(t(Math.abs(cur.headroom), `Annual aggregate less projected ultimate for policy year ${p.currentYear}`, cur.ultimate.trace.rows, cur.ultimate.trace.rowCount), 'money', h),
      cur.headroom >= 0 ? ' of headroom.' : '.',
    ]),

    para([
      `Projected consumption has risen in every policy year on the book: ${trend}. `,
      'That trend, rather than any single claim, is the reason this memo recommends a change to the renewal structure.',
    ]),

    p.correction.exception
      ? para([
          'Reconciliation removed ',
          (h) => inlineTraced(t(p.correction.reportedDelta, `Incurred removed from the ${p.currentYear} reported figure by reconciliation. Duplicate merges only — over-limit claims are carried gross pending confirmation of cession, not removed.`), 'money', h),
          Math.abs(p.correction.reportedDelta - p.correction.heroReported) < 1
            ? ' of double-counted incurred from the reported figure, all of it one duplicate — '
            : ' of double-counted incurred from the reported figure. One duplicate accounted for ',
          Math.abs(p.correction.reportedDelta - p.correction.heroReported) < 1
            ? ''
            : (h) => inlineTraced(t(p.correction.heroReported, `Full incurred on the duplicate row flagged by identity resolution: ${p.correction.exception.title}`), 'money', h),
          Math.abs(p.correction.reportedDelta - p.correction.heroReported) < 1
            ? 'which the development factor would have carried into the projection as '
            : ' of that, which the development factor would have carried into the projection as ',
          (h) => inlineTraced(t(p.correction.heroProjected, `Duplicated incurred of ${fmt.money(p.correction.heroReported)} multiplied by the age-to-ultimate factor of ${fmt.factor(p.correction.magnification)} at ${p.current.age} months`), 'money', h),
          '. Uncorrected, the year would have been reported at ',
          (h) => inlineTraced(t(p.correction.naivePct, `Projected ultimate on the unreconciled feed against the annual aggregate`), 'percent', h),
          p.correction.flipsBreach
            ? ' of aggregate, against a reported position that sits inside it.'
            : ' of aggregate.',
        ])
      : null,

    // The reported figure is the conservative end of a range, not a point. The
    // board is being asked to close the other end.
    p.current.pending
      ? para([
          'That reported position is the conservative reading. ',
          `${fmt.int(recon.summary.heldNotApplied)} exceptions are held and have not been applied. `,
          (() => {
            const n = p.sizeOfLoss[p.sizeOfLoss.length - 1].byYear[p.currentYear].count;
            if (!n) return 'None of them changes this year\'s incurred. ';
            return `Among them ${fmt.int(n)} claim${n === 1 ? ' is' : 's are'} carried at full incurred because cession above the per-claim retention has not been confirmed. `;
          })(),
          'If every held exception resolves as proposed, ',
          `${p.currentYear} projects `,
          (h) => inlineTraced(t(p.current.resolvedUltimate, `Triangle incurred adjusted by the ${fmt.money(p.current.pending)} of held exceptions for ${p.currentYear}, developed at ${fmt.factor(p.current.cdf)}`), 'money', h),
          ` instead — ${fmt.pct(p.current.resolvedPct, 1)} of aggregate. `,
          p.current.breach && !p.current.resolvedBreach
            ? 'The difference straddles the aggregate: confirming cession is what moves this year from a projected breach to headroom, and it is a phone call to the fronting carrier rather than a capital decision.'
            : 'The gap between the two is the size of the question the board is being asked to close.',
        ])
      : null,

    para([
      'Against projected ultimate liabilities the captive holds ',
      (h) => inlineTraced(p.capital.funded, 'money', h),
      ' of funded surplus against a required position of ',
      (h) => inlineTraced(p.capital.required, 'money', h),
      ` — a funding ratio of ${fmt.pct(p.capital.ratio, 1)}, `,
      p.capital.adequate
        ? `a surplus of ${fmt.money(p.capital.surplus)}.`
        : `a shortfall of ${fmt.money(-p.capital.surplus)}.`,
    ]),

    el('div', { class: 'stat-row' }, [
      el('div', { class: `stat stat--${headroomTone}` }, [
        el('div', { class: 'stat__label', text: `Projected ${p.currentYear} consumption` }),
        el('div', { class: 'stat__value', text: fmt.pct(cur.projectedPct, 1) }),
        // Headroom is not a quantity that goes negative. Past the aggregate it
        // is a breach, and printing "−$670,043 of headroom" reads as nobody
        // having proofread the thing the board is being asked to act on.
        el('div', {
          class: 'stat__note',
          text: cur.headroom >= 0
            ? `${fmt.money(cur.headroom)} headroom at expiry`
            : `Breaches the aggregate by ${fmt.money(-cur.headroom)}`,
        }),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat__label', text: 'Reported incurred to date' }),
        el('div', { class: 'stat__value', text: fmt.moneyShort(cur.latest.value) }),
        el('div', { class: 'stat__note', text: `${fmt.int(cur.claimCount)} claims at ${cur.age} months` }),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat__label', text: 'Funding ratio' }),
        el('div', { class: 'stat__value', text: fmt.pct(p.capital.ratio, 1) }),
        el('div', { class: 'stat__note', text: p.capital.adequate ? 'Above target margin' : 'Below target margin' }),
      ]),
      el('div', { class: `stat ${recon.summary.bySeverity.critical ? 'stat--warn' : ''}` }, [
        el('div', { class: 'stat__label', text: 'Exceptions held' }),
        el('div', { class: 'stat__value', text: fmt.int(recon.summary.heldNotApplied) }),
        el('div', { class: 'stat__note', text: `${recon.summary.bySeverity.critical} critical, of ${recon.summary.exceptionCount} raised` }),
      ]),
    ]),
  ]);
}

function overview(p, config) {
  const { program, meta } = config;
  const rows = [
    ['Captive', program.captive],
    ['Domicile', program.domicile],
    ['Structure', program.structure],
    ['Parent', program.parent],
    ['Coverages', program.coverages.map((c) => `${c.label} (${c.basis.toLowerCase()})`).join('; ')],
    ['Retention', `${fmt.money(program.retentionPerClaim)} per claim (PL) / per occurrence (GL)`],
    ['Annual aggregate', fmt.money(p.aggregate)],
    ['Policy years in force', program.policyYears.join(', ')],
    ['Valuation date', fmt.date(meta.valuationDate)],
    ['Claims on the book', `${fmt.int(p.totals.claims)} reconciled`],
  ];

  return section('overview', 'Program overview', [
    el('div', { class: 'table-wrap' }, [
      el('table', { class: 'table--kv' }, [
        el(
          'tbody',
          {},
          rows.map(([k, v]) => el('tr', {}, [el('th', { scope: 'row', text: k }), el('td', { text: v })]))
        ),
      ]),
    ]),
  ]);
}

function activity(p) {
  const q = p.quarter;
  const cur = q.current;
  const pri = q.prior;

  const cols = [
    { label: 'Measure', key: 'label' },
    { label: q.label, key: 'now', num: true },
    ...(pri ? [{ label: q.priorLabel, key: 'was', num: true }] : []),
    ...(pri ? [{ label: 'Change', key: 'delta', num: true }] : []),
  ];

  const mk = (label, now, was, kind) => ({
    label,
    now: kind === 'money' ? fmt.money(now) : fmt.int(now),
    was: pri ? (kind === 'money' ? fmt.money(was) : fmt.int(was)) : '—',
    delta: pri ? (kind === 'money' ? fmt.money(now - was) : fmt.int(now - was)) : '—',
  });

  const rows = [
    mk('Claims reported', cur.count, pri?.count ?? 0, 'int'),
    mk('Still open', cur.openCount, pri?.openCount ?? 0, 'int'),
    mk('Incurred on claims reported in period', cur.incurred, pri?.incurred ?? 0, 'money'),
    mk('Paid on those claims', cur.paid, pri?.paid ?? 0, 'money'),
    mk('Case reserves outstanding', cur.caseReserve, pri?.caseReserve ?? 0, 'money'),
  ];

  return section('activity', 'Quarterly claim activity', [
    dataTable(cols, rows),
    el('p', { class: 'small muted memo__note' }, [
      'Reported-date basis across all policy years. This is what arrived during the quarter, not what occurred during it — arrival is what moved the quarter\'s figures. Claims occurring in the period but not yet reported are carried in IBNR rather than here.',
    ]),
  ]);
}

function erosion(p) {
  const { host, node } = hostFor([]);

  const cols = [
    { label: 'Policy year', key: 'year' },
    { label: 'Age', key: 'age', num: true },
    { label: 'Claims', key: 'claims', num: true },
    { label: 'Reported incurred', key: 'incurred', num: true },
    { label: 'Consumed', key: 'consumed', num: true },
    { label: 'Factor', key: 'cdf', num: true },
    { label: 'Projected ultimate', key: 'ultimate', num: true },
    { label: 'Projected', key: 'projected', num: true },
    { label: 'Headroom', key: 'headroom', num: true },
  ];

  const rows = p.years.map((y) => ({
    __attrs: y.breach ? { 'data-flagged': 'true' } : {},
    year: String(y.year),
    age: `${y.age}m`,
    claims: fmt.int(y.claimCount),
    incurred: traced(y.latest, 'money', { host }),
    consumed: fmt.pct(y.consumedPct, 1),
    cdf: fmt.factor(y.cdf),
    ultimate: traced(y.ultimate, 'money', { host }),
    projected: fmt.pct(y.projectedPct, 1),
    headroom: fmt.money(y.headroom),
  }));

  return section('erosion', 'Aggregate erosion and run-rate to expiry', [
    dataTable(cols, rows),
    node,
    (() => {
      const cur = p.current;
      const naiveMultiple = 12 / cur.age;
      const gap = p.annualisedReported - cur.ultimate.value;
      const direction = gap > 0 ? 'above' : 'below';
      const relative = Math.abs(gap) / cur.ultimate.value;

      return para([
        `As a cross-check, reported incurred for ${p.currentYear} annualised on a straight run-rate is `,
        (h) => inlineTraced(t(p.annualisedReported, `Reported incurred of ${fmt.money(cur.latest.value)} at ${cur.age} months, scaled to twelve months on a straight run-rate. Deliberately crude — it ignores development entirely.`), 'money', h),
        `, ${fmt.pct(relative, 1)} ${direction} the chain-ladder projection of ${fmt.money(cur.ultimate.value)}. `,
        `Treat that agreement as arithmetic coincidence rather than corroboration: annualising a ${cur.age}-month figure multiplies it by ${naiveMultiple.toFixed(2)}, and the development factor at this age happens to be ${fmt.factor(cur.cdf)}. `,
        'The two answer different questions. The run-rate assumes claims keep arriving and developing at the first-half rate; the triangle says roughly ',
        `${fmt.pct(1 - 1 / cur.cdf, 0)} of this year's eventual cost has not been reported yet, and that the remainder arrives on a curve rather than a line. `,
        'At any other valuation age the two diverge sharply, which is why the run-rate is a sanity check and not a method.',
      ], 'memo__para--note');
    })(),
  ]);
}

function reserves(p) {
  const ages = [6, 12, 18, 24, 30, 36, 42];
  const present = ages.filter((a) => p.triangle.some((t2) => t2.cells[a] !== undefined));

  const triCols = [
    { label: 'Policy year', key: 'year' },
    ...present.map((a) => ({ label: `${a}m`, key: `a${a}`, num: true })),
  ];

  const triRows = p.triangle.map((t2) => {
    const row = { year: String(t2.year) };
    present.forEach((a) => {
      row[`a${a}`] = t2.cells[a] === undefined ? '—' : fmt.moneyShort(t2.cells[a]);
    });
    return row;
  });

  const facCols = [
    { label: 'Development step', key: 'step' },
    { label: 'Factor', key: 'factor', num: true },
    { label: 'Policy years contributing', key: 'years' },
  ];
  const facRows = [
    ...p.factors.steps.map((s) => ({
      step: `${s.from} → ${s.to} months`,
      factor: fmt.factor(s.factor),
      years: s.years.join(', '),
    })),
    {
      __attrs: { 'data-assumption': 'true' },
      step: 'Beyond 42 months (tail)',
      factor: fmt.factor(p.factors.tailFactor),
      years: 'Judgment — see assumptions',
    },
  ];

  const { host, node } = hostFor([]);
  const ibnrCols = [
    { label: 'Policy year', key: 'year' },
    { label: 'Paid', key: 'paid', num: true },
    { label: 'Case reserves', key: 'case', num: true },
    { label: 'Reported incurred', key: 'incurred', num: true },
    { label: 'IBNR incl. development', key: 'ibnr', num: true },
    { label: 'Projected ultimate', key: 'ultimate', num: true },
  ];
  const ibnrRows = p.years.map((y) => ({
    year: String(y.year),
    paid: traced(y.paid, 'money', { host }),
    case: traced(y.caseReserve, 'money', { host }),
    incurred: fmt.money(y.latest.value),
    ibnr: traced(y.ibnr, 'money', { host }),
    ultimate: fmt.money(y.ultimate.value),
  }));

  const excluded = p.triangle.reduce((s, t2) => s + t2.excludedFromTriangle, 0);

  return section('reserves', 'Reserve development and IBNR', [
    el('h4', { class: 'memo__subheading', text: 'Incurred development triangle' }),
    dataTable(triCols, triRows),
    excluded > 0
      ? el('p', { class: 'small muted memo__note', text: `${fmt.int(excluded)} claims are excluded from the triangle because a reserve movement carries no effective date. They remain in reported incurred — it is their development history that is unusable, not their amount.` })
      : null,

    el('h4', { class: 'memo__subheading', text: 'Age-to-age factors' }),
    dataTable(facCols, facRows),
    el('p', { class: 'small muted memo__note' }, [
      'Volume-weighted, computed from the triangle above. ',
      el('strong', { text: 'No industry benchmark is used. ' }),
      'The tail is the one judgment input in the method and is exposed as an assumption rather than fixed in code.',
    ]),

    el('h4', { class: 'memo__subheading', text: 'Position by policy year' }),
    dataTable(ibnrCols, ibnrRows),
    node,
  ]);
}

function layers(p) {
  const cols = [
    { label: 'Layer', key: 'band' },
    ...p.triangle.map((t2) => ({ label: String(t2.year), key: `y${t2.year}`, num: true })),
    { label: 'Total incurred', key: 'total', num: true },
  ];

  const rows = p.sizeOfLoss.map((b) => {
    const row = { band: b.label, total: fmt.money(b.totalIncurred) };
    p.triangle.forEach((t2) => {
      const cell = b.byYear[t2.year];
      row[`y${t2.year}`] = cell.count
        ? `${fmt.int(cell.count)} · ${fmt.moneyShort(cell.incurred)}`
        : '—';
    });
    return row;
  });

  const top = p.sizeOfLoss[p.sizeOfLoss.length - 1];
  const topCur = top.byYear[p.currentYear];

  return section('layers', 'Size-of-loss distribution', [
    dataTable(cols, rows),
    el('p', { class: 'small muted memo__note' }, [
      'Each claim is assigned wholly to one band by its total incurred. This is a size-of-loss distribution, not a layer analysis — a layer analysis would slice every claim across the bands beneath it and produce different numbers entirely. ',
      (() => {
        const all = top.totalCount;
        const cur = topCur.count;
        if (!all) return 'No claim on the book has reached the per-claim retention.';
        return `${fmt.int(all)} claim${all === 1 ? '' : 's'} across the book ${all === 1 ? 'sits' : 'sit'} at the ${fmt.money(p.retention)} per-claim retention${cur ? `, ${fmt.int(cur)} of them in ${p.currentYear}` : ''}. Each is a limit-conformance exception carried at full incurred until cession is confirmed.`;
      })(),
    ]),
  ]);
}

function capital(p) {
  const { host, node } = hostFor([]);
  const c = p.capital;

  const rows = [
    { item: 'Projected ultimate, all policy years', amount: fmt.money(p.totals.ultimate) },
    { item: 'Less paid to date', amount: fmt.money(-p.totals.paid) },
    { item: 'Open liability', amount: traced(c.openLiability, 'money', { host }) },
    { item: `Target capital margin (${fmt.pct(p.assumptions.capitalMargin, 1)})`, amount: fmt.money(c.required.value - c.openLiability.value) },
    { item: 'Required funded position', amount: traced(c.required, 'money', { host }) },
    { item: 'Funded surplus', amount: traced(c.funded, 'money', { host }) },
    {
      __attrs: c.adequate ? {} : { 'data-flagged': 'true' },
      item: c.adequate ? 'Surplus over requirement' : 'Shortfall against requirement',
      amount: fmt.money(c.adequate ? c.surplus : -c.surplus),
    },
  ];

  return section('capital', 'Capital adequacy and capacity headroom', [
    dataTable(
      [
        { label: 'Item', key: 'item' },
        { label: 'Amount', key: 'amount', num: true },
      ],
      rows
    ),
    node,
    el('p', { class: 'small muted memo__note', text: `Funding ratio ${fmt.pct(c.ratio, 1)}. The target capital margin is an input, not a derived figure — it reflects board policy on how much surplus sits above projected ultimate liabilities.` }),
  ]);
}

function materiality(p) {
  const { host, node } = hostFor([]);

  const rows = p.watchList.map((r) => ({
    claim: r.claimNo,
    insured: r.insuredEntity,
    cov: r.coverageCode,
    reported: r.reportDate,
    paid: fmt.money(r.paidIndemnity + r.paidExpense),
    reserve: fmt.money(r.caseReserve),
    incurred: fmt.money(r.incurred),
    share: fmt.pct(r.incurred / p.aggregate, 2),
  }));

  return section('materiality', 'Materiality flags and watch list', [
    el('p', { class: 'small muted', text: `Open claims in ${p.currentYear} at or above the materiality floor of ${fmt.money(p.materialityFloor)} — one percent of the annual aggregate. A single claim in this list can move projected consumption by more than a point.` }),
    rows.length
      ? dataTable(
          [
            { label: 'Claim', key: 'claim', cls: 'mono' },
            { label: 'Insured', key: 'insured' },
            { label: 'Cov', key: 'cov' },
            { label: 'Reported', key: 'reported', cls: 'mono' },
            { label: 'Paid', key: 'paid', num: true },
            { label: 'Reserve', key: 'reserve', num: true },
            { label: 'Incurred', key: 'incurred', num: true },
            { label: 'Of aggregate', key: 'share', num: true },
          ],
          rows
        )
      : el('p', { text: 'No open claim in the current year exceeds the materiality floor.' }),
    node,
  ]);
}

function dataQuality(p, recon) {
  const s = recon.summary;
  const hero = recon.heroException;

  const bySeverity = [
    ['critical', 'alert'],
    ['high', 'warn'],
    ['medium', 'warn'],
    ['low', 'human'],
  ].map(([sev, tone]) =>
    el('div', { class: 'chip' }, [badge(`${s.bySeverity[sev]} ${sev}`, tone)])
  );

  return section('dataQuality', 'Data quality and reconciliation status', [
    para([
      `${fmt.int(s.rawRows)} rows arrived across two source systems. Reconciliation raised `,
      `${fmt.int(s.exceptionCount)} exceptions. Every one lands in exactly one of three dispositions: `,
      `${fmt.int(s.appliedUnderRule)} applied under a stated mapping rule and logged, `,
      `${fmt.int(s.appliedConfirmed)} applied after a person confirmed them, and `,
      `${fmt.int(s.heldNotApplied)} held and not applied. `,
      `${fmt.int(s.removed)} rows were removed as duplicates. `,
      'The held exceptions would move reported incurred by ',
      `${fmt.money(s.pendingImpact)} if they resolve as proposed. Until they do, the figures above carry the conservative reading.`,
    ]),

    el('div', { class: 'chip-row' }, bySeverity),

    hero
      ? el('div', { class: 'callout callout--alert' }, [
          el('div', { class: 'callout__label', text: 'Caught before it reached the board' }),
          el('h4', { text: hero.title }),
          el('p', { class: 'small', text: hero.narrative.assertion }),
          el('p', { class: 'small', text: hero.narrative.consequence }),
          el('p', { class: 'small', text: hero.narrative.magnification }),
          el('p', { class: 'small' }, [
            el('strong', { text: 'Effect on this memo. ' }),
            `Uncorrected, ${p.currentYear} projects at ${fmt.pct(p.correction.naivePct, 1)} of aggregate. Corrected, it projects at ${fmt.pct(p.correction.correctedPct, 1)}. `,
            p.correction.flipsBreach
              ? 'The difference is a projected breach that is not there.'
              : '',
          ]),
          el('dl', { class: 'callout__meta' }, [
            el('dt', { text: 'Resolution' }),
            el('dd', { text: hero.narrative.resolution }),
            el('dt', { text: 'Confirmed by' }),
            el('dd', { text: hero.narrative.confirmedBy }),
            el('dt', { text: 'Match confidence' }),
            el('dd', { text: `${fmt.pct(hero.matchConfidence, 0)} — below the threshold for automatic merge, which is why it was held` }),
          ]),
        ])
      : null,
  ]);
}

function decisions(p, recon) {
  const cur = p.current;
  const targetHeadroom = 0.15;
  const recommendedAggregate =
    Math.ceil(cur.ultimate.value / (1 - targetHeadroom) / 250000) * 250000;

  const items = [];

  if (cur.projectedPct > 0.9) {
    items.push({
      ask: 'Increase the annual aggregate at renewal',
      detail: `Policy year ${p.currentYear} projects ${fmt.pct(cur.projectedPct, 1)} of the current ${fmt.money(p.aggregate)} aggregate, leaving ${fmt.money(cur.headroom)}. An aggregate of ${fmt.money(recommendedAggregate)} would restore ${fmt.pct(targetHeadroom, 0)} headroom against the current projection. Projected consumption has risen in each of the last ${p.years.length} years, so this is a trend response rather than a reaction to one year.`,
      tone: 'alert',
    });
  }

  if (!p.capital.adequate) {
    items.push({
      ask: 'Resolve the funding shortfall',
      detail: `Funded surplus of ${fmt.money(p.capital.funded.value)} sits ${fmt.money(-p.capital.surplus)} below the required position of ${fmt.money(p.capital.required.value)} at the current ${fmt.pct(p.assumptions.capitalMargin, 1)} target margin. The board's options are to fund the difference or to lower the target margin. Note that raising the aggregate does not help here and slightly hurts: the aggregate caps what the captive retains, so a higher one increases retained liability rather than reducing projected ultimate. Reducing ultimate means lowering the per-claim retention or buying protection that attaches lower.`,
      tone: 'warn',
    });
  }

  if (cur.pending) {
    items.unshift({
      ask: 'Confirm cession on the claims sitting at the per-claim retention',
      detail: `${p.currentYear} is reported at ${fmt.pct(cur.projectedPct, 1)} of aggregate with those claims carried at full incurred, because nobody has confirmed the excess layer responds. Confirmed, the year projects ${fmt.pct(cur.resolvedPct, 1)}${cur.breach && !cur.resolvedBreach ? ' and the projected breach disappears' : ''}. This is the cheapest item on the list — it is a call to the fronting carrier, not a capital decision — and it is first because the position reported above moves ${fmt.money(Math.abs(cur.pending))} on the answer.`,
      tone: cur.breach && !cur.resolvedBreach ? 'alert' : 'warn',
    });
  }

  if (recon.summary.heldNotApplied > 0) {
    items.push({
      ask: `Confirm ${fmt.int(recon.summary.heldNotApplied)} exceptions held for human resolution`,
      detail: `${recon.summary.bySeverity.critical} are critical and bear directly on the aggregate: duplicate identities and claims sitting at the per-occurrence retention whose cession is unconfirmed. None has been auto-resolved. Until they are confirmed, the figures in this memo are the conservative reading.`,
      tone: 'warn',
    });
  }

  items.push({
    ask: 'Note the tail factor as a judgment input',
    detail: `The method derives every age-to-age factor from the program's own triangle. The tail beyond 42 months cannot be fitted from ${p.years.length} policy years and is set at ${fmt.factor(p.factors.tailFactor)} by judgment. At a tail of 1.000 the ${p.currentYear} projection falls; at a heavier tail it rises. The board should be satisfied with that assumption specifically, because it moves every year on the book.`,
    tone: 'human',
  });

  return section('decisions', 'Decisions requested', [
    el(
      'ol',
      { class: 'decisions' },
      items.map((it) =>
        el('li', { class: 'decisions__item' }, [
          el('div', { class: 'decisions__head' }, [
            el('h4', { text: it.ask }),
            badge(it.tone === 'alert' ? 'Action' : it.tone === 'warn' ? 'Decision' : 'Note',
              it.tone === 'alert' ? 'alert' : it.tone === 'warn' ? 'warn' : 'human'),
          ]),
          el('p', { class: 'small', text: it.detail }),
        ])
      )
    ),
  ]);
}

/* ---------- Assembly ---------- */

export function buildMemo(p, recon, config) {
  const { memo, meta } = config;

  return el('article', { class: 'memo', id: 'memo' }, [
    el('header', { class: 'memo__head' }, [
      el('p', { class: 'eyebrow', text: 'Draft for review — assembled from reconciled data' }),
      el('h2', { class: 'memo__title', text: memo.title }),
      el('dl', { class: 'memo__meta' }, [
        el('dt', { text: 'To' }),
        el('dd', { text: memo.recipient }),
        el('dt', { text: 'Period' }),
        el('dd', { text: meta.reportingPeriod }),
        el('dt', { text: 'Valued at' }),
        el('dd', { text: fmt.date(meta.valuationDate) }),
        el('dt', { text: 'Status' }),
        el('dd', {}, [badge('Human-in-the-loop — awaiting sign-off', 'loop')]),
      ]),
    ]),

    execSummary(p, recon),
    overview(p, config),
    activity(p),
    erosion(p),
    reserves(p),
    layers(p),
    capital(p),
    materiality(p),
    dataQuality(p, recon),
    decisions(p, recon),

    el('footer', { class: 'memo__foot' }, [
      el('p', { class: 'small muted' }, [
        'Figures shown in ',
        el('span', { class: 'trace', style: 'cursor:default', text: 'this style' }),
        ' open the method that produced them and the rows they were computed from. ',
        'That covers the load-bearing figures — the position, the projection, the capital numbers — not every cell in every table. ',
        'Where an aggregate spans hundreds of claims, the panel names the full row count and shows the largest contributors rather than all of them.',
      ]),
    ]),
  ]);
}
