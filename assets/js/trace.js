/* The governance log.
 *
 * Every step the pipeline took, what it asserted, what it applied and what it
 * declined to apply, and who had to agree before it moved on. Built from the
 * actual run rather than written alongside it — if reconciliation finds a
 * different number of duplicates, this log says so.
 *
 * The entry that matters most is the one where the first reading was wrong.
 * A log that only records successes is a marketing artifact.
 *
 * No confidence percentages here. The only calibrated score on this site is the
 * matcher's, and it appears once, beside the threshold it failed to clear.
 */

import { el, fmt, badge } from './render.js';

const LEVEL_TONE = { autonomous: 'auto', loop: 'loop', human: 'human' };
const LEVEL_LABEL = {
  autonomous: 'Autonomous',
  loop: 'Human-in-the-loop',
  human: 'Human',
};

export function buildTrace(recon, p, config) {
  const s = recon.summary;
  const byDefect = (id) => recon.exceptions.filter((e) => e.defectId === id);

  const coverage = byDefect('unmapped-coverage');
  const entities = byDefect('entity-variants');
  const dupes = byDefect('dup-claimno');
  const temporal = [...byDefect('report-before-occurrence'), ...byDefect('null-reserve-date')];
  const limits = byDefect('paid-over-limit');

  const entriesBefore = 14;

  const entries = [
    {
      stage: 'Intake',
      level: 'autonomous',
      title: 'Read both source extracts',
      assertion: `${fmt.int(s.rawRows)} rows read across the TPA loss run and the internal claims register. Field names, date formats, and status vocabularies differ between the two.`,
      metrics: [['Rows', fmt.int(s.rawRows)], ['Systems', '2']],
      outcome: 'passed',
    },
    {
      stage: 'Intake',
      level: 'autonomous',
      title: 'Normalized onto the canonical schema',
      assertion:
        'Field mapping is declared per source system rather than inferred, so the mapping itself is auditable. Dates normalized to ISO, statuses to the program vocabulary.',
      metrics: [['Fields mapped', '10'], ['Date formats', '2']],
      outcome: 'passed',
    },
    {
      stage: 'Intake',
      level: 'loop',
      title: 'Coverage codes outside the schema',
      assertion: `${fmt.int(coverage.length)} rows carried a coverage value that is not a canonical program code. ${fmt.int(coverage.filter((e) => !e.requiresHuman).length)} resolved under a stated mapping rule and were logged rather than applied silently; ${fmt.int(coverage.filter((e) => e.requiresHuman).length)} had no value at all and were held.`,
      metrics: [['Flagged', fmt.int(coverage.length)], ['Held', fmt.int(coverage.filter((e) => e.requiresHuman).length)]],
      outcome: 'held',
    },
    {
      stage: 'Intake',
      level: 'autonomous',
      title: 'Entity resolution',
      assertion: `${fmt.int(entities.length)} rows named an insured under a spelling other than its canonical form. Resolved on a normalized key that ignores punctuation, casing, and legal suffixes. Left alone, this insured's experience splits across three apparent entities and understates its loss ratio in all of them.`,
      metrics: [['Rows resolved', fmt.int(entities.length)]],
      outcome: 'passed',
    },
    {
      stage: 'Intake',
      level: 'loop',
      title: 'Identity resolution',
      assertion: `${fmt.int(dupes.length)} duplicate groups found by comparing claim numbers on a normalized key that reads the sequence segment numerically. Exact matching does not catch a number that lost a digit in transcription.`,
      metrics: [['Groups', fmt.int(dupes.length)], ['Rows removed', fmt.int(s.removed)]],
      outcome: 'held',
      isHeroStage: true,
    },
    {
      stage: 'Intake',
      level: 'loop',
      title: 'Temporal integrity',
      assertion: `${fmt.int(byDefect('report-before-occurrence').length)} rows reported a claim before it occurred — usually a transposition at entry. On claims-made coverage it can also land the claim in the wrong policy year. ${fmt.int(byDefect('null-reserve-date').length)} reserve movements carry no effective date and cannot be placed in a development period.`,
      metrics: [['Date inversions', fmt.int(byDefect('report-before-occurrence').length)], ['Undated reserves', fmt.int(byDefect('null-reserve-date').length)]],
      outcome: 'held',
    },
    {
      stage: 'Intake',
      level: 'loop',
      title: 'Limit conformance',
      assertion: `${fmt.int(limits.length)} claims show incurred above the ${fmt.money(config.program.retentionPerClaim)} per-claim retention. Either the excess layer was not applied on the extract or the claim genuinely pierced retention and was never ceded. Those have opposite consequences for the aggregate, so none was resolved without confirmation.`,
      metrics: [
        ['Flagged', fmt.int(limits.length)],
        ['Applied', '0'],
        ['Held gross', fmt.money(Math.abs(recon.summary.pendingImpact))],
      ],
      outcome: 'held',
    },
    {
      stage: 'Reserve',
      level: 'autonomous',
      title: 'Built the incurred development triangle',
      assertion: `Each policy year anchored on its reconciled incurred at ${p.triangle.map((t) => `${t.age}m`).join(', ')}. Claims whose reserve movements are undated are excluded from the triangle but remain in reported incurred.`,
      metrics: [
        ['Policy years', fmt.int(p.triangle.length)],
        ['Excluded', fmt.int(p.triangle.reduce((a, t) => a + t.excludedFromTriangle, 0))],
      ],
      outcome: 'passed',
    },
    {
      stage: 'Reserve',
      level: 'autonomous',
      title: 'Derived age-to-age factors',
      assertion: `Volume-weighted across every policy year with data at both ends of each step. Cumulative factor at ${p.current.age} months is ${fmt.factor(p.current.cdf)}. No industry benchmark is used; the only judgment input is the tail.`,
      metrics: [
        ['Steps derived', fmt.int(p.factors.steps.length)],
        ['Tail (judgment)', fmt.factor(p.factors.tailFactor)],
      ],
      outcome: 'passed',
    },
    {
      stage: 'Reserve',
      level: 'autonomous',
      title: 'Projected each policy year to ultimate',
      assertion: `Reconciled incurred developed by the cumulative factor for its age. Policy year ${p.currentYear} projects ${fmt.money(p.current.ultimate.value)}, ${fmt.pct(p.current.projectedPct, 1)} of the annual aggregate.`,
      metrics: [
        ['Projected ultimate', fmt.moneyShort(p.totals.ultimate)],
        ['IBNR', fmt.moneyShort(p.totals.ibnr)],
      ],
      outcome: 'passed',
    },
    {
      stage: 'Funding',
      level: 'autonomous',
      title: 'Computed the required funded position',
      assertion: `Open liability of ${fmt.money(p.capital.openLiability.value)} plus a ${fmt.pct(p.assumptions.capitalMargin, 1)} target margin gives a requirement of ${fmt.money(p.capital.required.value)} against ${fmt.money(p.capital.funded.value)} funded.`,
      metrics: [['Funding ratio', fmt.pct(p.capital.ratio, 1)]],
      outcome: p.capital.adequate ? 'passed' : 'flagged',
    },
    {
      stage: 'Funding',
      level: 'human',
      title: 'Capital call decision',
      assertion: `The requirement is computed and the gap is quantified. Nothing further happened: no call was drafted, no funding schedule was altered, and nothing went to the parent. The pipeline stops at a number and a line on the agenda.`,
      metrics: [
        ['Status', 'For the board'],
        [p.capital.adequate ? 'Surplus' : 'Gap', fmt.money(Math.abs(p.capital.surplus))],
      ],
      outcome: 'human',
    },
    {
      stage: 'Reporting',
      level: 'loop',
      title: 'Drafted the board memo',
      assertion:
        'Assembled from computed values, with every figure linked to the rows behind it. The linked figures are what make the review tractable; the review still happens.',
      metrics: [['Sections', fmt.int(config.memo.sections.length)], ['Status', 'Awaiting sign-off']],
      outcome: 'held',
    },
    {
      stage: 'Reporting',
      level: 'human',
      title: 'Board decision',
      assertion: `${config.memo.sections.length} sections, ${fmt.int(entriesBefore)} logged steps and a full row-level derivation arrive with the memo. What does not arrive is a recommendation the system has already acted on — every figure above is still reversible at this point, and that is the property that makes the pack worth reading rather than worth signing.`,
      metrics: [['Status', 'For the board'], ['Reversible', 'Yes — nothing has been executed']],
      outcome: 'human',
    },
  ];

  return entries.map((e, i) => ({ ...e, seq: i + 1 }));
}

