import { generateBook } from '../../data/book.mjs';
import { derivePaymentPattern, openingPosition, simulate, capitalForTolerance } from './engine.mjs';
import { fmt } from '../../lib/format.mjs';
import { $, table, readParams, bindOutputs } from '../../lib/dom.mjs';
import { fanChart } from '../../lib/svg.mjs';

const book = generateBook();
const pat = derivePaymentPattern(book);
const opening = openingPosition(book);
const controls = $('#controls');
$('#expectedLossRatio').value = opening.expectedLossRatio.toFixed(3);
bindOutputs(controls);

const QLABEL = q => q === 0 ? 'Open' : `Q${((q - 1) % 4) + 1} ${2026 + Math.floor((q - 1) / 4)}–${String(2027 + Math.floor((q - 1) / 4)).slice(2)}`;

let timer = null;
controls.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 90); });
render();

function render() {
  const p = readParams(controls);
  const base = simulate(p, opening, pat);
  const need = capitalForTolerance(p, opening, pat, p.tolerance);
  const H = p.horizonQuarters || 12;

  const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const injection = need.capital === null ? null : need.capital - p.startingCapital;
  const aggAlt = simulate({ ...p, aggregate: !p.aggregate }, opening, pat);
  const aggSentence = p.aggregate
    ? `The aggregate stop-loss as priced, attaching at ${fmt.pct(p.aggregateAttach)} of expected loss for ${fmt.pct(p.aggregateCost, 1)} of premium, ${base.breachAny <= aggAlt.breachAny ? 'lowers' : 'raises'} the breach probability from ${fmt.pct(aggAlt.breachAny, 1)} to ${fmt.pct(base.breachAny, 1)}${base.breachAny > aggAlt.breachAny ? ': at this attachment it costs more certain capital than it protects' : ''}.`
    : `Buying an aggregate stop-loss at ${fmt.pct(p.aggregateAttach)} of expected loss for ${fmt.pct(p.aggregateCost, 1)} of premium would ${aggAlt.breachAny <= base.breachAny ? 'lower' : 'raise'} the breach probability to ${fmt.pct(aggAlt.breachAny, 1)}.`;
  $('#finding').innerHTML = `
    <p>With ${fmt.money(p.startingCapital, { compact: true })} of capital, the captive has a ${fmt.pct(base.breachAny, 1)} chance of falling below ${p.threshold.toFixed(2)}× its capital requirement at some point in the next ${H} quarters${base.breachAny > 0.005 && base.breachQ !== null ? `, first crossing most often ${base.breachQ === 0 ? 'at the opening position' : 'in ' + QLABEL(base.breachQ)}` : ''}. ${injection === null ? 'No amount of capital inside the search range holds that under the tolerance.' : injection > 0 ? `Holding ${fmt.money(need.capital, { compact: true })}, an injection of ${fmt.money(injection, { compact: true })}, would bring it under ${fmt.pct(p.tolerance)}.` : `That is already inside the ${fmt.pct(p.tolerance)} tolerance; ${fmt.money(-injection, { compact: true })} could be released and stay within it.`}</p>
    <p>${aggSentence}</p>`;
  $('#stats').innerHTML =
    stat(fmt.pct(base.breachAny, 1), 'Probability of breach', `at any quarter; ${fmt.pct(base.breachEnd, 1)} at the horizon`, base.breachAny > p.tolerance ? 'accent' : '') +
    stat(need.capital === null ? '—' : fmt.money(need.capital, { compact: true }), `Capital for ${fmt.pct(p.tolerance)} tolerance`, injection === null ? '' : injection > 0 ? `${fmt.money(injection, { compact: true })} more than today` : `${fmt.money(-injection, { compact: true })} less than today`) +
    stat(base.minRatioMedian.toFixed(2) + '×', 'Median low point', `capital ÷ required; ${base.ratio.p5[H].toFixed(2)}× at the 5th percentile, horizon`) +
    stat(fmt.money(base.endCapitalMedian, { compact: true }), 'Median capital at horizon', `${fmt.money(base.capital.p5[H], { compact: true })} at the 5th percentile${base.dividendsMedian > 0 ? `; ${fmt.money(base.dividendsMedian, { compact: true })} paid out` : ''}`);

  const x = Array.from({ length: H + 1 }, (_, q) => q);
  $('#ratio-chart').innerHTML = fanChart({
    x, bands: [{ lo: base.ratio.p5, hi: base.ratio.p95, opacity: 0.12 }, { lo: base.ratio.p25, hi: base.ratio.p75, opacity: 0.2 }], median: base.ratio.p50,
    yFormat: v => v.toFixed(1) + '×', xFormat: q => q === 0 ? 'open' : 'Q' + q, reference: p.threshold, referenceLabel: `breach at ${p.threshold.toFixed(2)}×`, width: 800, height: 300, title: 'Capital adequacy ratio by quarter',
  }) + '<figcaption>Capital divided by required capital, by quarter from the evaluation date.</figcaption>';
  $('#capital-chart').innerHTML = fanChart({
    x, bands: [{ lo: base.capital.p5, hi: base.capital.p95, opacity: 0.12 }, { lo: base.capital.p25, hi: base.capital.p75, opacity: 0.2 }], median: base.capital.p50,
    yFormat: v => fmt.money(v, { compact: true }), xFormat: q => q === 0 ? 'open' : 'Q' + q, reference: null, width: 800, height: 260, title: 'Capital by quarter',
  }) + '<figcaption>Capital in dollars. Premium above expected loss and expense builds it; a bad year or reserve deterioration on the opening book takes it down.</figcaption>';

  // scenarios
  const scen = [
    { name: 'As configured', changes: {} },
    { name: p.aggregate ? 'Without the aggregate stop-loss' : 'With an aggregate stop-loss', changes: { aggregate: !p.aggregate } },
    { name: 'Expected loss ratio +10 points', changes: { expectedLossRatio: p.expectedLossRatio + 0.10 } },
    { name: 'Opening reserves deteriorate 15%', changes: { reserveShock: p.reserveShock * 1.15 } },
    { name: 'Volatility doubled', changes: { lossRatioCv: Math.min(0.6, p.lossRatioCv * 2) } },
    { name: 'No premium growth', changes: { premiumGrowth: 0 } },
    { name: 'Claims paid 50% faster', changes: { paymentSpeed: p.paymentSpeed * 1.5 } },
    { name: 'Investment yield halved', changes: { investmentYield: p.investmentYield / 2 } },
  ];
  const rows = scen.map(s => {
    const q = { ...p, ...s.changes };
    const r = simulate(q, opening, pat);
    const n = capitalForTolerance(q, opening, pat, p.tolerance);
    return { name: s.name, breach: r.breachAny, low: r.minRatioMedian, end: r.endCapitalMedian, p5: r.capital.p5[H], need: n.capital, _class: r.breachAny > p.tolerance ? 'flag' : '' };
  });
  $('#scenarios').innerHTML = table([
    { key: 'name', label: 'Scenario' },
    { key: 'breach', label: 'P(breach)', num: true, render: v => fmt.pct(v, 1) },
    { key: 'low', label: 'Median low point', num: true, render: v => v.toFixed(2) + '×' },
    { key: 'end', label: 'Median capital, horizon', num: true, render: v => fmt.money(v, { compact: true }) },
    { key: 'p5', label: '5th percentile, horizon', num: true, render: v => fmt.money(v, { compact: true }) },
    { key: 'need', label: `Capital for ${fmt.pct(p.tolerance)}`, num: true, render: v => v === null ? '—' : fmt.money(v, { compact: true }) },
  ], rows, { caption: 'One change at a time, same random draws' });

  // quarters
  $('#quarters').innerHTML = table([
    { key: 'q', label: 'Quarter', render: v => QLABEL(v) },
    { key: 'assets', label: 'Assets', num: true, render: v => fmt.money(v, { compact: true }) },
    { key: 'reserves', label: 'Reserves', num: true, render: v => fmt.money(v, { compact: true }) },
    { key: 'capital', label: 'Capital', num: true, render: v => fmt.money(v, { compact: true }) },
    { key: 'ratio', label: 'Ratio, median', num: true, render: v => v.toFixed(2) + '×' },
    { key: 'p5', label: 'Ratio, 5th pct', num: true, render: v => v.toFixed(2) + '×' },
  ], x.map(q => ({ q, assets: base.assets.p50[q], reserves: base.reserves.p50[q], capital: base.capital.p50[q], ratio: base.ratio.p50[q], p5: base.ratio.p5[q], _class: base.ratio.p5[q] < p.threshold ? 'flag' : '' })), { caption: 'Medians by quarter; rows where the 5th percentile breaches are marked' });
}
