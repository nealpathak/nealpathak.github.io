import { generateBook, ENTITIES, LINES, policyYearLabel } from '../../data/book.mjs';
import { buildBrief } from './brief.mjs';
import { fmt, dates } from '../../lib/format.mjs';
import { $, table, escapeHtml } from '../../lib/dom.mjs';
import { fanChart, barChart, CH } from '../../lib/svg.mjs';
import { FIRMS } from '../matter-portfolio/engine.mjs';
import { byId } from '../agent-control-plane/engine.mjs';

const book = generateBook();
const b = buildBrief(book);
const py = policyYearLabel;
const name = code => ENTITIES.find(e => e.code === code)?.name || code;
const firmName = id => FIRMS.find(f => f.id === id)?.name || id;
const m = v => fmt.money(v, { compact: true });
const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const H = b.cap.params.horizonQuarters;
const x = Array.from({ length: H + 1 }, (_, q) => q);

const worstBreach = b.erosion.flatMap(e => e.breaches.map(y => ({ ...y, name: e.name }))).sort((a, c) => c.excess - a.excess)[0];
const overrun = b.legal.overBudget.reduce((s, r) => s + r.overrun, 0);

$('#brief').innerHTML = `
  <div class="brief-head">
    <div><p class="kicker">Risk committee · Captive programme</p><h1>Brief as of ${fmt.date(b.asOf)}</h1></div>
    <div class="meta">Prepared automatically from the daily claims pipeline<br>Data through ${fmt.date(b.asOf)} · ${fmt.num(b.claims.count)} claims · eight policy years<br>Synthetic book · reproducible from seed</div>
  </div>

  <section>
    <h2>Decisions requested</h2>
    <ol class="decision-list">${b.decisions.map(d => `<li><span class="area">${escapeHtml(d.area)}</span><p>${escapeHtml(d.text)}</p></li>`).join('')}</ol>
  </section>

  <section>
    <h2>Position at a glance</h2>
    <div class="glance">
      ${stat(fmt.num(b.claims.open), 'Open claims', `of ${fmt.num(b.claims.count)} reported`)}
      ${stat(m(b.claims.incurred), 'Incurred to date', `${m(b.claims.outstanding)} outstanding`)}
      ${stat(m(b.dev.totals.ibnr), 'IBNR', `${fmt.pct(b.dev.totals.ibnr / b.dev.totals.latest, 1)} of incurred`)}
      ${stat(fmt.pct(b.cap.breachAny, 1), 'Capital breach risk', `three years, ${fmt.pct(b.tolerance)} tolerance`, b.cap.breachAny > b.tolerance ? 'accent' : '')}
      ${stat(m(b.dev.totals.excess), 'Into aggregate layer', `${b.erosion.reduce((s, e) => s + e.breaches.length, 0)} year-lines breach`, b.dev.totals.excess > 0 ? 'accent' : '')}
      ${stat(m(overrun), 'Legal overrun projected', `${b.legal.overBudget.length} matters`, overrun > 0 ? 'accent' : '')}
    </div>
  </section>

  <section>
    <h2>Claims</h2>
    <p>In the thirty days to ${fmt.date(b.asOf)}, ${b.claims.new30} claims were reported and ${b.claims.closed30} closed; incurred moved ${b.claims.incurred30 >= 0 ? 'up' : 'down'} by ${m(Math.abs(b.claims.incurred30))}. ${b.claims.litigatedOpen} open claims are in litigation. The five largest open claims are below; each is above the level at which the excess carrier is on notice.</p>
    ${table([
      { key: 'id', label: 'Claim', class: 'mono' },
      { key: 'entity', label: 'Company', render: v => name(v) },
      { key: 'line', label: 'Line' },
      { key: 'py', label: 'Policy year', render: v => py(v) },
      { key: 'cause', label: 'Cause' },
      { key: 'incurred', label: 'Incurred', num: true, render: v => fmt.money(v) },
      { key: 'litigated', label: 'Litigated', render: v => v ? 'Yes' : '—' },
    ], b.claims.largeOpen, { caption: 'Largest open claims, retained layer' })}
    <p class="note"><a href="../loss-run-pipeline/">Source: Loss-Run Pipeline</a></p>
  </section>

  <section>
    <h2>Aggregate erosion and reserving</h2>
    <p>${worstBreach ? `${worstBreach.name} ${py(worstBreach.py)} is projected to use ${fmt.pct(worstBreach.erodedUlt)} of its aggregate, ${m(worstBreach.excess)} over. ` : 'No policy year is projected to exhaust its aggregate. '}Estimates on mature years land within ${fmt.pct(b.dev.backtest.matureError, 1)} of the eventual cost; the current year's estimate leans on the priced expectation and will move.</p>
    ${table([
      { key: 'name', label: 'Line' },
      { key: 'cur_latest', label: `${py(b.currentPy)} incurred`, num: true, render: v => fmt.money(v) },
      { key: 'cur_sel', label: 'Projected ultimate', num: true, render: v => fmt.money(v) },
      { key: 'cur_agg', label: 'Aggregate', num: true, render: v => fmt.money(v) },
      { key: 'cur_use', label: 'Projected use', num: true, render: v => fmt.pct(v) },
      { key: 'prior_use', label: `${py(b.currentPy - 1)} projected use`, num: true, render: v => fmt.pct(v) },
      { key: 'breaches', label: 'Years breaching', render: v => v.length ? v.map(y => `${py(y.py)} +${m(y.excess)}`).join(', ') : '—' },
    ], b.erosion.map(e => ({ name: e.name, cur_latest: e.current.latest, cur_sel: e.current.selected, cur_agg: e.current.aggregate, cur_use: e.current.erodedUlt, prior_use: e.prior.erodedUlt, breaches: e.breaches, _class: e.breaches.length ? 'flag' : '' })), { caption: 'Current and prior policy year by line' })}
    <p class="note"><a href="../loss-development/">Source: Loss Development &amp; Aggregate Erosion</a></p>
  </section>

  <section>
    <h2>Capital</h2>
    <p>With ${m(b.startingCapital)} of capital against ${m(b.opening.unpaid)} of reserves, the captive opens at ${b.cap.ratio.p50[0].toFixed(2)}× its requirement. Across ${fmt.num(b.cap.sims)} simulated futures the probability of falling below 1.0× within three years is ${fmt.pct(b.cap.breachAny, 1)}; holding ${m(b.need.capital)} would bring it under ${fmt.pct(b.tolerance)}. Without the aggregate stop-loss the probability is ${fmt.pct(b.noAgg.breachAny, 1)}.</p>
    <figure style="max-width:720px">${fanChart({ x, bands: [{ lo: b.cap.ratio.p5, hi: b.cap.ratio.p95, opacity: 0.12 }, { lo: b.cap.ratio.p25, hi: b.cap.ratio.p75, opacity: 0.2 }], median: b.cap.ratio.p50, yFormat: v => v.toFixed(1) + '×', xFormat: q => q === 0 ? 'open' : 'Q' + q, reference: 1, referenceLabel: 'requirement', width: 720, height: 240, title: 'Capital adequacy ratio by quarter' })}<figcaption>Capital divided by required capital, by quarter. Bands are the 5th–95th and 25th–75th percentiles.</figcaption></figure>
    <p class="note"><a href="../capital-model/">Source: Capital &amp; Cash-Flow Model</a></p>
  </section>

  <section>
    <h2>Legal spend</h2>
    <p>${b.legal.totals.open} matters are open with ${m(b.legal.totals.exposure)} of exposure and ${m(b.legal.totals.reserve)} reserved. Projected outside-counsel spend on open matters is ${m(b.legal.totals.projectedOpen)} against ${m(b.legal.totals.budgetOpen)} budgeted. ${b.legal.firms[0] ? `${b.legal.firms[0].name} has billed ${m(b.legal.firms[0].overGuideline)} above guideline rates over three years.` : ''}</p>
    ${table([
      { key: 'id', label: 'Matter', class: 'mono' },
      { key: 'typeName', label: 'Type' },
      { key: 'entity', label: 'Company', render: v => name(v) },
      { key: 'handling', label: 'Counsel', render: v => firmName(v) },
      { key: 'budget', label: 'Budget', num: true, render: v => fmt.money(v) },
      { key: 'projected', label: 'Projected', num: true, render: v => fmt.money(v) },
      { key: 'overrun', label: 'Overrun', num: true, render: v => fmt.money(v) },
    ], b.legal.overBudget.slice(0, 5), { caption: 'Matters projected over budget, largest first' })}
    <p class="note"><a href="../matter-portfolio/">Source: Matter Portfolio &amp; Intake Triage</a></p>
  </section>

  <section>
    <h2>Premium allocation for ${py(b.alloc.nextPy)}</h2>
    <p>${m(b.alloc.total)} of premium is proposed for allocation. ${m(b.alloc.moved)} moves between operating companies on their own experience over ${py(b.alloc.window[0])} to ${py(b.alloc.window[b.alloc.window.length - 1])}, capped at ${fmt.pct(b.alloc.params.cap)} from exposure share.</p>
    <figure style="max-width:640px">${barChart({ items: b.alloc.byEntity.map(e => ({ label: e.name, value: e.allocated, marker: e.exposureBased, color: e.change > 0 ? CH.accent : CH.ink })), valueFormat: v => m(v), max: Math.max(...b.alloc.byEntity.map(e => Math.max(e.allocated, e.exposureBased))) * 1.15, title: 'Proposed premium by operating company' })}<figcaption>Proposed premium; the mark is the exposure-based figure.</figcaption></figure>
    <p class="note"><a href="../tcor-allocation/">Source: Cost of Risk &amp; Premium Allocation</a></p>
  </section>

  <section>
    <h2>Contracts and risk transfer</h2>
    <p>${b.contracts.atRisk.length} of ${b.contracts.rows.length} live contracts, worth ${m(b.contracts.valueAtRisk)} a year, require limits or coverages the programme does not carry; the largest cause is ${b.contracts.drivers[0].label.toLowerCase()}. ${b.plan.steps.length ? `Within a ${m(100000)} budget the plan buys ${b.plan.steps.map(s => s.name.toLowerCase()).join(', then ')} for ${m(b.plan.spent)} a year, clearing ${m(b.plan.start - b.plan.remaining)}.` : ''} ${b.contracts.uncapped.length} contracts carry an uncapped indemnity and ${b.contracts.expiring.length} expire within six months.</p>
    <p class="note"><a href="../contract-requirements/">Source: Contract Requirements &amp; Certificates</a></p>
  </section>

  <section>
    <h2>AI operations</h2>
    <p>${Object.values(b.fleet.status).filter(s => ['ok', 'held'].includes(s.state)).length} of ${Object.values(b.fleet.status).filter(s => s.state !== 'not-scheduled').length} scheduled agents completed today's run; ${b.fleet.denied.length} write${b.fleet.denied.length === 1 ? ' was' : 's were'} refused by the policy engine. Control coverage is ${fmt.pct(b.cov.share)}: ${b.cov.eligible.length} of ${b.cov.rows.length} agents are production-eligible${b.cov.gaps.length ? `; ${b.cov.gaps.map(g => byId(g.agent).name).join(', ')} remain${b.cov.gaps.length === 1 ? 's' : ''} in pilot` : ''}.</p>
    <p class="note"><a href="../agent-control-plane/">Source: Agent Control Plane</a></p>
  </section>

  <section>
    <h2>Basis of preparation</h2>
    <p class="basis">Claims are the administrator's loss run as of ${fmt.date(b.asOf)}, standardised and validated by the pipeline; quarantined rows are excluded. Ultimates are chain-ladder with a fitted tail, and Bornhuetter–Ferguson for years at or under 24 months of development, using the priced expectation as the prior. Capital is simulated over twelve quarters with a lognormal loss ratio (coefficient of variation ${fmt.pct(b.cap.params.lossRatioCv)}) and reserve deterioration (${fmt.pct(b.cap.params.reserveCv)}); the requirement is ${fmt.pct(b.cap.params.requiredPremiumFactor)} of net written premium plus ${fmt.pct(b.cap.params.requiredReserveFactor)} of reserves. Legal projections use median stage costs from this portfolio's closed matters. Allocation uses classical credibility with ${b.alloc.params.credibilityK} claims for half weight. Every figure is reproducible from the seed committed to the repository; the same brief generated tomorrow will differ only where the data does.</p>
  </section>
`;
