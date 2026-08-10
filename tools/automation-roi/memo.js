// Executive summary generation. The output is meant to be pasted straight into
// a deck or a memo — the point of the tool is not the chart, it is the paragraph
// someone can defend in a steering committee.

import { money, moneyShort, num, pct, duration, months, minutes } from '../../assets/js/fmt.js';

const WIDTH = 22;

function line(label, value) {
  return `  ${label.padEnd(WIDTH, '.')} ${value}`;
}

export function buildMemo(config, r, sens) {
  const p = config.process;
  const inScope = config.steps.filter(s => s.selected);
  const out = [];

  out.push(`AUTOMATION BUSINESS CASE — ${p.name.toUpperCase()}`);
  out.push('='.repeat(Math.min(72, p.name.length + 26)));
  out.push('');

  out.push('SCOPE');
  out.push(line('Volume', `${num(p.volumePerMonth)} instances / month`));
  out.push(line('Steps in scope', `${inScope.length} of ${config.steps.length}`));
  out.push(line('Evaluation horizon', `${p.horizonMonths} months`));
  out.push('');

  out.push('CURRENT STATE');
  out.push(line('Labour', `${num(r.hoursNow)} hrs/mo · ${num(r.fteNow, 1)} FTE · ${money(r.costNow)}/mo`));
  out.push(line('Cost per instance', money(r.costPerInstanceNow)));
  out.push(line('Touch per instance', minutes(r.touchPerInstanceNow)));
  out.push(line('End-to-end elapsed', duration(r.cycleNow)));
  if (r.bottleneckHours) {
    out.push(line('Largest labour step', `${r.bottleneckHours.name} (${num(r.bottleneckHours.hours)} hrs/mo)`));
  }
  if (r.bottleneckCycle) {
    out.push(line('Largest delay step', `${r.bottleneckCycle.name} (${duration(r.bottleneckCycle.elapsed)})`));
  }
  out.push('');

  out.push('PROPOSED STATE');
  out.push(line('Labour', `${num(r.hoursNext)} hrs/mo · ${num(r.fteNext, 1)} FTE · ${money(r.costNext)}/mo`));
  out.push(line('Cost per instance', money(r.costPerInstanceNext)));
  out.push(line('End-to-end elapsed', `${duration(r.cycleNext)} (${pct(r.cycleSavedPct, 0)} faster)`));
  out.push(line('Capacity released', `${num(r.fteReleased, 1)} FTE`));
  out.push(line('Volume headroom', Number.isFinite(r.headroom)
    ? `+${num(r.headroom)} instances/mo at current headcount`
    : 'unbounded (all touch time removed)'));
  out.push('');

  out.push('BUSINESS CASE');
  out.push(line('One-time build', money(r.buildCost)));
  out.push(line('Recurring run cost', `${money(r.runCost)}/mo`));
  out.push(line('Gross labour saving', `${money(r.monthlyGross)}/mo`));
  out.push(line('Net saving', `${money(r.monthlyNet)}/mo · ${money(r.annualNet)}/yr`));
  out.push(line('Payback', months(r.paybackMonths)));
  out.push(line(`Net at ${p.horizonMonths} months`, money(r.horizonNet)));
  out.push('');

  if (r.ranked.length) {
    out.push('SEQUENCING — BY PAYBACK');
    r.ranked.slice(0, 8).forEach((d, i) => {
      const mark = inScope.some(s => s.id === d.id) ? '*' : ' ';
      out.push(`  ${mark}${String(i + 1).padStart(2)}. ${d.name}`);
      out.push(`      ${months(d.payback)} payback · ${money(d.annualNet)}/yr net · ${money(d.buildCost)} build`);
    });
    out.push('  (* = included in the scenario above)');
    out.push('');
  }

  if (sens && sens.length) {
    out.push(`WHAT MOVES THE ANSWER — ±25% on ${p.horizonMonths}-month net`);
    sens.slice(0, 5).forEach(d => {
      out.push(`  ${d.label.padEnd(WIDTH)} ${moneyShort(d.low).padStart(9)}  ${moneyShort(d.high).padStart(9)}`);
    });
    out.push('');
  }

  out.push('ASSUMPTIONS AND LIMITS');
  out.push('  - Steps are costed on expected passes: a step with rework rate x runs');
  out.push('    1/(1-x) times on average. Ignoring this understates current cost.');
  out.push('  - Automation removes a share of touch time from the labour pool. The');
  out.push('    residual manual share keeps its original rework rate, which is');
  out.push('    conservative — automation usually suppresses rework as well.');
  out.push('  - Released capacity is stated in FTE-equivalents, not in headcount');
  out.push('    reductions. Converting one to the other is an organisational');
  out.push('    decision this model does not make.');
  out.push('  - Elapsed time is the sum of queue time and expected touch time. It');
  out.push('    does not model contention, batching, or working-hour boundaries.');
  out.push('  - No discount rate is applied. At these horizons and margins the');
  out.push('    ranking does not change; the absolute net would fall modestly.');
  out.push('  - Build and run costs are inputs, not estimates. They are the single');
  out.push('    largest source of error in any case of this shape.');
  out.push('');
  out.push('Figures are illustrative and derived from the inputs shown. Not actuarial,');
  out.push('accounting, or legal advice.');

  return out.join('\n');
}
