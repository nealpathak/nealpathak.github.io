// findings.js — turning a distribution into things somebody can act on.
//
// A percentile is not a finding. A finding names what is wrong, says how much
// it is worth, and says who can fix it before the next renewal.

import { short, pct, returnPeriod } from '../../assets/js/fmt.js';
import { PERIL_META, COVERAGE_NOTES } from './assume.js';

const SEV = { critical: 3, high: 2, note: 1 };

export function deriveFindings(ctx) {
  const { contracts, program, prepared, result, ranked } = ctx;
  const out = [];
  const retained = result.retained.mean;
  const gross = result.gross.mean;

  /* -------------------------------------------- retention of own loss --- */
  if (gross > 0) {
    const share = retained / gross;
    if (share >= 0.45) {
      out.push({
        severity: share >= 0.65 ? 'critical' : 'high',
        title: `The programme transfers ${pct(1 - share, 0)} of what the book produces`,
        detail: `Modelled contractual loss runs at ${short(gross)} a year. ${short(result.transferred.mean)} of that reaches a third-party carrier. The remaining ${short(retained)} stays with the group — inside the retention, inside the captive, above the tower, or in classes nothing covers.`,
        action: 'Treat the retained figure as the risk budget it is. It is larger than the premium and it is not on anyone\'s forecast.',
      });
    }
  }

  /* ------------------------------------------------ nothing responds ----- */
  const noForm = result.split.uninsuredByForm;
  if (noForm > 0 && retained > 0 && noForm / retained >= 0.04) {
    const perils = result.byPeril
      .filter((p) => p.retained > 0)
      .map((p) => ({ ...p, insured: prepared.meta.some((m) => m.peril === p.peril && m.covered) }))
      .filter((p) => !p.insured)
      .sort((a, b) => b.retained - a.retained);
    const names = perils.map((p) => `${PERIL_META[p.peril].label} (${short(p.retained)} a year)`).join(' and ');
    out.push({
      severity: 'critical',
      title: `${short(noForm)} a year sits in classes where no policy responds`,
      detail: `This is not a limit that ran out. It is ${names} — exposure the register created and the schedule of insurance was never written to answer. ${perils.map((p) => COVERAGE_NOTES[p.peril]).filter(Boolean).join(' ')}`,
      action: 'Two options, and both are decisions rather than accidents: buy the standalone cover, or stop agreeing to the obligation. Doing neither is the current position.',
    });
  }

  /* ------------------------------------------------------- defence cost --- */
  if (result.defence && result.defence.total > 0) {
    const d = result.defence;
    const insideLines = prepared.lines.filter((l) => !l.defenceOutside && l.layers.length).map((l) => l.code);
    out.push({
      severity: d.retained / Math.max(retained, 1) >= 0.2 ? 'high' : 'note',
      title: `Defence costs are ${pct(d.shareOfGross, 0)} of the loss, and ${short(d.retained)} of it is yours`,
      detail: `Defending these claims runs at ${short(d.total)} a year on top of what is paid to settle them. A liability cap caps damages; it does not cap what your own lawyers cost, so this sits outside every ceiling in the register.${insideLines.length ? ` Worse, on ${insideLines.join(' and ')} defence erodes the limit — ${short(d.erodingLimits)} a year of capacity you bought is consumed before a settlement is signed.` : ''}`,
      action: insideLines.length
        ? 'Ask the broker what defence-outside-the-limit costs on renewal, and price it against the capacity it gives back. It is often cheaper than buying the equivalent limit.'
        : 'Keep defence in the risk budget. It is the largest line item that never appears in a contract summary.',
    });
  }

  /* -------------------------------------------- aggregate exhaustion ----- */
  result.aggregates
    .filter((a) => a.exhaustionProb >= 0.12)
    .sort((a, b) => b.exhaustionProb - a.exhaustionProb)
    .forEach((a) => {
      const layers = prepared.lines.flatMap((l) => l.layers.filter((x) => prepared.aggGroupIds[x.aggIdx] === a.group));
      const band = layers.length
        ? `${short(Math.min(...layers.map((l) => l.attach)))} to ${short(Math.max(...layers.map((l) => l.top)))}`
        : 'its band';
      const above = prepared.lines.flatMap((l) => l.layers).filter((x) => prepared.aggGroupIds[x.aggIdx] !== a.group && x.attach >= Math.max(...layers.map((l) => l.top)) - 1);
      out.push({
        severity: a.exhaustionProb >= 0.4 ? 'critical' : 'high',
        title: `${a.group} is exhausted in ${pct(a.exhaustionProb, 0)} of years`,
        detail: `${short(a.available)} of aggregate stands behind everything routed through this group${a.eroded > 0 ? `, after ${short(a.eroded)} already eroded this period` : ''}. The simulation spends ${short(a.meanUsed)} of it in an average year — ${returnPeriod(a.exhaustionProb)} it runs out entirely. Once it does, loss in the ${band} band is retained in full${above.length ? ', and the layer above does not drop down to meet it' : ''}.`,
        action: 'Reinstatement, a higher aggregate, or a buffer layer. Whichever is cheapest, the current structure is being priced as though this band is covered when for much of the year it is not.',
      });
    });

  /* ---------------------------------------------------- tower gaps ------- */
  program.issues.filter((i) => /gap/.test(i.msg)).forEach((i) => {
    out.push({
      severity: 'high',
      title: 'The tower has an unfilled band',
      detail: i.msg,
      action: 'Fill it or write it down deliberately. A gap between layers is the one exposure that is entirely a drafting decision.',
    });
  });

  /* ----------------------------------------------- caps and carve-outs --- */
  const uncapped = contracts.filter((c) => !isFinite(c.cap));
  if (uncapped.length) {
    const value = uncapped.reduce((s, c) => s + c.annualValue, 0);
    out.push({
      severity: uncapped.length / contracts.length >= 0.08 ? 'high' : 'note',
      title: `${uncapped.length} contract${uncapped.length === 1 ? '' : 's'} carr${uncapped.length === 1 ? 'ies' : 'y'} no liability cap at all`,
      detail: `${uncapped.length === 1 ? 'It represents' : 'They represent'} ${short(value)} of annual contract value. Every one of them is unbounded on every peril class, which is why they populate the tail out of proportion to their size.`,
      action: 'A cap on these is the cheapest exposure reduction available — it costs a redline, not a premium.',
    });
  }

  const carved = contracts.filter((c) => Object.keys(c.carveouts).some((k) => k !== 'GROSS'));
  if (carved.length / Math.max(1, contracts.length) >= 0.3) {
    const byPeril = {};
    contracts.forEach((c) => Object.keys(c.carveouts).forEach((k) => { if (k !== 'GROSS') byPeril[k] = (byPeril[k] || 0) + 1; }));
    const list = Object.entries(byPeril).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${PERIL_META[k].label} on ${n}`).join(', ');
    out.push({
      severity: 'high',
      title: `${pct(carved.length / contracts.length, 0)} of the book has a cap that does not hold`,
      detail: `${carved.length} of ${contracts.length} contracts carve at least one peril out of their own liability cap — ${list}. The cap recorded in the register is not the ceiling on those classes, and any exposure report built from the cap field understates them by an unbounded amount.`,
      action: 'The carve-out, not the cap, is the negotiation. Converting an uncapped carve-out to a supercap is usually acceptable to counterparties and is the single highest-value redline in the playbook.',
    });
  }

  /* --------------------------------------------- tail concentration ------ */
  if (ranked && ranked.length) {
    const totalTail = ranked.reduce((s, r) => s + r.tail, 0);
    const topTen = ranked.slice(0, 10);
    const topShare = totalTail > 0 ? topTen.reduce((s, r) => s + r.tail, 0) / totalTail : 0;
    // Only worth saying when the book is big enough for concentration to mean something.
    if (topShare >= 0.3 && contracts.length > topTen.length * 1.5) {
      const named = topTen.slice(0, 3).map((r) => r.id).join(', ');
      const others = topTen.length - 3;
      out.push({
        severity: 'note',
        title: `${topTen.length} contracts drive ${pct(topShare, 0)} of the tail`,
        detail: `In the worst one per cent of simulated years, ${named}${others > 0 ? ` and ${others} others` : ''} account for most of what the group retains, out of ${contracts.length} agreements. They are not the largest contracts — they are the ones whose ceilings are highest relative to what the programme will answer for.`,
        action: 'This is a short enough list to actually work. It is the renegotiation queue.',
      });
    }
    const soon = topTen.filter((r) => isRenewingWithin(r.renewal, 365));
    if (soon.length) {
      out.push({
        severity: 'note',
        title: `${soon.length} of the top ${topTen.length} renew within twelve months`,
        detail: `${soon.map((r) => `${r.id} (${r.renewal})`).join(', ')}. Renewal is the only moment a cap or a carve-out can be reopened without asking for a favour.`,
        action: 'Put the carve-out language into the renewal brief for these before the commercial terms are agreed, not after.',
      });
    }
  }

  /* ------------------------------------------------------- the captive --- */
  if (result.split.captive > 0) {
    const captiveLayers = prepared.lines.flatMap((l) => l.layers).filter((l) => l.captive);
    if (captiveLayers.length) {
      out.push({
        severity: 'note',
        title: 'Captive recoveries are counted as retained, not transferred',
        detail: `${short(result.split.captive)} a year is recovered from ${captiveLayers.length === 1 ? 'the captive layer' : 'captive layers'}. On a consolidated basis that is the group paying itself, so the model reports it inside retained exposure. Programme summaries that show it as recovery overstate transfer by that amount.`,
        action: 'Keep the distinction in board reporting. The captive changes when and how the loss is funded; it does not change who bears it.',
      });
    }
  }

  return out.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
}

function isRenewingWithin(dateStr, days) {
  if (!dateStr) return false;
  const t = Date.parse(dateStr);
  if (!isFinite(t)) return false;
  const delta = (t - Date.now()) / 86400000;
  return delta >= 0 && delta <= days;
}

/** Rank contracts by their average retained loss inside the worst one per cent of years. */
export function rankContributors(contracts, result, limit = 25) {
  const tail = result.perContract.tail;
  if (!tail) return [];
  return Array.from(tail)
    .map((v, i) => ({
      id: contracts[i].id,
      counterparty: contracts[i].counterparty,
      category: contracts[i].category,
      annualValue: contracts[i].annualValue,
      cap: contracts[i].cap,
      carveouts: contracts[i].carveoutsRaw,
      renewal: contracts[i].renewal,
      owner: contracts[i].owner,
      expected: result.perContract.retained[i],
      tail: v,
      index: i,
    }))
    .filter((r) => r.tail > 0)
    .sort((a, b) => b.tail - a.tail)
    .slice(0, limit);
}
