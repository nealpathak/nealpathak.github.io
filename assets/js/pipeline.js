/* Stage orchestration for the deep node.
 *
 * Loads the program, runs it through ingest → reconcile → analyze → draft →
 * govern, and re-runs everything downstream of the assumptions whenever an
 * assumption changes. Reconciliation does not depend on the assumptions, so it
 * runs once; the projection and everything after it re-runs.
 */

import { synthesize } from './generate.js';
import { reconcile } from './reconcile.js';
import { project } from './projection.js';
import { buildMemo } from './memo.js';
import { buildTrace, renderTrace } from './trace.js';
import { el, fmt, format, badge, dataTable } from './render.js';

const SEVERITY_TONE = { critical: 'alert', high: 'warn', medium: 'warn', low: 'human' };

function mount(id, node) {
  const host = document.getElementById(id);
  if (!host) return;
  host.replaceChildren(node);
}

/* ---------- Stage 1: Ingest ---------- */

function renderIngest(synth, config) {
  const bySystem = new Map();
  for (const row of synth.raw) {
    if (!bySystem.has(row.__system)) bySystem.set(row.__system, []);
    bySystem.get(row.__system).push(row);
  }

  const samples = config.schema.sourceSystems.map((sys) => {
    const rows = (bySystem.get(sys.id) || []).slice(0, 4);
    const keys = rows.length
      ? Object.keys(rows[0]).filter((k) => !k.startsWith('__'))
      : [];

    return el('div', { class: 'source' }, [
      el('div', { class: 'source__head' }, [
        el('h4', { text: sys.label }),
        el('span', { class: 'small muted mono', text: sys.id }),
      ]),
      el('p', { class: 'small muted', text: `${fmt.int((bySystem.get(sys.id) || []).length)} rows` }),
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, el('tr', {}, keys.map((k) => el('th', { class: 'mono', text: k })))),
          el(
            'tbody',
            {},
            rows.map((r) =>
              el(
                'tr',
                {},
                keys.map((k) =>
                  el('td', {
                    class: typeof r[k] === 'number' ? 'num' : 'mono small',
                    text: r[k] === null ? '∅' : String(r[k]),
                  })
                )
              )
            )
          ),
        ]),
      ]),
    ]);
  });

  return el('div', { class: 'stack-lg' }, [
    el('p', { class: 'lede' }, [
      `${fmt.int(synth.counts.rawRows)} rows arrive from two systems that agree on almost nothing: different field names, different date formats, different words for the same claim status.`,
    ]),
    el('p', { class: 'small muted' }, [
      'Nothing here is cleaned yet. This is the feed as it lands — including the defects, which are planted deliberately and are the same defects real loss runs carry.',
    ]),
    el('div', { class: 'sources' }, samples),
  ]);
}

/* ---------- Stage 2: Reconcile ---------- */

