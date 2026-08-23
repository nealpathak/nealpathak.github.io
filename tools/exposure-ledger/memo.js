// memo.js — the run, written up the way it has to be read.
//
// The output of a risk model is not a chart. It is a document somebody signs
// their name under and takes into a room. This generates that document from the
// run itself, so the figures in the memo and the figures on screen cannot drift.

import { short, dollars, pct, returnPeriod, today, toCSV } from '../../assets/js/fmt.js';
import { PERIL_META, CATEGORIES } from './assume.js';
import { LANDING } from './charts.js';

export function boardMemo(ctx) {
  const { contracts, program, prepared, result, settings, findings, ranked, levers } = ctx;
  const bookValue = contracts.reduce((s, c) => s + c.annualValue, 0);
  const sumCaps = contracts.reduce((s, c) => s + (isFinite(c.cap) ? c.cap : 0), 0);
  const uncapped = contracts.filter((c) => !isFinite(c.cap)).length;
  const premium = prepared.lines.flatMap((l) => l.layers).reduce((s, l) => s + (l.premium || 0), 0);

  const L = [];
  const w = (s = '') => L.push(s);

  w('# Retained contractual exposure');
  w('');
  w(`**Prepared** ${today()}  ·  **Register** ${contracts.length} contracts, ${short(bookValue)} annual value  ·  **Programme** ${prepared.lines.flatMap((l) => l.layers).length} layers across ${prepared.lines.length} lines`);
  w('');
  w('---');
  w('');

  w('## The number');
  w('');
  w(`On the register and programme as loaded, the group retains an expected **${short(result.retained.mean)} a year** of contractual loss. A one-in-ten year costs **${short(result.retained.p90)}**. A one-in-one-hundred year costs **${short(result.retained.p99)}**, and the average of the worst one per cent of years is **${short(result.retained.tvar99)}**.`);
  w('');
  w(`Gross modelled loss across the book is ${short(result.gross.mean)} a year, of which ${short(result.transferred.mean)} reaches a third-party carrier. ${premium > 0 ? `Programme premium as entered is ${short(premium)}. ` : ''}The retained figure is what remains after the programme has done everything it was bought to do.`);
  w('');
  w(`For contrast, the sum of every liability cap in the register is ${short(sumCaps)}${uncapped ? ` across the ${contracts.length - uncapped} contracts that have one; ${uncapped} carry no cap at all` : ''}. That figure is commonly quoted as contractual exposure. It is not an exposure — it is the arithmetic result of assuming every counterparty sues for their full cap in the same year, and it is silent on the classes that escape the cap entirely.`);
  w('');

  w('## Where the loss lands');
  w('');
  w('| | Per year | Share of gross |');
  w('|---|---:|---:|');
  LANDING.forEach((l) => {
    const v = result.split[l.key] || 0;
    w(`| ${l.label} | ${dollars(v)} | ${pct(result.gross.mean > 0 ? v / result.gross.mean : 0)} |`);
  });
  w(`| **Gross modelled loss** | **${dollars(result.gross.mean)}** | |`);
  w('');
  w('Only the first line is risk transfer. Everything below it is the group paying, on a different schedule.');
  w('');

  w('## By peril class');
  w('');
  w('| Class | Claims a year | Gross | Retained | Retained share |');
  w('|---|---:|---:|---:|---:|');
  result.byPeril.filter((p) => p.gross > 0).forEach((p) => {
    w(`| ${PERIL_META[p.peril].label} | ${p.claims.toFixed(2)} | ${dollars(p.gross)} | ${dollars(p.retained)} | ${pct(p.gross > 0 ? p.retained / p.gross : 0, 0)} |`);
  });
  w('');

  w('## Shared limits');
  w('');
  w('| Aggregate | Capacity | Already eroded | Available | Spent in an average year | Exhausted in |');
  w('|---|---:|---:|---:|---:|---:|');
  result.aggregates.forEach((a) => {
    w(`| ${a.group} | ${dollars(a.capacity)} | ${dollars(a.eroded)} | ${dollars(a.available)} | ${dollars(a.meanUsed)} | ${pct(a.exhaustionProb, 1)} of years |`);
  });
  w('');

  if (findings.length) {
    w('## Findings');
    w('');
    findings.forEach((f, i) => {
      w(`### ${i + 1}. ${f.title}`);
      w('');
      w(f.detail);
      w('');
      w(`*What to do:* ${f.action}`);
      w('');
    });
  }

  if (ranked.length) {
    w('## Renegotiation queue');
    w('');
    w(`Ranked by average retained loss inside the worst one per cent of simulated years — not by contract size. This is the order in which reopening a cap buys the most protection.`);
    w('');
    w('| # | Contract | Counterparty | Annual value | Cap | Carve-outs | Renews | Tail contribution |');
    w('|---:|---|---|---:|---:|---|---|---:|');
    ranked.slice(0, 15).forEach((r, i) => {
      w(`| ${i + 1} | ${r.id} | ${r.counterparty} | ${dollars(r.annualValue)} | ${isFinite(r.cap) ? dollars(r.cap) : '**none**'} | ${r.carveouts || '—'} | ${r.renewal || '—'} | ${dollars(r.tail)} |`);
    });
    w('');
  }

  if (levers && levers.length) {
    w('## Levers priced');
    w('');
    w('| Lever | Cost | Expected retained | 1-in-100 retained | Tail removed | Cost per dollar of tail removed |');
    w('|---|---:|---:|---:|---:|---:|');
    levers.forEach((lv) => {
      const removed = result.retained.p99 - lv.p99;
      w(`| ${lv.label} | ${lv.cost > 0 ? dollars(lv.cost) : 'redline only'} | ${dollars(lv.mean)} | ${dollars(lv.p99)} | ${dollars(removed)} | ${removed > 0 && lv.cost > 0 ? (lv.cost / removed).toFixed(3) : removed > 0 ? '—' : 'no reduction'} |`);
    });
    w('');
    w('A lever that costs a redline and removes tail is strictly better than a lever that costs premium and removes the same tail. The queue above is where those redlines are.');
    w('');
  }

  w('## Method and assumptions');
  w('');
  w(`Each contract is decomposed into five peril classes. Each class is given the ceiling that actually applies to it — the general liability cap, a carve-out supercap, or none where the class is carved out of the cap entirely. Gross negligence is treated as uncapped whether or not the contract says so. Each class is routed to the policy line that answers for it, or to no line where no standard form responds.`);
  w('');
  w(`The whole book is then simulated together for ${settings.trials.toLocaleString()} years. Claim counts are Poisson, severities lognormal with a coefficient of variation of ${settings.severityCV}, both scaled sub-linearly with annual contract value. Within each simulated year, losses are allocated up the tower layer by layer and shared aggregates erode as they are used, so a claim on one contract reduces the limit standing behind every other contract routed through the same aggregate. Uncapped classes are truncated at ${short(settings.uncappedTruncation)} so the mean stays finite.`);
  w('');
  w(`The simulation is seeded with **${settings.seed}**. The same register, the same programme and the same seed return the same figures, on any machine, at any time.`);
  w('');
  w('**The frequency and severity assumptions are a starting position, not a finding.** They describe a generic mid-to-large US corporate book. Any organisation with three or more years of its own loss history should replace them using the calibration panel, and the figures above should be regarded as provisional until it has.');
  w('');
  w('**Not modelled:** coverage disputes and reservation of rights, defence costs inside versus outside the limit, claims-made triggers and retroactive dates, reinstatements, deductible corridors, currency, and the time value of money on funded retentions. Each of these moves the answer.');
  w('');
  w('This is an operational model prepared to structure a conversation with the broker, the actuary and the audit committee. It is not an actuarial opinion and does not replace one.');
  w('');

  return L.join('\n');
}