/* ---------- The caught error, told as a chain ---------- */

function heroChain(recon, p) {
  const hero = recon.heroException;
  if (!hero) return null;
  const n = hero.narrative;

  const steps = [
    {
      actor: 'System',
      tone: 'alert',
      label: 'Asserted — incorrectly',
      text: n.assertion,
    },
    {
      actor: 'System',
      tone: 'warn',
      label: 'Consequence, had it stood',
      text: `${n.consequence} ${n.magnification} Uncorrected, policy year ${p.currentYear} projects ${fmt.pct(p.correction.naivePct, 1)} of the annual aggregate against ${fmt.pct(p.correction.correctedPct, 1)} corrected — ${p.correction.flipsBreach ? 'the difference between a projected breach and headroom intact.' : 'a material difference in reported position.'}`,
    },
    {
      actor: 'System',
      tone: 'loop',
      label: 'Flagged, not fixed',
      text: `${n.resolution} The matcher scored it ${fmt.pct(hero.matchConfidence, 0)} — below the threshold for automatic merge, which is the only reason it reached a person.`,
    },
    {
      actor: 'Human',
      tone: 'auto',
      label: 'Confirmed',
      text: `${n.confirmedBy}. The merge was applied and ${fmt.money(p.correction.heroReported)} of duplicated incurred came out of the reported figure, ${fmt.money(p.correction.heroProjected)} out of the projection.`,
    },
    {
      actor: 'Board',
      tone: 'human',
      label: 'Decision protected',
      text: n.decisionImpact,
    },
  ];

  return el('div', { class: 'chain' }, [
    el('div', { class: 'chain__head' }, [
      el('p', { class: 'eyebrow', text: 'Where the naive read would have been wrong' }),
      el('h3', { text: hero.title }),
      el('p', { class: 'small muted', text: 'This chain is kept in the demonstration deliberately. A pipeline that never shows its failure mode is not a pipeline anyone has run.' }),
    ]),
    el(
      'ol',
      { class: 'chain__steps' },
      steps.map((st) =>
        el('li', { class: 'chain__step' }, [
          el('div', { class: 'chain__meta' }, [
            badge(st.actor, st.tone),
            el('span', { class: 'chain__label', text: st.label }),
          ]),
          el('p', { class: 'small', text: st.text }),
        ])
      )
    ),
  ]);
}