function renderReconcile(recon, config) {
  const s = recon.summary;

  const groups = config.defects.map((d) => ({
    def: d,
    items: recon.exceptions.filter((e) => e.defectId === d.id),
  }));

  const summaryTiles = el('div', { class: 'stat-row' }, [
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__label', text: 'Rows in' }),
      el('div', { class: 'stat__value', text: fmt.int(s.rawRows) }),
      el('div', { class: 'stat__note', text: 'across two source systems' }),
    ]),
    el('div', { class: 'stat stat--warn' }, [
      el('div', { class: 'stat__label', text: 'Exceptions raised' }),
      el('div', { class: 'stat__value', text: fmt.int(s.exceptionCount) }),
      el('div', { class: 'stat__note', text: `${s.bySeverity.critical} critical, ${s.bySeverity.high} high` }),
    ]),
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__label', text: 'Auto-resolved under rule' }),
      el('div', { class: 'stat__value', text: fmt.int(s.appliedUnderRule) }),
      el('div', { class: 'stat__note', text: 'logged, not silent' }),
    ]),
    // Amber, not red. Human-in-the-loop is the operating design working, not a
    // defect count — painting it in the critical colour tells a reader "33
    // things went wrong" half a second before they read the label.
    el('div', { class: 'stat stat--loop' }, [
      el('div', { class: 'stat__label', text: 'Held for a human' }),
      el('div', { class: 'stat__value', text: fmt.int(s.heldNotApplied) }),
      el('div', { class: 'stat__note', text: 'not applied — figures carry the conservative reading' }),
    ]),
  ]);

  const groupNodes = groups
    .filter((g) => g.items.length)
    .map((g) => {
      const sample = g.items.slice(0, 4);
      return el('details', { class: 'exgroup', open: g.def.severity === 'critical' }, [
        el('summary', { class: 'exgroup__summary' }, [
          el('span', { class: 'exgroup__title', text: g.def.label }),
          badge(g.def.severity, SEVERITY_TONE[g.def.severity]),
          el('span', { class: 'exgroup__count', text: `${fmt.int(g.items.length)} found` }),
        ]),
        el('div', { class: 'exgroup__body' }, [
          el('p', { class: 'small muted', text: g.def.description }),
          ...sample.map((e) =>
            el('div', { class: `exception exception--${e.severity}` }, [
              el('div', { class: 'exception__head' }, [
                el('span', { class: 'mono small', text: e.id }),
                el('strong', { text: e.title }),
                e.isHero ? badge('Decision-changing', 'alert') : null,
                e.confirmed
                  ? badge('Applied — human confirmed', 'auto')
                  : e.autoResolved
                    ? badge('Applied under rule', 'auto')
                    : badge('Held — not applied', 'warn'),
              ]),
              el('p', { class: 'small', text: e.detail }),
              el('p', { class: 'small muted' }, [
                el('strong', { text: 'Proposed: ' }),
                e.proposedAction,
                e.appliedImpact
                  ? ` · Already reflected in reported incurred: ${fmt.money(e.appliedImpact)}`
                  : '',
                e.pendingImpact
                  ? ` · If confirmed, moves reported incurred by ${fmt.money(e.pendingImpact)}`
                  : '',
                e.matchConfidence
                  ? ` · Match confidence ${fmt.pct(e.matchConfidence, 0)}`
                  : '',
              ]),
            ])
          ),
          g.items.length > sample.length
            ? el('p', { class: 'small muted', text: `${fmt.int(g.items.length - sample.length)} further exceptions of this type not shown.` })
            : null,
        ]),
      ]);
    });

  const comparison = dataTable(
    [
      { label: 'Policy year', key: 'year' },
      { label: 'Unreconciled feed', key: 'naive', num: true },
      { label: 'Reconciled', key: 'clean', num: true },
      { label: 'Difference', key: 'diff', num: true },
    ],
    config.program.policyYears.map((y) => {
      const naive = recon.naiveTotals[y] || 0;
      const clean = recon.reconciledTotals[y] || 0;
      return {
        __attrs: Math.abs(naive - clean) > 1000 ? { 'data-flagged': 'true' } : {},
        year: String(y),
        naive: fmt.money(naive),
        clean: fmt.money(clean),
        diff: fmt.money(clean - naive),
      };
    })
  );

  return el('div', { class: 'stack-lg' }, [
    el('p', { class: 'lede', text: 'Nothing is silently fixed. Every transformation either follows a stated mapping rule and is logged, or becomes an exception a human confirms before it moves downstream.' }),
    summaryTiles,
    el('div', { class: 'stack' }, groupNodes),
    el('div', {}, [
      el('h4', { class: 'memo__subheading', text: 'What reconciliation changed' }),
      el('p', { class: 'small muted', text: 'Reported incurred by policy year, before and after. The gap is what a straight sum of the feed would have carried into the projection.' }),
      comparison,
    ]),
  ]);
}

/* ---------- Stage 3: Analyze ---------- */

function renderAssumptions(config, state, onChange) {
  const controls = config.assumptions.map((a) => {
    const out = el('output', { class: 'assumption__value mono', text: format(state[a.id], a.format) });
    const input = el('input', {
      type: 'range',
      id: `assume-${a.id}`,
      min: a.min,
      max: a.max,
      step: a.step,
      value: state[a.id],
      'aria-describedby': `assume-${a.id}-note`,
    });

    input.addEventListener('input', () => {
      state[a.id] = Number(input.value);
      out.textContent = format(state[a.id], a.format);
      onChange();
    });

    return el('div', { class: 'assumption' }, [
      el('div', { class: 'assumption__head' }, [
        el('label', { for: `assume-${a.id}`, class: 'assumption__label', text: a.label }),
        out,
      ]),
      input,
      el('p', { class: 'small muted', id: `assume-${a.id}-note` }, [
        a.basis === 'illustrative'
          ? el('span', { class: 'badge badge--warn', text: 'Illustrative' })
          : el('span', { class: 'badge badge--human', text: 'Structural' }),
        ' ',
        a.note,
      ]),
    ]);
  });

  return el('div', { class: 'assumptions' }, [
    el('div', { class: 'assumptions__head' }, [
      el('h4', { text: 'Assumptions' }),
      el('p', { class: 'small muted', text: 'Every figure downstream recomputes. Nothing on this page is a stored result.' }),
    ]),
    el('div', { class: 'assumptions__grid' }, controls),
  ]);
}