/* -------------------------------------------------------------- exports --- */

export function contractCSV(contracts, result, ranked) {
  const tailBy = new Map(ranked.map((r) => [r.index, r.tail]));
  const header = [
    'contract_id', 'counterparty', 'category', 'annual_value', 'cap_type', 'cap_applied',
    'cap_carveouts', 'renewal_date', 'owner', 'expected_retained_per_year', 'tail_contribution_p99',
  ];
  const rows = contracts.map((c, i) => [
    c.id, c.counterparty, CATEGORIES[c.category] ? CATEGORIES[c.category].label : c.category,
    Math.round(c.annualValue), c.capType, isFinite(c.cap) ? Math.round(c.cap) : 'UNCAPPED',
    c.carveoutsRaw, c.renewal, c.owner,
    Math.round(result.perContract.retained[i]),
    Math.round(tailBy.get(i) || 0),
  ]);
  rows.sort((a, b) => b[10] - a[10]);
  return toCSV(header, rows);
}

export function findingsCSV(findings) {
  return toCSV(['severity', 'finding', 'detail', 'action'],
    findings.map((f) => [f.severity, f.title, f.detail, f.action]));
}

export function aggregateCSV(result) {
  return toCSV(
    ['aggregate_group', 'capacity', 'already_eroded', 'available', 'mean_used_per_year', 'exhaustion_probability'],
    result.aggregates.map((a) => [
      a.group, Math.round(a.capacity), Math.round(a.eroded), Math.round(a.available),
      Math.round(a.meanUsed), a.exhaustionProb.toFixed(4),
    ]),
  );
}

/** The exceedance curve as a table, for anyone who wants to rebuild the chart. */
export function exceedanceCSV(result) {
  const d = result.distribution;
  const n = d.length;
  const rows = [1.25, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
    .filter((rp) => rp <= n / 5)
    .map((rp) => {
      const q = 1 - 1 / rp;
      return [rp, Math.round(d[Math.min(n - 1, Math.floor(q * (n - 1)))]), returnPeriod(1 / rp)];
    });
  return toCSV(['return_period_years', 'retained_loss', 'reads_as'], rows);
}