/* ---------- Render ---------- */

export function renderTrace(entries, recon, p) {
  const stages = [...new Set(entries.map((e) => e.stage))];

  const counts = {
    autonomous: entries.filter((e) => e.level === 'autonomous').length,
    loop: entries.filter((e) => e.level === 'loop').length,
    human: entries.filter((e) => e.level === 'human').length,
  };

  const list = el(
    'ol',
    { class: 'log' },
    entries.map((e) =>
      el('li', { class: `log__entry log__entry--${e.outcome}` }, [
        el('div', { class: 'log__gutter' }, [
          el('span', { class: 'log__seq', text: String(e.seq).padStart(2, '0') }),
        ]),
        el('div', { class: 'log__body' }, [
          el('div', { class: 'log__head' }, [
            el('span', { class: 'log__stage', text: e.stage }),
            badge(LEVEL_LABEL[e.level], LEVEL_TONE[e.level]),
            e.outcome === 'held' ? badge('Held for human', 'warn') : null,
            e.outcome === 'flagged' ? badge('Flagged', 'alert') : null,
          ]),
          el('h4', { class: 'log__title', text: e.title }),
          el('p', { class: 'small', text: e.assertion }),
          el(
            'dl',
            { class: 'log__metrics' },
            e.metrics.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])
          ),
          /* There is deliberately no confidence meter on these entries.
           *
           * A percentage attached to "read both source extracts" would be a
           * number with nothing behind it — unearned precision on a page whose
           * whole argument is that unearned numbers are how this gets sold
           * badly. The one real confidence score on the site is the matcher's,
           * and it appears where it means something: beside the threshold it
           * failed to clear, in the caught-error chain above. */
        ]),
      ])
    )
  );

  return el('div', { class: 'trace-panel' }, [
    el('div', { class: 'trace-panel__summary' }, [
      el('div', { class: 'chip-row' }, [
        badge(`${counts.autonomous} autonomous`, 'auto'),
        badge(`${counts.loop} human-in-the-loop`, 'loop'),
        badge(`${counts.human} human`, 'human'),
      ]),
      el('p', { class: 'small muted', text: `${entries.length} steps across ${stages.length} stages. Of ${recon.summary.exceptionCount} exceptions, ${recon.summary.appliedUnderRule} were applied under a stated rule, ${recon.summary.appliedConfirmed} applied after a person confirmed them, and ${recon.summary.heldNotApplied} are held and not applied — so the figures carry the conservative reading until those are resolved.` }),
    ]),
    heroChain(recon, p),
    list,
  ]);
}