function renderAnalyze(p) {
  const c = p.correction;

  const position = dataTable(
    [
      { label: 'Policy year', key: 'year' },
      { label: 'Age', key: 'age', num: true },
      { label: 'Reported incurred', key: 'incurred', num: true },
      { label: 'Factor', key: 'cdf', num: true },
      { label: 'Projected ultimate', key: 'ultimate', num: true },
      { label: 'Of aggregate', key: 'pct', num: true },
      { label: 'Headroom', key: 'headroom', num: true },
    ],
    p.years.map((y) => ({
      __attrs: y.breach ? { 'data-flagged': 'true' } : {},
      year: String(y.year),
      age: `${y.age}m`,
      incurred: fmt.money(y.latest.value),
      cdf: fmt.factor(y.cdf),
      ultimate: fmt.money(y.ultimate.value),
      pct: fmt.pct(y.projectedPct, 1),
      headroom: fmt.money(y.headroom),
    }))
  );

  const bars = el(
    'div',
    { class: 'erosion' },
    p.years.map((y) => {
      const pctOf = Math.min(1.35, y.projectedPct);
      return el('div', { class: 'erosion__row' }, [
        el('span', { class: 'erosion__year mono', text: String(y.year) }),
        el('div', { class: 'erosion__track' }, [
          el('div', {
            class: `erosion__fill ${y.breach ? 'is-breach' : ''}`,
            style: `width:${(pctOf / 1.35) * 100}%`,
          }),
          el('div', { class: 'erosion__limit', style: `left:${(1 / 1.35) * 100}%` }),
        ]),
        el('span', { class: 'erosion__pct mono', text: fmt.pct(y.projectedPct, 1) }),
      ]);
    })
  );

  return el('div', { class: 'stack-lg' }, [
    el('p', { class: 'lede', text: 'Incurred chain ladder. Age-to-age factors come from this program\'s own triangle; the tail is the single judgment input, and it is a control rather than a constant.' }),
    bars,
    el('p', { class: 'small muted', text: 'Projected consumption of each policy year\'s annual aggregate. The vertical rule is the aggregate.' }),
    position,

    c.exception
      ? el('div', { class: 'compare' }, [
          el('h4', { text: 'What the caught duplicate was worth' }),
          el('div', { class: 'compare__grid' }, [
            el('div', { class: 'compare__side compare__side--bad' }, [
              el('div', { class: 'compare__label', text: 'Unreconciled feed' }),
              el('div', { class: 'compare__value', text: fmt.pct(c.naivePct, 1) }),
              el('div', { class: 'compare__note', text: c.naivePct > 1 ? 'Projected breach of the annual aggregate' : 'Projected consumption' }),
            ]),
            el('div', { class: 'compare__side compare__side--good' }, [
              el('div', { class: 'compare__label', text: 'Reconciled' }),
              el('div', { class: 'compare__value', text: fmt.pct(c.correctedPct, 1) }),
              el('div', { class: 'compare__note', text: `${fmt.money(p.current.headroom)} of headroom at expiry` }),
            ]),
          ]),
          el('p', { class: 'small muted' }, [
            `A duplicated ${fmt.money(c.heroReported)} of incurred at ${p.current.age} months becomes ${fmt.money(c.heroProjected)} of projected ultimate, because the development factor of ${fmt.factor(c.magnification)} multiplies the error along with everything else. `,
            'Data quality problems do not stay the size they arrive at.',
          ]),
        ])
      : null,
  ]);
}

/* ---------- Boot ---------- */

async function init() {
  const status = document.getElementById('boot-status');
  try {
    const config = await fetch('../data/program-001.json').then((r) => {
      if (!r.ok) throw new Error(`program-001.json: ${r.status}`);
      return r.json();
    });

    const synth = synthesize(config);
    const recon = reconcile(synth);

    const state = Object.fromEntries(config.assumptions.map((a) => [a.id, a.value]));

    mount('stage-ingest', renderIngest(synth, config));
    mount('stage-reconcile', renderReconcile(recon, config));

    function recompute() {
      const p = project({ synth, recon, assumptions: state });
      mount('stage-analyze-out', renderAnalyze(p));
      mount('stage-memo', buildMemo(p, recon, config));
      mount('stage-govern', renderTrace(buildTrace(recon, p, config), recon, p));
    }

    /* Debounced on a timer rather than requestAnimationFrame. rAF does not fire
     * when the page is not compositing — a backgrounded tab, a hidden pane, a
     * projector that has gone to sleep — and a slider that silently stops
     * updating the memo is worse than one that updates a frame late. */
    let timer = null;
    function schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        recompute();
      }, 16);
    }

    mount('assumptions', renderAssumptions(config, state, schedule));
    recompute();

    if (status) status.remove();
    document.body.dataset.ready = 'true';
  } catch (err) {
    console.error(err);
    if (status) {
      status.replaceChildren(
        el('p', { class: 'small' }, [
          el('strong', { text: 'Could not load the program data. ' }),
          String(err.message || err),
          ' — if you are opening this file directly, run it through a local server instead.',
        ])
      );
    }
  }
}

init();
